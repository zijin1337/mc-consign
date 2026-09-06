import Link from "next/link";
import { ChevronRight, Lock, ShieldCheck } from "lucide-react";
import type { MarketCard } from "@/lib/listings";
import { FEE_MODE_LABEL, RANK_ACCENT, formatDate } from "@/lib/labels";
import { LinkPending } from "./link-pending";
import { AccountFace, ListingCover } from "./listing-cover";
import { Price } from "./price";
import { VerifiedTag } from "./verified-tag";

/**
 * 首页账号卡。视线路径：封面 → 头像 + ign → 「官方数据一致」（正文里唯一的彩色）→ 价格（28px）。
 * 荧光绿只在 hover 边框 / 进入方块（动作）与 VerifiedTag（已核验）上出现。
 * 游客拿不到正版 ID / 等级 / 皮肤 / 截图（服务端就没给，见 lib/market-shared.ts），
 * 卡片退到「会员色底纹 + 几何图形」的封面，标题写会员类型，整卡指向登录并带回跳。
 * .listing-card、data-id 与内部的 <LinkPending/> 是 e2e 契约，别改名、别移出。
 */
export function ListingCard({ item }: { item: MarketCard }) {
  const member = item.ign !== null;
  const rank = item.rank;
  const accent = RANK_ACCENT[rank] ?? "rose";
  const rankText = rank !== "无" ? rank : "无会员";
  const detail = `/listings/${item.id}`;
  const capeTag = member ? (item.capes.length ? `披风 ${item.capes.join("/")}` : null) : item.hasCape ? "含披风" : null;
  const tags = [rankText, ...(capeTag ? [capeTag] : []), FEE_MODE_LABEL[item.feeMode]];

  return (
    <Link
      href={member ? detail : `/login?next=${encodeURIComponent(detail)}`}
      data-id={item.id}
      className="listing-card group text-left"
      aria-label={member ? `${item.ign}，${rankText}` : `账号 #${String(item.id).padStart(4, "0")}，${rankText}，登录查看详情`}
    >
      <ListingCover cover={item.cover} mcUuid={item.mcUuid} accent={accent}>
        <span className="cover-index">MC / #{String(item.id).padStart(4, "0")}</span>
        <span className="cover-edition">{rank}</span>
        <span className="score-chip">
          <ShieldCheck className="size-4 text-zinc-300" aria-hidden="true" />
          信用 {item.sellerCredit}
        </span>
        {item.status === "in_trade" ? (
          <span className="cover-badge bg-cyan-300 text-on-cyan">交易中</span>
        ) : item.pinned ? (
          <span className="cover-badge bg-amber-300 text-on-amber">置顶</span>
        ) : null}
      </ListingCover>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-4 font-mono text-xs text-zinc-500">
          <span>{member ? `Hypixel ${item.level ?? "-"} 级` : "登录查看完整资料"}</span>
          <span>{item.approvedAt ? formatDate(item.approvedAt) : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          {member ? (
            <>
              <AccountFace uuid={item.mcUuid} />
              <h2 className="min-w-0 truncate font-mono text-xl font-bold leading-7 text-zinc-100 transition-colors group-hover:text-white">{item.ign}</h2>
            </>
          ) : (
            <h2 className="min-w-0 truncate text-xl font-bold leading-7 text-zinc-100 transition-colors group-hover:text-white">
              Hypixel <span className="text-zinc-600">·</span> {rankText}
            </h2>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
          {item.verified && <VerifiedTag />}
        </div>
        <div className="mt-6 flex items-end justify-between border-t border-white/[0.08] pt-5">
          <div>
            <span className="block text-xs text-zinc-500">{item.feeMode === "all_in" ? "标价含中介费" : "标价不含中介费"}</span>
            <Price value={item.price} className="mt-1.5" />
          </div>
          <span className="flex size-10 items-center justify-center border border-white/10 text-zinc-400 transition-all group-hover:border-lime-300 group-hover:bg-lime-300 group-hover:text-primary-foreground">
            {member ? <ChevronRight className="size-5" /> : <Lock className="size-4" />}
          </span>
        </div>
      </div>
      <LinkPending />
    </Link>
  );
}
