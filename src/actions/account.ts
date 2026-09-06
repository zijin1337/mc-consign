"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { currentSessionHash, requireRole, requireUser } from "@/lib/auth";
import { qqEmail, sendMail } from "@/lib/mail";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkLimit, consume, recordHit, retryText } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/validation";
import { type FormState } from "./types";

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
