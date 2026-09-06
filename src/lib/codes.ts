import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendMail } from "./mail";

export type CodePurpose = (typeof schema.codePurpose.enumValues)[number];

const CODE_TTL_MS = 10 * 60_000;
const MIN_INTERVAL_MS = 60_000;
const DAILY_LIMIT = 10;
const MAX_ATTEMPTS = 5;
/** 校验时接受最近几条未用的码，别人对同一 QQ 再发一次不会让你手里的码作废 */
const RECENT_CODES = 3;

const PURPOSE_TEXT: Record<CodePurpose, string> = {
  register: "注册",
  reset_password: "重置密码",
  change_qq: "更换 QQ",
};

export function isCodePurpose(v: unknown): v is CodePurpose {
  return typeof v === "string" && (schema.codePurpose.enumValues as readonly string[]).includes(v);
}

function hashCode(code: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "dev").update(code).digest("hex");
}

export class CodeError extends Error {}

const vc = schema.verificationCodes;

/** 生成并发送验证码。限流：同一目标 60 秒一条、每天 10 条。顺手清掉一天前的旧码。 */
export async function issueCode(target: string, purpose: CodePurpose): Promise<void> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400_000);
  await db.delete(vc).where(lt(vc.createdAt, dayAgo));

  const [latest] = await db
    .select({ createdAt: vc.createdAt })
    .from(vc)
    .where(and(eq(vc.target, target), eq(vc.purpose, purpose)))
    .orderBy(desc(vc.createdAt))
    .limit(1);
  if (latest && now.getTime() - latest.createdAt.getTime() < MIN_INTERVAL_MS) {
    throw new CodeError("发送太频繁，请 1 分钟后再试");
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vc)
    .where(and(eq(vc.target, target), gt(vc.createdAt, dayAgo)));
  if (n >= DAILY_LIMIT) throw new CodeError("今日验证码次数已用完，请明天再试");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(vc).values({
    target,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  await sendMail(
    target,
    `${PURPOSE_TEXT[purpose]}验证码`,
    `你的${PURPOSE_TEXT[purpose]}验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
  );
}

/**
 * 校验验证码，成功则作废该码。失败抛 CodeError。
 * 每次校验先在最新一条上原子地消耗一次尝试机会（并发猜码也只有 5 次），再在最近几条未用的码里找匹配。
 */
export async function consumeCode(target: string, purpose: CodePurpose, code: string): Promise<void> {
  const now = new Date();
  const rows = await db
    .select()
    .from(vc)
    .where(and(eq(vc.target, target), eq(vc.purpose, purpose), isNull(vc.usedAt), gt(vc.expiresAt, now)))
    .orderBy(desc(vc.createdAt))
    .limit(RECENT_CODES);
  if (rows.length === 0) throw new CodeError("验证码已过期，请重新获取");

  const [counted] = await db
    .update(vc)
    .set({ attempts: sql`${vc.attempts} + 1` })
    .where(and(eq(vc.id, rows[0].id), lt(vc.attempts, MAX_ATTEMPTS)))
    .returning({ attempts: vc.attempts });
  if (!counted) throw new CodeError("尝试次数过多，请重新获取验证码");

  const h = hashCode(code.trim());
  const match = rows.find((r) => r.codeHash === h);
  if (!match) throw new CodeError("验证码不正确");

  const [used] = await db
    .update(vc)
    .set({ usedAt: now })
    .where(and(eq(vc.id, match.id), isNull(vc.usedAt)))
    .returning({ id: vc.id });
  if (!used) throw new CodeError("验证码已被使用，请重新获取");
}
