import { ListingCardSkeleton, Skel } from "@/components/skeleton";

/**
 * 首页骨架屏。只作用于 (home) 这一段路由，不会像根级 loading.tsx 那样把其他页面的
 * redirect() / notFound() 变成 200 加客户端跳转。
 */
export default function HomeLoading() {
  return (
    <div data-skeleton="home" aria-busy="true" aria-label="加载中">
      <section className="hero mb-6 sm:mb-9">
        <div className="relative z-10 grid gap-6 p-5 sm:gap-8 sm:p-10 lg:min-h-[420px] lg:grid-cols-[1fr_auto] lg:items-end lg:gap-6">
          <div className="max-w-3xl space-y-5">
            <Skel className="h-3 w-40" />
            <Skel className="h-9 w-3/4 sm:h-14 lg:h-[4.4rem]" />
            <Skel className="h-9 w-2/3 sm:h-14 lg:h-[4.4rem]" />
            <Skel className="h-4 w-1/2" />
            <div className="flex gap-3 pt-2">
              <Skel className="h-12 w-36" />
              <Skel className="h-12 w-36" />
            </div>
          </div>
          <div className="status-panel grid grid-cols-3 divide-x divide-white/10">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Skel className="h-6 w-10" />
                <Skel className="mt-2 h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <Skel className="mb-5 h-11 w-full md:hidden" />
      <div className="hard-shadow mb-7 hidden gap-3 border border-white/10 bg-card p-3 md:grid md:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <Skel key={i} className="h-11" />
        ))}
      </div>
      <Skel className="mb-4 h-4 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
