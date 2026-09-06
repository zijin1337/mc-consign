import type { ReactNode } from "react";
import { count, eq } from "drizzle-orm";
import { AdminNav } from "@/components/admin-nav";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["admin"], "/admin");
  const [[{ pending }], [{ unassigned }]] = await Promise.all([
    db.select({ pending: count() }).from(schema.listings).where(eq(schema.listings.status, "pending_review")),
    db.select({ unassigned: count() }).from(schema.orders).where(eq(schema.orders.status, "pending_assign")),
  ]);

  const items = [
    { href: "/admin", label: "概览" },
    { href: "/admin/review", label: "审核队列", badge: pending },
    { href: "/admin/orders", label: "意向单", badge: unassigned },
    { href: "/admin/reports", label: "中介报表" },
    { href: "/admin/listings", label: "商品管理" },
    { href: "/admin/wanted", label: "求购管理" },
    { href: "/admin/users", label: "用户管理" },
    { href: "/admin/settings", label: "系统配置" },
    { href: "/admin/banned-words", label: "违禁词" },
    { href: "/admin/logs", label: "操作日志" },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <aside className="md:sticky md:top-24 md:self-start">
        <AdminNav items={items} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
