/** 求购单的纯函数：标题生成、条件标签、展示状态。前后端与单元测试共用，不能引 server-only 模块。 */
import { formatPrice } from "./labels";

/** 发布时可选的有效期（天） */
export const WANTED_DAYS_OPTIONS = [7, 14, 30, 60, 90] as const;
export const WANTED_MIN_DAYS = 7;
export const WANTED_MAX_DAYS = 90;
export const WANTED_REQUIREMENTS_MAX = 300;
export const WANTED_MESSAGE_MAX = 200;

export type WantedStatus = "open" | "fulfilled" | "closed" | "removed";
/** 展示用状态：open 且到期显示为 expired，数据库里不存这个值 */
export type WantedDisplayStatus = WantedStatus | "expired";
export type WantedOfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "closed";

export interface WantedConditions {
  /** 可接受的会员类型，空 = 不限 */
  ranks: string[];
  minLevel: number | null;
  /** 想要的披风，空 = 不限 */
  capes: string[];
  budgetMin: number | null;
  budgetMax: number;
}

/** 预算文案：「¥3,000～¥5,000」或「¥5,000 以内」 */
export function formatBudget(min: number | null, max: number): string {
  return min ? `${formatPrice(min)}～${formatPrice(max)}` : `${formatPrice(max)} 以内`;
}

/** 条件摘要标签，卡片与详情页共用：["MVP+/MVP++", "100 级以上", "官方披风"] */
export function wantedConditionTags(c: Pick<WantedConditions, "ranks" | "minLevel" | "capes">): string[] {
  const tags = [c.ranks.length ? c.ranks.join("/") : "会员不限", c.minLevel ? `${c.minLevel} 级以上` : "等级不限"];
  if (c.capes.length) tags.push(`${c.capes.join("/")}披风`);
  return tags;
}

/** 标题由条件生成，列表与通知里用：「MVP+/MVP++ · 100 级以上 · 官方披风 · 预算 ¥3,000～¥5,000」 */
export function renderWantedTitle(c: WantedConditions): string {
  return [...wantedConditionTags(c), `预算 ${formatBudget(c.budgetMin, c.budgetMax)}`].join(" · ");
}

type StatusRow = { status: WantedStatus; expiresAt: Date };

export function isWantedExpired(r: StatusRow, now: Date = new Date()): boolean {
  return r.status === "open" && r.expiresAt.getTime() <= now.getTime();
}

/** 仍在公开展示、可被推荐 */
export function isWantedActive(r: StatusRow, now: Date = new Date()): boolean {
  return r.status === "open" && r.expiresAt.getTime() > now.getTime();
}

export function wantedDisplayStatus(r: StatusRow, now: Date = new Date()): WantedDisplayStatus {
  return isWantedExpired(r, now) ? "expired" : r.status;
}

/** 剩余天数，向上取整；已过期返回 0 */
export function wantedDaysLeft(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400_000));
}

/** 推荐是否还能被买家采纳：推荐待回应且账号仍可购买 */
export function isOfferActionable(o: { status: WantedOfferStatus; listingStatus: string }): boolean {
  return o.status === "pending" && (o.listingStatus === "on_sale" || o.listingStatus === "in_trade");
}
