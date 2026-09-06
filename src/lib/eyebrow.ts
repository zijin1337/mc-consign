/**
 * eyebrow（页面左上角的等宽小标签）固定词表。一个站点分区一个词，卡片级不再用英文词。
 * 只有页级 <Eyebrow> / <PageHeader eyebrow> 能用，类型就是词表，写了词表外的词 tsc 直接报错。
 * 后缀（detail）只在表达「下一级位置」时写：ACCOUNT / #0001、ME / 信用分、ADMIN / 审核队列；页词就是页本身时不写。
 * 这个模块前后端共用，不能 import server-only。
 */
export const PAGE_WORDS = ["MARKET", "SOLD", "ACCOUNT", "SELL", "ORDERS", "AGENT", "ME", "ADMIN", "AUTH", "LEGAL", "ERROR", "HYPIXEL", "PINNED", "WANTED"] as const;

export type PageWord = (typeof PAGE_WORDS)[number];

export const PAGE_WORD_SET: ReadonlySet<string> = new Set<string>(PAGE_WORDS);

/** 编号后缀：ACCOUNT / #0001、ORDERS / #00012 */
export function idDetail(id: number, width: number) {
  return `#${String(id).padStart(width, "0")}`;
}
