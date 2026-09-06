import { cn } from "./ui";

/** 骨架屏基元。`.skel` 在 globals.css 里：浅灰块 + 呼吸动画 */
export function Skel({ className }: { className?: string }) {
  return <div className={cn("skel", className)} />;
}

export function PageHeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-3">
        <Skel className="h-3 w-32" />
        <Skel className="h-9 w-56" />
        <Skel className="h-3 w-72 max-w-full" />
      </div>
      {actions && <Skel className="h-10 w-28" />}
    </div>
  );
}

/** 表格占位：卡片壳 + 表头 + N 行。flush 与 <Card flush> 对齐（无内边距、首列贴 px-5），内容到达时不跳动 */
export function TableSkeleton({ rows = 5, title = true, flush = false }: { rows?: number; title?: boolean; flush?: boolean }) {
  return (
    <div className="border border-white/10 bg-card">
      {title && (
        <div className="mc-rule px-5 py-3.5">
          <Skel className="h-4 w-40" />
        </div>
      )}
      <div className={flush ? "px-5 pb-2 pt-3" : "p-5"}>
        <div className="mb-1 flex gap-6">
          <Skel className="h-3 w-10" />
          <Skel className="h-3 flex-1" />
          <Skel className="h-3 w-24" />
          <Skel className="h-3 w-16" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-t border-white/[0.06] py-3">
            <Skel className="h-4 w-10" />
            <Skel className="h-10 w-16" />
            <Skel className="h-4 flex-1" />
            <Skel className="h-4 w-24" />
            <Skel className="h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 首页账号卡占位，尺寸对齐真卡片，避免内容到达时跳动 */
export function ListingCardSkeleton() {
  return (
    <div className="border border-white/10 bg-card">
      <Skel className="h-[132px] w-full sm:h-[150px]" />
      <div className="space-y-4 p-5">
        <Skel className="h-3 w-24" />
        <div className="flex items-center gap-3">
          <Skel className="size-8" />
          <Skel className="h-6 w-40" />
        </div>
        <div className="flex gap-2">
          <Skel className="h-6 w-14" />
          <Skel className="h-6 w-20" />
          <Skel className="h-6 w-12" />
        </div>
        <div className="flex items-end justify-between border-t border-white/[0.08] pt-5">
          <Skel className="h-8 w-28" />
          <Skel className="size-10" />
        </div>
      </div>
    </div>
  );
}

/** 求购大厅卡片占位，尺寸对齐 <WantedCard>：编号行 → 预算大字 → 条件标签 → 两行说明 → 底部买家行 */
export function WantedCardSkeleton() {
  return (
    <div className="flex flex-col border border-white/10 bg-card p-5">
      <div className="flex items-center justify-between">
        <Skel className="h-3 w-24" />
        <Skel className="h-3 w-16" />
      </div>
      <Skel className="mt-4 h-8 w-36" />
      <Skel className="mt-2 h-3 w-14" />
      <div className="mt-4 flex gap-2">
        <Skel className="h-6 w-20" />
        <Skel className="h-6 w-16" />
        <Skel className="h-6 w-14" />
      </div>
      <Skel className="mt-4 h-4 w-full" />
      <Skel className="mt-2 h-4 w-3/4" />
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4">
        <Skel className="h-4 w-28" />
        <Skel className="h-3 w-24" />
      </div>
    </div>
  );
}

/** 「我的」页三格概览卡的占位 */
export function StatCardSkeleton() {
  return (
    <div className="border border-white/10 bg-card">
      <div className="mc-rule px-5 py-3.5">
        <Skel className="h-4 w-24" />
      </div>
      <div className="space-y-3 p-5">
        <Skel className="h-4 w-full" />
        <Skel className="h-4 w-5/6" />
        <Skel className="h-4 w-2/3" />
        <Skel className="h-8 w-32" />
      </div>
    </div>
  );
}
