import { Alert, Card, Eyebrow, LinkButton } from "@/components/ui";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { maskUsername } from "@/lib/mask";
import { USERNAME_COOLDOWN_DAYS, usernameCooldownDaysLeft } from "@/lib/validation";
import { UsernameForm } from "./username-form";

export const metadata = { title: "修改用户名" };

export default async function UsernamePage() {
  const user = await requireUser("/me/username");
  // 冷却期以库里的 username_changed_at 为准，会话里的快照可能过期
  const [row] = await db
    .select({ usernameChangedAt: schema.users.usernameChangedAt })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  const left = usernameCooldownDaysLeft(row?.usernameChangedAt ?? null);

  return (
    <div className="mx-auto max-w-md py-8">
      <Eyebrow section="ME" detail="修改用户名" className="mb-3" />
      <Card title="修改用户名" actions={<LinkButton href="/me" variant="secondary" size="sm">返回</LinkButton>}>
        <p className="mb-4 text-sm leading-6 text-zinc-400">
          当前用户名 <span className="font-mono text-zinc-200">{user.username}</span>，
          在账号卡和意向单里对其他用户显示为 <span className="font-mono text-zinc-200">{maskUsername(user.username)}</span>。
          用户名 {USERNAME_COOLDOWN_DAYS} 天只能改一次，改动会记入操作日志。
        </p>
        {left > 0 && (
          <div className="mb-4">
            <Alert kind="warn">距离下次可改还有 {left} 天。</Alert>
          </div>
        )}
        <UsernameForm current={user.username} disabled={left > 0} />
      </Card>
    </div>
  );
}
