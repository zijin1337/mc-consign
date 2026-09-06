import { PageHeaderSkeleton, Skel, WantedCardSkeleton } from "@/components/skeleton";

/**
 * 求购大厅骨架屏。放在路由组 (hall) 里，只作用于 /wanted 列表页本身：
 * 若直接放 src/app/wanted/loading.tsx，会连同 /wanted/new、/wanted/[id] 一起包进 Suspense，
 * 把 requireUser 的 redirect() 与 notFound() 变成 200 加客户端跳转。
 */
export default function WantedLoading() {
  return (
    <div data-skeleton="wanted" aria-busy="true" aria-label="加载中">
      <PageHeaderSkeleton actions />
      <Skel className="mb-5 h-11 w-full md:hidden" />
      <div className="hard-shadow mb-7 hidden gap-3 border border-white/10 bg-card p-3 md:grid md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-11" />
        ))}
      </div>
      <Skel className="mb-4 h-4 w-32" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <WantedCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
