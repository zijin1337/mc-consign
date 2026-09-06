import Link from "next/link";
import { Alert, Card, Eyebrow } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="AUTH" detail="登录" className="mb-3" />
      <Card title="登录">
        {sp.reset === "1" && (
          <div className="mb-4">
            <Alert kind="success">密码已重置，请用新密码登录。</Alert>
          </div>
        )}
        {next && (
          <div className="mb-4">
            <Alert kind="info">需要登录才能继续。登录后会回到刚才的页面。</Alert>
          </div>
        )}
        <LoginForm next={next} />
        <p className="mt-4 text-center text-sm text-zinc-500">
          没有账号？<Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="link">去注册</Link>
          <span className="mx-2">·</span>
          <Link href="/forgot" className="link">忘记密码</Link>
        </p>
      </Card>
    </div>
  );
}
