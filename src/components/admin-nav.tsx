"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, cn } from "./ui";

export interface AdminNavItem {
  href: string;
  label: string;
  badge?: number;
}

/** 后台侧栏：当前项左侧荧光绿竖条，和主导航的下划线是同一套语言 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border border-white/10 bg-card p-2 md:flex-col" aria-label="后台导航">
      {items.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={cn("admin-nav-link", active && "admin-nav-link-active")} aria-current={active ? "page" : undefined}>
            {it.label}
            {it.badge ? <Badge className="bg-amber-300/15 text-amber-300">{it.badge}</Badge> : null}
          </Link>
        );
      })}
    </nav>
  );
}
