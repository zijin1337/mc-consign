"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { findBannedWord } from "@/lib/banned-words";
import { currentSessionHash, requireRole, requireUser } from "@/lib/auth";
import { qqEmail, sendMail } from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkLimit, consume, recordHit, retryText } from "@/lib/rate-limit";
import { USERNAME_COOLDOWN_DAYS, passwordSchema, usernameCooldownDaysLeft, usernameSchema } from "@/lib/validation";
import { type FormState } from "./types";

const HOUR = 60 * 60_000;

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function loadBannedWords(): Promise<string[]> {
  const rows = await db.select({ word: schema.bannedWords.word }).from(schema.bannedWords);
  return rows.map((r) => r.word);
}

/** 修改密码：校验旧密码，写新密码，踢掉其他设备的会话，保留当前这一个 */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/me/password", { skipPasswordGate: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  const key = `pwd:${user.id}`;
  const rl = checkLimit(key, 10);
  if (!rl.ok) return { message: `尝试次数过多，请 ${retryText(rl.retryAfterMs)} 后再试` };

  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { errors: { password: parsed.error.issues[0].message } };
  if (next !== confirm) return { errors: { confirm: "两次输入的新密码不一致" } };
  if (next === current) return { errors: { password: "新密码不能和当前密码相同" } };

  const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    recordHit(key, 15 * 60_000);
    return { errors: { current: "当前密码不正确" } };
  }

  const keep = await currentSessionHash();
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() }).where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(keep ? and(eq(schema.sessions.userId, user.id), ne(schema.sessions.tokenHash, keep)) : eq(schema.sessions.userId, user.id));
  });
  redirect("/me?password=1");
}

/** 超管在系统配置页给自己的 QQ 邮箱发一封测试邮件，确认 SMTP 配置可用 */
export async function sendTestMail(): Promise<void> {
  const me = await requireRole(["admin"], "/admin/settings");
  const rl = consume(`testmail:${me.id}`, 5, 10 * 60_000);
  if (!rl.ok) redirect("/admin/settings?mail=ratelimited");
  try {
    await sendMail(qqEmail(me.qq), "测试邮件", `这是一封来自 ${process.env.SITE_NAME || "方块寄售平台"} 的测试邮件。收到即表示 SMTP 配置正常。\n发送时间：${new Date().toLocaleString("zh-CN", { timeZone: process.env.SITE_TZ || "Asia/Shanghai", hour12: false })}`);
  } catch (e) {
    console.error("[testmail]", e);
    redirect(`/admin/settings?mail=fail&why=${encodeURIComponent(e instanceof Error ? e.message.slice(0, 120) : "unknown")}`);
  }
  await audit(me.id, "setting_change", "setting", null, { after: { testMailTo: qqEmail(me.qq) } });
  redirect(process.env.SMTP_HOST ? "/admin/settings?mail=ok" : "/admin/settings?mail=console");
}

/**
 * 改用户名：2～16 字、过违禁词、忽略大小写全局唯一、30 天一次、留痕。
 * 冷却期和重名都重新查库，不信任页面传来的状态。
 */
export async function changeUsername(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/me/username");
  const raw = String(form.get("username") ?? "");
  const values = { username: raw };

  // 「用户名已被使用」本身就是一个探测接口，用限流压住
  const rl = consume(`uname:${user.id}`, 10, HOUR);
  if (!rl.ok) return { message: `改名太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`, values };

  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) return { errors: { username: parsed.error.issues[0].message }, values };
  const name = parsed.data;

  const [row] = await db
    .select({ username: schema.users.username, usernameChangedAt: schema.users.usernameChangedAt })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  if (!row) return { message: "账号不存在，请重新登录", values };
  if (name === row.username) return { errors: { username: "新用户名和当前用户名相同" }, values };

  const left = usernameCooldownDaysLeft(row.usernameChangedAt);
  if (left > 0) return { errors: { username: `用户名 ${USERNAME_COOLDOWN_DAYS} 天只能改一次，还需 ${left} 天` }, values };

  const bad = findBannedWord(name, await loadBannedWords());
  if (bad) return { errors: { username: `用户名包含违禁词「${bad}」` }, values };

  const [dup] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(sql`lower(${schema.users.username}) = lower(${name})`, ne(schema.users.id, user.id)))
    .limit(1);
  if (dup) return { errors: { username: "用户名已被使用" }, values };

  try {
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ username: name, usernameChangedAt: new Date() }).where(eq(schema.users.id, user.id));
      await audit(user.id, "username_change", "user", user.id, { before: { username: row.username }, after: { username: name } }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { errors: { username: "这个用户名刚刚被别人用了，请换一个" }, values };
    throw e;
  }
  redirect("/me?username=1");
}
