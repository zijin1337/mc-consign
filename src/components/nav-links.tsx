"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkPending } from "./link-pending";

export interface NavItem {
  href: string;
  label: string;
  /** 额外算作当前项的路径前缀 */
  also?: string[];
}

/** 主导航。当前项：白色下划线（位置标记）+ aria-current；点击时的扫线是荧光绿（动作） */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap items-center" aria-label="主要导航">
      {items.map((it) => {
        const active =
          it.href === "/" ? path === "/" || (it.also ?? []).some((p) => path.startsWith(p)) : path === it.href || path.startsWith(it.href + "/") || (it.also ?? []).some((p) => path.startsWith(p));
        return (
          <Link key={it.href} href={it.href} className={`nav-link${active ? " nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
            {it.label}
            <LinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
