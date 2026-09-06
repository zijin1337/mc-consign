"use client";

import { useLinkStatus } from "next/link";

/**
 * 放在 <Link> 里：这次导航还在等服务器时显示一条扫动的细线。
 * 始终渲染、只切换透明度，不引起布局跳动。样式见 globals.css 的 .link-pending。
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`link-pending${pending ? " is-pending" : ""}${className ? ` ${className}` : ""}`} />;
}
