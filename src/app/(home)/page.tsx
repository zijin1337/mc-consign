import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Search, Store } from "lucide-react";
import { FilterDisclosure } from "@/components/filter-disclosure";
import { ListingCard } from "@/components/listing-card";
import { PinnedStrip } from "@/components/pinned-strip";
import { Pagination } from "@/components/pagination";
import { Button, Empty, Eyebrow, Input, LinkButton, Select, cn, focusRing } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { MC_CAPES, MC_RANKS } from "@/lib/games/mc";
import { SOURCE_LABEL } from "@/lib/labels";
import { getMarketStats, listPublicListings, parseFilters } from "@/lib/listings";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const user = await getCurrentUser();
  // 列表字段按访问者身份收窄：游客只拿概览，登录后才拿正版 ID / 等级 / 皮肤 / 截图
  const [{ pinned, rows, total, page, pages }, stats] = await Promise.all([listPublicListings(filters, user ? "member" : "guest"), getMarketStats()]);
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const activeFilters = Object.keys(sp).filter((k) => k !== "page" && s(k) !== "").length;
  const hasFilter = activeFilters > 0;

  return (
    <div>
      <section className="hero mb-6 sm:mb-9">
        <span className="hero-type" aria-hidden="true">
          BLOCK
          <br />
          MARKET
        </span>
        <div className="relative z-10 grid gap-6 p-5 sm:gap-8 sm:p-10 lg:min-h-[420px] lg:grid-cols-[1fr_auto] lg:items-end lg:gap-6">
          <div className="max-w-3xl">
            <div className="hero-in mb-5 flex items-center gap-4 sm:mb-7" style={{ "--i": 0 } as CSSProperties}>
              <Eyebrow section="MARKET" />
              <span className="hidden h-px w-16 bg-white/15 sm:block" />
              <span className="hidden font-mono text-[11px] font-bold tracking-[0.2em] text-zinc-500 sm:block">MINECRAFT · HYPIXEL</span>
            </div>
            <h1 className="hero-in text-[2.1rem] leading-[1.08] tracking-[-0.02em] text-white sm:text-[3.4rem] lg:text-[4.4rem]" style={{ "--i": 1 } as CSSProperties}>
              <span className="block font-light tracking-[0.01em] text-zinc-200">每一笔交易</span>
              <span className="block font-black tracking-[-0.035em]">
                都有据可查<span className="text-lime-300">。</span>
              </span>
            </h1>
            <p className="hero-in mt-4 hidden font-mono text-[11px] font-bold tracking-[0.24em] text-zinc-500 sm:block" style={{ "--i": 2 } as CSSProperties}>
              EVERY TRADE · ON THE RECORD
            </p>
            <p className="hero-in mt-4 max-w-xl text-[15px] leading-7 text-zinc-400 sm:mt-6 sm:text-base sm:leading-8" style={{ "--i": 3 } as CSSProperties}>
              上架先审核、核对 Hypixel 官方数据，中介全程跟进，成交记录公开。
            </p>
            {/* 手机上三条原则横排成一行，不再占三行 */}
            <ol className="hero-in mt-5 flex max-w-2xl flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 sm:mt-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:pt-5" style={{ "--i": 4 } as CSSProperties}>
              {["先审核，后上架", "人工撮合，全程留痕", "网站不收款"].map((t, i) => (
                <li key={t} className="flex items-baseline gap-2 sm:flex-col sm:gap-1.5">
                  <span className="font-mono text-xs font-bold text-lime-300">0{i + 1}</span>
                  <span className="text-[13px] text-zinc-300 sm:text-sm">{t}</span>
                </li>
              ))}
            </ol>
            <div className="hero-in mt-6 flex flex-wrap items-center gap-3 sm:mt-8" style={{ "--i": 5 } as CSSProperties}>
              {user ? (
                <LinkButton href="/sell/new" size="lg">
                  <Store className="size-4" />
                  发布账号
                </LinkButton>
              ) : (
                <>
                  <LinkButton href="/register" size="lg">
                    免费注册 <ArrowRight className="size-4" />
                  </LinkButton>
                  <LinkButton href="/login" variant="secondary" size="lg" className="bg-background/60 backdrop-blur">
                    登录查看详情
                  </LinkButton>
                </>
              )}
              {/* 手机端导航里已有「成交记录」，这里不再占一行 */}
              <Link href="/sold" className={cn("official-link ml-1 hidden text-sm sm:inline-flex", focusRing)}>
                查看成交记录 <ArrowRight className="size-3.5" />
              </Link>
              <Link href="/wanted" className={cn("official-link hidden text-sm sm:inline-flex", focusRing)}>
                浏览求购 <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
          <div className="status-panel grid grid-cols-3 divide-x divide-white/10 backdrop-blur">
            <div>
              <strong>{pad(stats.onSale)}</strong>
              <span>在售账号</span>
            </div>
            <div>
              <strong>{pad(stats.sold)}</strong>
              <span>已成交</span>
            </div>
            <div>
              <strong>{pad(stats.agents)}</strong>
              <span>接单中介</span>
            </div>
          </div>
        </div>
      </section>

      {/* 手机端筛选收进按钮，桌面端始终展开 */}
      <FilterDisclosure activeCount={activeFilters} className="mb-5 sm:mb-7">
        <form method="get" className="hard-shadow grid gap-3 border border-white/10 bg-card p-3 md:grid-cols-4 xl:grid-cols-8">
          <Select name="rank" defaultValue={s("rank")} aria-label="会员类型">
            <option value="">全部会员类型</option>
            {MC_RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Input name="minLevel" type="number" min={0} aria-label="最低等级" placeholder="等级 ≥" defaultValue={s("minLevel")} />
          <Input name="maxLevel" type="number" min={0} aria-label="最高等级" placeholder="等级 ≤" defaultValue={s("maxLevel")} />
          <Input name="minPrice" type="number" min={0} aria-label="最低价格" placeholder="价格 ≥" defaultValue={s("minPrice")} />
          <Input name="maxPrice" type="number" min={0} aria-label="最高价格" placeholder="价格 ≤" defaultValue={s("maxPrice")} />
          <Select name="source" defaultValue={s("source")} aria-label="账号来源">
            <option value="">全部来源</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select name="cape" defaultValue={s("cape")} aria-label="披风">
            <option value="">披风不限</option>
            {MC_CAPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" className="h-11 flex-1">
              <Search className="size-4" />
              筛选
            </Button>
            {hasFilter && (
              <LinkButton href="/" variant="ghost" className="h-11">
                清除
              </LinkButton>
            )}
          </div>
        </form>
      </FilterDisclosure>

      <PinnedStrip items={pinned} />

      <div className="mb-4 flex items-center justify-between gap-4 text-sm text-zinc-500">
        <span>
          找到 {total + pinned.length} 个在售账号{pinned.length > 0 ? `，其中 ${pinned.length} 个置顶` : ""}
        </span>
        <span className="hidden font-mono text-xs sm:inline">排序：权重 · 卖家信用分 · 上架时间</span>
      </div>

      {rows.length === 0 && pinned.length === 0 ? (
        <Empty
          className="min-h-72"
          title={hasFilter ? "没有符合条件的账号" : "暂无在售账号"}
          text={hasFilter ? "换一个条件或清除筛选。" : "账号审核通过后会在这里上架。"}
          action={
            hasFilter ? (
              <LinkButton href="/" variant="secondary">
                清除筛选
              </LinkButton>
            ) : user ? (
              <LinkButton href="/sell/new">发布账号</LinkButton>
            ) : undefined
          }
        />
      ) : rows.length === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </div>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/" />
      {!user && (
        <Empty
          layout="bar"
          className="mt-8"
          text="登录后可查看正版 ID、皮肤与截图、Hypixel 官方数据，并提交意向单。中介会通过 QQ 联系你，网站不收款。"
          action={
            <LinkButton href="/login" variant="secondary" size="sm">
              登录查看详情
            </LinkButton>
          }
        />
      )}
    </div>
  );
}
