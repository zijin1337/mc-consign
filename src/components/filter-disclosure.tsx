"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn, focusRing } from "./ui";

/**
 * 手机端把筛选表单收进一个按钮里，md 以上始终展开。
 * 带着筛选参数打开页面时默认展开，让用户看到自己选了什么。
 */
export function FilterDisclosure({ children, activeCount = 0, className }: { children: ReactNode; activeCount?: number; className?: string }) {
  const [open, setOpen] = useState(activeCount > 0);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "flex h-11 w-full items-center justify-between border border-white/15 bg-card px-4 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5 md:hidden",
          focusRing,
          open && "border-white/40 text-white",
        )}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          筛选条件
          {activeCount > 0 && <span className="bg-lime-300 px-1.5 py-0.5 font-mono text-[10px] font-black leading-none text-primary-foreground">{activeCount}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-zinc-500 transition-transform", open && "rotate-180 text-zinc-200")} />
      </button>
      <div id={id} className={cn(open ? "mt-3 md:mt-0" : "hidden md:block")}>
        {children}
      </div>
    </div>
  );
}
