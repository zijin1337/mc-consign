import { desc, eq } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import { markAllNotificationsRead } from "@/actions/me";
import { SubmitButton } from "@/components/submit-button";
import { Card, Empty, LinkButton, PageHeader, cn } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";

export const metadata = { title: "消息" };

export default async function NotificationsPage() {
  const user = await requireUser("/me/notifications");
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="ME"
        eyebrowDetail="消息"
        title="消息"
        description={unread > 0 ? `${unread} 条未读。点开后标为已读，并跳到对应页面。` : "没有未读消息。"}
        actions={
          <>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <SubmitButton variant="secondary" pendingText="处理中…">全部标为已读</SubmitButton>
              </form>
            )}
            <LinkButton href="/me" variant="secondary">返回</LinkButton>
          </>
        }
      />
      {rows.length === 0 ? (
        <Empty text="还没有消息" />
      ) : (
        <Card flush>
          <ul className="divide-y divide-white/10">
            {rows.map((n) => {
              // 用普通 <a>：这是个会写库（标已读）的跳转，不能让 <Link> 预取
              const open = n.link ? `/me/notifications/${n.id}` : null;
              return (
                <li key={n.id} className={cn("flex gap-3 px-5 py-3", n.readAt && "opacity-75")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-none", n.readAt ? "bg-transparent" : "bg-rose-400")} aria-label={n.readAt ? undefined : "未读"} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">
                      {open ? (
                        <a href={open} className="link-quiet">
                          {n.title}
                        </a>
                      ) : (
                        n.title
                      )}
                    </p>
                    <p className="text-sm text-zinc-400">{n.body}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      {formatDateTime(n.createdAt)}
                      {open && (
                        <>
                          <span className="mx-1">·</span>
                          <a href={open} className="link inline-flex items-center gap-0.5">
                            查看 <ArrowUpRight className="size-3" />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
