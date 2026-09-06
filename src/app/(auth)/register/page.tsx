import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const metadata = { title: "注册" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="AUTH" detail="注册" className="mb-3" />
      <Card title="注册">
        <RegisterForm next={next} />
        <p className="mt-4 text-center text-sm text-zinc-500">
          已有账号？<Link href="/login" className="link">去登录</Link>
        </p>
      </Card>
    </div>
  );
}
