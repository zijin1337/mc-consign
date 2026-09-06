import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { Card, LinkButton, PageHeader, cn, focusRing, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { formatDateTime } from "@/lib/labels";
import { countActiveWantedAll } from "@/lib/wanted";

export const metadata = { title: "后台概览" };

export default async function AdminHome() {
  const { listings, users, auditLogs, orders } = schema;
  const [byStatus, [{ userCount }], [{ agentCount }], [{ bannedCount }], [{ openOrders }], [{ pinnedCount }], activeWanted, logs] = await Promise.all([
    db.select({ status: listings.status, n: count() }).from(listings).groupBy(listings.status),
    db.select({ userCount: count() }).from(users),
    db.select({ agentCount: count() }).from(users).where(inArray(users.role, ["agent", "admin"])),
    db.select({ bannedCount: count() }).from(users).where(eq(users.status, "banned")),
    db.select({ openOrders: count() }).from(orders).where(inArray(orders.status, ["pending_assign", "pending_contact", "in_progress"])),
    db
      .select({ pinnedCount: count() })
      .from(listings)
      .where(and(gt(listings.pinnedUntil, sql`now()`), inArray(listings.status, ["on_sale", "in_trade"]))),
    countActiveWantedAll(),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, targetType: auditLogs.targetType, targetId: auditLogs.targetId, createdAt: auditLogs.createdAt, operator: users.username })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.operatorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;

  const stats = [
    { label: "待审核", value: n("pending_review"), href: "/admin/review" },
    { label: "在售", value: n("on_sale"), href: "/admin/listings?status=on_sale" },
    { label: "交易中", value: n("in_trade"), href: "/admin/listings?status=in_trade" },
    { label: "已完成", value: n("sold"), href: "/admin/listings?status=sold" },
    { label: "置顶中", value: pinnedCount, href: "/admin/listings?pinned=1" },
    { label: "进行中意向单", value: openOrders, href: "/admin/orders" },
    { label: "求购中", value: activeWanted, href: "/admin/wanted" },
    { label: "注册用户", value: userCount, href: "/admin/users" },
    { label: "中介与超管", value: agentCount, href: "/admin/users?role=agent" },
    { label: "已封禁", value: bannedCount, href: "/admin/users?status=banned" },
  ];

  return (
    <div>
      <PageHeader eyebrow="ADMIN" title="后台概览" />
      {/* 10 个统计块：宽屏两行五列刚好铺满，中等宽度三列 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={cn("border border-white/10 bg-card p-4 transition-colors hover:border-white/30", focusRing)}>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-zinc-500">{s.label}</p>
          </Link>
        ))}
      </div>
      <Card
        flush={logs.length > 0}
        title="最近操作"
        className="mt-5"
        actions={
          <LinkButton href="/admin/logs" variant="ghost" size="sm">
            全部日志
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </LinkButton>
        }
      >
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无</p>
        ) : (
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">操作人</th>
                <th scope="col">动作</th>
                <th scope="col">对象</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-zinc-500">{formatDateTime(l.createdAt)}</td>
                  <td>{l.operator}</td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td className="text-zinc-500">{l.targetType} #{l.targetId ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
