import Link from "next/link";
import { cn } from "./ui";

export function Pagination({
  page,
  pages,
  params,
  basePath = "",
}: {
  page: number;
  pages: number;
  params?: Record<string, string | string[] | undefined>;
  basePath?: string;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (typeof v === "string" && v !== "" && k !== "page") sp.set(k, v);
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "rounded-none border border-white/15 bg-card px-3 py-1.5 text-sm hover:bg-white/5";
  return (
    <nav className="mt-6 flex items-center justify-center gap-3 text-sm text-zinc-400">
      <Link href={href(Math.max(1, page - 1))} className={cn(btn, page <= 1 && "pointer-events-none opacity-40")} aria-disabled={page <= 1}>
        上一页
      </Link>
      <span className="font-mono text-xs tracking-[0.08em]">
        第 {page} / {pages} 页
      </span>
      <Link href={href(Math.min(pages, page + 1))} className={cn(btn, page >= pages && "pointer-events-none opacity-40")} aria-disabled={page >= pages}>
        下一页
      </Link>
    </nav>
  );
}
