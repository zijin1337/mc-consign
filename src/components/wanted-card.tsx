import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { idDetail } from "@/lib/eyebrow";
import { formatDate } from "@/lib/labels";
import { maskUsername } from "@/lib/mask";
import type { PublicWantedRow } from "@/lib/wanted";
import { formatBudget, wantedConditionTags, wantedDaysLeft } from "@/lib/wanted-shared";
import { Price } from "./price";
import { Badge, cn, focusRing } from "./ui";

/**
 * 求购大厅卡片。视线路径：编号 / 发布日期 → 预算大字 → 条件标签 → 买家补充 → 买家信用 · 推荐数 · 剩余天数。
 * 它不是商品内容卡：hover 走 white/30，不用荧光绿。标题链接用伸展伪元素铺满整卡，整卡可点。
 * `article.wanted-card[data-wanted-id]` 是 e2e 契约，别改名。
 */
export function WantedCard({ item }: { item: PublicWantedRow }) {
  const tags = wantedConditionTags(item);
  const daysLeft = wantedDaysLeft(item.expiresAt);

  return (
    <article className="wanted-card relative flex flex-col border border-white/10 bg-card p-5 transition-colors hover:border-white/30" data-wanted-id={item.id}>
      <div className="pb-5">
        <div className="mb-3 flex items-center justify-between gap-4 font-mono text-xs text-zinc-500">
          <span>求购 {idDetail(item.id, 4)}</span>
          <span>{formatDate(item.createdAt)}</span>
        </div>
        <h2 className="min-w-0">
          <Link href={`/wanted/${item.id}`} aria-label={`查看求购：${item.title}`} className={cn("block text-white after:absolute after:inset-0 after:content-['']", focusRing)}>
            {item.budgetMin ? (
              <span className="font-mono text-2xl font-bold leading-none tracking-tight">{formatBudget(item.budgetMin, item.budgetMax)}</span>
            ) : (
              <Price value={item.budgetMax} size="md" />
            )}
          </Link>
        </h2>
        <p className="mt-1.5 text-xs text-zinc-500">{item.budgetMin ? "预算区间" : "预算上限"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        {item.requirements && <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-400">{item.requirements}</p>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/[0.08] pt-4 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-zinc-300">
          <ShieldCheck className="size-4 shrink-0 text-zinc-300" aria-hidden="true" />
          <span className="truncate">{maskUsername(item.buyerName)}</span>
          <span className="shrink-0 text-zinc-500">· 信用 {item.buyerCredit}</span>
        </span>
        <span className="shrink-0 font-mono text-zinc-500">
          {item.offerCount} 条推荐 · 剩 {daysLeft} 天
        </span>
      </div>
    </article>
  );
}
