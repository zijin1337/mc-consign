import { redirect } from "next/navigation";
import { logout } from "@/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Eyebrow } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";

export const metadata = { title: "账号已封禁" };

export default async function BannedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "banned") redirect("/");
  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="ERROR" detail="已封禁" className="mb-3" />
      <Card title="账号已封禁">
        <Alert kind="error">
          <p>原因：{user.banReason || "违反平台规则"}</p>
          <p className="mt-1">解封时间：{user.banUntil ? formatDateTime(user.banUntil) : "永久"}</p>
        </Alert>
        <p className="mt-4 text-sm text-zinc-400">封禁期间不能发布账号、下单或查看详情。有异议请联系平台。</p>
        <form action={logout} className="mt-4">
          <SubmitButton variant="secondary" pendingText="退出中…">退出登录</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
