import { Search } from "lucide-react";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { Pagination } from "@/components/pagination";
import { Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { WantedCard } from "@/components/wanted-card";
import { getCurrentUser } from "@/lib/auth";
import { MC_RANKS } from "@/lib/games/mc";
import { listPublicWanted, parseWantedFilters } from "@/lib/wanted";

export const metadata = { title: "求购大厅" };

const FILTER_KEYS = ["rank", "minBudget", "maxBudget"];

/** 求购大厅（URL 仍是 /wanted，路由组只为让 loading.tsx 不波及子段）：对游客公开，只列求购中且未到期的单子；详情需登录 */
export default async function WantedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseWantedFilters(sp);
  const [{ rows, total, page, pages }, user] = await Promise.all([listPublicWanted(filters), getCurrentUser()]);
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const activeFilters = FILTER_KEYS.filter((k) => s(k) !== "").length;
  const hasFilter = activeFilters > 0;

  return (
    <div>
      <PageHeader
        eyebrow="WANTED"
        title="求购大厅"
        description="买家发布想要的账号与预算，卖家和中介把合适的账号推荐给他。"
        actions={user ? <LinkButton href="/wanted/new">发布求购</LinkButton> : <LinkButton href="/login?next=/wanted/new">登录后发布</LinkButton>}
      />

      {/* 与首页同一套筛选条：手机端收进按钮，桌面端始终展开 */}
      <FilterDisclosure activeCount={activeFilters} className="mb-5 sm:mb-7">
        <form method="get" className="hard-shadow grid gap-3 border border-white/10 bg-card p-3 md:grid-cols-4">
          <Select name="rank" defaultValue={s("rank")} aria-label="会员类型">
            <option value="">全部会员类型</option>
            {MC_RANKS.map((r) => (
              <option key={r} value={r}>
                {r === "无" ? "无会员" : r}
              </option>
            ))}
          </Select>
          <Input name="minBudget" type="number" min={0} aria-label="预算下限" placeholder="预算 ≥" defaultValue={s("minBudget")} />
          <Input name="maxBudget" type="number" min={0} aria-label="预算上限" placeholder="预算 ≤" defaultValue={s("maxBudget")} />
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" className="h-11 flex-1">
              <Search className="size-4" />
              筛选
            </Button>
            {hasFilter && (
              <LinkButton href="/wanted" variant="ghost" className="h-11">
                清除
              </LinkButton>
            )}
          </div>
        </form>
      </FilterDisclosure>

      <div className="mb-4 flex items-center justify-between gap-4 text-sm text-zinc-500">
        <span>找到 {total} 条求购</span>
        <span className="hidden font-mono text-xs sm:inline">排序：最新发布</span>
      </div>

      {rows.length === 0 ? (
        <Empty
          className="min-h-72"
          text={hasFilter ? "没有符合条件的求购" : "暂无求购"}
          action={
            hasFilter ? (
              <LinkButton href="/wanted" variant="secondary">
                清除筛选
              </LinkButton>
            ) : user ? (
              <LinkButton href="/wanted/new">发布求购</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <WantedCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/wanted" />
      {!user && (
        <Empty
          layout="bar"
          className="mt-8"
          text="登录后可查看求购详情，也可以把自己的账号推荐给买家。交易由中介撮合，网站不收款。"
          action={
            <LinkButton href="/login?next=/wanted" variant="secondary" size="sm">
              登录查看详情
            </LinkButton>
          }
        />
      )}
    </div>
  );
}
