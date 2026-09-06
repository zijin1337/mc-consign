import { sendTestMail } from "@/actions/account";
import { resetSettingsToDefault } from "@/actions/admin";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, DescList, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "系统配置" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const smtpHost = process.env.SMTP_HOST || "";
  const mailFlash =
    sp.mail === "ok"
      ? { kind: "success" as const, text: "测试邮件已发出，请到你的 QQ 邮箱查收。" }
      : sp.mail === "console"
        ? { kind: "warn" as const, text: "还没有配置 SMTP，邮件只打印到服务端日志。上线前要在 .env 里填 SMTP_HOST 等配置。" }
        : sp.mail === "fail"
          ? { kind: "error" as const, text: `发送失败：${typeof sp.why === "string" ? sp.why : "未知错误"}。请检查 SMTP 主机、端口、账号与授权码。` }
          : sp.mail === "ratelimited"
            ? { kind: "warn" as const, text: "测试邮件发送太频繁，请稍后再试。" }
            : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ADMIN"
        eyebrowDetail="系统配置"
        title="系统配置"
        description="交易与信用的数字规则都在这里改，保存后即生效。每次修改记入日志。"
        actions={
          <form action={resetSettingsToDefault}>
            <SubmitButton variant="ghost" pendingText="恢复中…" confirm="恢复默认值会覆盖当前全部配置，包括中介费阶梯、质保天数和公告。确定恢复？">
              恢复默认值
            </SubmitButton>
          </form>
        }
      />
      <Card
        title="SMTP 邮件通道"
        actions={
          <form action={sendTestMail}>
            <SubmitButton variant="secondary" size="sm" pendingText="发送中…">给我发一封测试邮件</SubmitButton>
          </form>
        }
      >
        {mailFlash && (
          <div className="mb-4">
            <Alert kind={mailFlash.kind}>{mailFlash.text}</Alert>
          </div>
        )}
        <DescList
          items={[
            // 系统状态用 .status-ok / .status-warn 一对芯片，是后台唯一保留绿色的「已核验」状态
            {
              label: "状态",
              value: smtpHost ? (
                <>
                  <span className="status-ok">已配置</span>，经 {smtpHost} 发送
                </>
              ) : (
                <>
                  <span className="status-warn">未配置</span>，邮件只打到服务端日志
                </>
              ),
            },
            { label: "发件人", value: process.env.MAIL_FROM || process.env.SMTP_USER || "-" },
            { label: "用途", value: "注册与找回密码的验证码、意向单与审核等通知的 QQ 邮箱抄送" },
            { label: "怎么改", value: "编辑服务器上的 .env.production，重启应用容器生效" },
          ]}
        />
      </Card>
      <SettingsForm settings={settings} />
    </div>
  );
}
