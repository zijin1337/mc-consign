/**
 * 服务启动时的自检。生产环境缺少关键配置直接拒绝启动，而不是带着默认密钥跑起来。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32 || secret.startsWith("dev-only")) problems.push("SESSION_SECRET 必须是至少 32 位的随机字符串");
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL 未设置");
  if (!process.env.SMTP_HOST) console.warn("[startup] SMTP_HOST 未设置，验证码与通知邮件只会打到日志里");
  if (process.env.HYPIXEL_MOCK === "1") console.warn("[startup] HYPIXEL_MOCK=1 生产环境不应开启模拟数据");
  if (problems.length) throw new Error(`启动自检未通过：${problems.join("；")}`);
}
