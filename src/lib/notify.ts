import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { qqEmail } from "./mail";
import { enqueueMail, scheduleFlush } from "./outbox";

export type NotificationType =
  | "review_passed"
  | "review_rejected"
  | "listing_pinned"
  | "order_new"
  | "order_queued"
  | "order_assigned"
  | "order_started"
  | "order_completed"
  | "order_cancelled"
  | "order_waiting"
  | "order_your_turn"
  | "no_show_locked"
  | "aftersale_opened"
  | "aftersale_resolved"
  | "aftersale_update"
  | "credit_changed"
  | "role_changed"
  | "banned"
  | "risk_flag"
  | "wanted_new"
  | "wanted_offer"
  | "wanted_offer_accepted"
  | "wanted_offer_declined"
  | "wanted_closed"
  | "wanted_fulfilled"
  | "wanted_removed"
  | "announcement";

/**
 * 站内通知，并按用户设置抄送到 QQ 邮箱。
 * 邮件先进发件箱（与通知同一事务），事务提交后再发；事务回滚则通知与邮件都不存在。
 */
export async function notify(
  userId: number,
  n: { type: NotificationType; title: string; body: string; link?: string },
  tx?: Tx,
) {
  const exec = tx ?? db;
  const [row] = await exec
    .insert(schema.notifications)
    .values({ userId, type: n.type, title: n.title, body: n.body, link: n.link ?? null })
    .returning({ id: schema.notifications.id });

  const [u] = await exec
    .select({ qq: schema.users.qq, notifyEmail: schema.users.notifyEmail })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u?.notifyEmail) return;

  const siteUrl = process.env.SITE_URL || "";
  const text = n.link ? `${n.body}\n\n查看：${siteUrl}${n.link}` : n.body;
  await enqueueMail(exec, { to: qqEmail(u.qq), subject: n.title, body: text, notificationId: row.id });
  scheduleFlush();
}

/** 未读站内通知数，顶栏角标与「我的」页共用 */
export async function countUnread(userId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return n;
}
