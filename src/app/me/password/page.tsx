import { Alert, Card, Eyebrow, LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "修改密码" };

export default async function PasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/me/password", { skipPasswordGate: true });
  const forced = sp.force === "1" && user.role === "admin" && !user.passwordChangedAt;
  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="ME" detail="修改密码" className="mb-3" />
      <Card title="修改密码" actions={!forced ? <LinkButton href="/me" variant="secondary" size="sm">返回</LinkButton> : undefined}>
        {forced && (
          <div className="mb-4">
            <Alert kind="warn">超管账号仍在使用初始口令。请先设置新密码，再进入其他页面。</Alert>
          </div>
        )}
        <p className="mb-4 text-sm leading-6 text-zinc-400">修改后其他设备上的登录会全部退出，当前设备保持登录。</p>
        <PasswordForm />
      </Card>
    </div>
  );
}
