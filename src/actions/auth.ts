"use server";

import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { clientIp, createSession, destroySession } from "@/lib/auth";
import { findBannedWord } from "@/lib/banned-words";
import { CodeError, consumeCode, isCodePurpose, issueCode } from "@/lib/codes";
import { qqEmail } from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkLimit, consume, recordHit, retryText } from "@/lib/rate-limit";
import { loginSchema, qqSchema, registerSchema, resetPasswordSchema, zodErrors } from "@/lib/validation";
import { formValues, safeNext, type FormState } from "./types";

const HOUR = 60 * 60_000;
const QUARTER = 15 * 60_000;

async function loadBannedWords(): Promise<string[]> {
  const rows = await db.select({ word: schema.bannedWords.word }).from(schema.bannedWords);
  return rows.map((r) => r.word);
}

async function isBlacklisted(type: "qq" | "phone", value: string) {
  const [row] = await db
    .select({ id: schema.blacklist.id })
    .from(schema.blacklist)
    .where(and(eq(schema.blacklist.type, type), eq(schema.blacklist.value, value)))
    .limit(1);
  return !!row;
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function ipKey(scope: string) {
  return `${scope}:ip:${(await clientIp()) ?? "unknown"}`;
}

/**
 * 发验证码。对外只说「已发送（若符合条件）」，不暴露某个 QQ 是否已注册。
 * 限流：按 IP 每小时 20 条，按目标 60 秒一条、每天 10 条。
 */
export async function sendCode(purposeRaw: unknown, qqRaw: string): Promise<{ ok: boolean; message: string }> {
  if (!isCodePurpose(purposeRaw) || purposeRaw === "change_qq") return { ok: false, message: "请求无效，请刷新后重试" };
  const purpose = purposeRaw;
  const parsed = qqSchema.safeParse(qqRaw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const qq = parsed.data;

  const rl = consume(await ipKey("code"), 20, HOUR);
  if (!rl.ok) return { ok: false, message: `发送太频繁，请 ${retryText(rl.retryAfterMs)} 后再试` };

  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.qq, qq)).limit(1);
  const eligible = purpose === "register" ? !existing && !(await isBlacklisted("qq", qq)) : !!existing;
  const generic = purpose === "register" ? `验证码已发送到 ${qqEmail(qq)}。若该 QQ 已注册或不可注册，不会收到邮件。` : `验证码已发送到 ${qqEmail(qq)}。若该 QQ 未注册，不会收到邮件。`;
  if (!eligible) return { ok: true, message: generic };

  try {
    await issueCode(qqEmail(qq), purpose);
  } catch (e) {
    if (e instanceof CodeError) return { ok: false, message: e.message };
    console.error("[sendCode]", e);
    return { ok: false, message: "验证码发送失败，请稍后再试" };
  }
  return { ok: true, message: generic };
}

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, ["username", "qq", "phone", "next"]);
  const parsed = registerSchema.safeParse({
    username: form.get("username"),
    password: form.get("password"),
    qq: form.get("qq"),
    phone: form.get("phone"),
    code: form.get("code"),
    agree: form.get("agree"),
  });
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const d = parsed.data;

  const rl = consume(await ipKey("register"), 10, HOUR);
  if (!rl.ok) return { message: `注册太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`, values };

  const bad = findBannedWord(d.username, await loadBannedWords());
  if (bad) return { errors: { username: `用户名包含违禁词「${bad}」` }, values };

  const [dupName] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.username}) = lower(${d.username})`)
    .limit(1);
  if (dupName) return { errors: { username: "用户名已被使用" }, values };
  const [dupQq] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.qq, d.qq)).limit(1);
  if (dupQq) return { errors: { qq: "该 QQ 已注册" }, values };
  const [dupPhone] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, d.phone)).limit(1);
  if (dupPhone) return { errors: { phone: "该手机号已注册" }, values };
  if ((await isBlacklisted("qq", d.qq)) || (await isBlacklisted("phone", d.phone))) {
    return { message: "该 QQ 或手机号无法注册", values };
  }

  try {
    await consumeCode(qqEmail(d.qq), "register", d.code);
  } catch (e) {
    if (e instanceof CodeError) return { errors: { code: e.message }, values };
    throw e;
  }

  let userId: number;
  try {
    const [user] = await db
      .insert(schema.users)
      .values({
        username: d.username,
        passwordHash: await hashPassword(d.password),
        qq: d.qq,
        qqVerifiedAt: new Date(),
        phone: d.phone,
      })
      .returning({ id: schema.users.id });
    userId = user.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { message: "用户名、QQ 或手机号刚刚被别人注册了，请检查后重试", values };
    throw e;
  }

  await createSession(userId);
  redirect(safeNext(values.next));
}

/**
 * 登录。失败计数：按 IP 15 分钟 30 次，按账号 15 分钟 10 次。
 * 全数字账号先按 QQ 查，查不到再按用户名查。
 */
export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, ["account", "next"]);
  const parsed = loginSchema.safeParse({ account: form.get("account"), password: form.get("password") });
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const { account, password } = parsed.data;

  const ipK = await ipKey("login");
  const acctK = `login:acct:${account.toLowerCase()}`;
  const ipRl = checkLimit(ipK, 30);
  const acctRl = checkLimit(acctK, 10);
  if (!ipRl.ok || !acctRl.ok) {
    return { message: `登录失败次数过多，请 ${retryText(Math.max(ipRl.retryAfterMs, acctRl.retryAfterMs))} 后再试`, values };
  }

  let user: typeof schema.users.$inferSelect | undefined;
  if (/^\d{5,12}$/.test(account)) {
    [user] = await db.select().from(schema.users).where(eq(schema.users.qq, account)).limit(1);
  }
  if (!user) {
    [user] = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.username}) = lower(${account})`)
      .limit(1);
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordHit(ipK, QUARTER);
    recordHit(acctK, QUARTER);
    return { message: "账号或密码不正确", values };
  }

  await createSession(user.id);
  redirect(safeNext(values.next));
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, ["qq"]);
  const parsed = resetPasswordSchema.safeParse({
    qq: form.get("qq"),
    code: form.get("code"),
    password: form.get("password"),
  });
  if (!parsed.success) return { errors: zodErrors(parsed.error), values };
  const d = parsed.data;

  const rl = consume(await ipKey("reset"), 10, HOUR);
  if (!rl.ok) return { message: `重置太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`, values };

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.qq, d.qq)).limit(1);
  // 未注册的 QQ 不会有验证码记录，走同一个「验证码不正确 / 已过期」分支，不单独暴露
  try {
    await consumeCode(qqEmail(d.qq), "reset_password", d.code);
  } catch (e) {
    if (e instanceof CodeError) return { errors: { code: e.message }, values };
    throw e;
  }
  if (!user) return { errors: { code: "验证码不正确" }, values };

  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash: await hashPassword(d.password) }).where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  });
  redirect("/login?reset=1");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
