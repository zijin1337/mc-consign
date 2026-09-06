import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

const g = globalThis as unknown as { __mailer?: Transporter };

function getTransporter(): Transporter {
  if (g.__mailer) return g.__mailer;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE ?? "true") !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  g.__mailer = t;
  return t;
}

export function qqEmail(qq: string) {
  return `${qq}@qq.com`;
}

/**
 * 发邮件。SMTP_HOST 为空时进入 console 模式，把内容打到服务端日志，本地开发用。
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const siteName = process.env.SITE_NAME || "方块寄售平台";
  if (!process.env.SMTP_HOST) {
    console.log(`\n[mail:console] to=${to}\n[mail:console] subject=【${siteName}】${subject}\n${text}\n`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `【${siteName}】${subject}`,
    text,
  });
}
