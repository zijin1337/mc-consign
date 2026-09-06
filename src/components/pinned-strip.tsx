import Link from "next/link";
import { Lock, Pin, ShieldCheck } from "lucide-react";
import type { MarketCard } from "@/lib/listings";
import { RANK_ACCENT } from "@/lib/labels";
import { LinkPending } from "./link-pending";
import { AccountFace, ListingCover } from "./listing-cover";
import { Price } from "./price";
import { Eyebrow } from "./ui";

/**
 * 首页置顶栏：超管按时长置顶的账号，横向滚动，到期自动撤下。见大纲 4.2。
 * 琥珀说它是什么（竖条 / 边框 / 徽章 / 图标），荧光绿说正在发生什么（hover / 焦点 / 扫线，见 globals.css .pinned-card）。
 * 与账号卡一样按访问者身份收窄：游客看不到正版 ID / 等级 / 皮肤，整卡指向登录。
 * section 的 aria-label="置顶推荐" 与卡上的 data-id 是 e2e 契约。
 */
export function PinnedStrip({ items }: { items: MarketCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-7" aria-label="置顶推荐">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow section="PINNED" detail="置顶推荐" tone="amber" />
        <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
          <Pin className="size-3.5 text-amber-300" aria-hidden="true" />
          {items.length} 个 · 平台置顶，到期自动取消
        </span>
      </div>
      <div className="pinned-strip flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <PinnedCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function PinnedCard({ item }: { item: MarketCard }) {
  const member = item.ign !== null;
  const rank = item.rank;
  const accent = RANK_ACCENT[rank] ?? "rose";
  const rankText = rank !== "无" ? rank : "无会员";
  const detail = `/listings/${item.id}`;
  return (
    <Link href={member ? detail : `/login?next=${encodeURIComponent(detail)}`} data-id={item.id} className="pinned-card group flex w-[min(88vw,360px)] shrink-0 snap-start">
      <ListingCover cover={item.cover} mcUuid={item.mcUuid} accent={accent} size="pinned">
        <span className="cover-edition">{rank}</span>
      </ListingCover>
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-zinc-500">MC / #{String(item.id).padStart(4, "0")}</span>
            <span className="inline-flex items-center gap-1 bg-amber-300 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em] text-on-amber">
              <Pin className="size-3" aria-hidden="true" />
              置顶
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            {member ? (
              <>
                <AccountFace uuid={item.mcUuid} />
                <p className="min-w-0 truncate font-mono text-lg font-bold text-zinc-100 transition-colors group-hover:text-white">{item.ign}</p>
              </>
            ) : (
              <p className="flex min-w-0 items-center gap-1.5 truncate text-base font-bold text-zinc-100 transition-colors group-hover:text-white">
                <Lock className="size-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                Hypixel · {rankText}
              </p>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {member
              ? `Hypixel ${item.level ?? "-"} 级 · ${item.capes.length ? `披风 ${item.capes.join("/")}` : "无披风"}`
              : `${item.hasCape ? "含披风 · " : ""}登录查看完整资料`}
            {item.status === "in_trade" ? " · 交易中" : ""}
          </p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <Price value={item.price} size="sm" />
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <ShieldCheck className="size-3.5 text-zinc-300" aria-hidden="true" />
            信用 {item.sellerCredit}
          </span>
        </div>
      </div>
      <LinkPending />
    </Link>
  );
}
