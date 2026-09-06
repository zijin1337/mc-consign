/**
 * 中介费阶梯。
 * 按成交金额落入的区间整体计算，不累进。fixed 为固定元，percent 为百分比，结果向上取整到元。
 */
export interface FeeTier {
  min: number;
  /** null 表示无上限 */
  max: number | null;
  type: "fixed" | "percent";
  value: number;
}

export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { min: 1, max: 200, type: "fixed", value: 15 },
  { min: 201, max: 500, type: "fixed", value: 30 },
  { min: 501, max: 2000, type: "percent", value: 6 },
  { min: 2001, max: null, type: "percent", value: 5 },
];

export function calcFee(amount: number, tiers: FeeTier[] = DEFAULT_FEE_TIERS): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const tier = tiers.find((t) => amount >= t.min && (t.max === null || amount <= t.max));
  if (!tier) return 0;
  if (tier.type === "fixed") return Math.ceil(tier.value);
  return Math.ceil((amount * tier.value) / 100);
}

/** 校验后台填写的阶梯是否连续无重叠，返回错误信息或 null */
export function validateFeeTiers(tiers: FeeTier[]): string | null {
  if (tiers.length === 0) return "至少要有一档";
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  if (sorted[0].min !== 1) return "第一档必须从 1 元开始";
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.value < 0) return `第 ${i + 1} 档数值不能为负`;
    if (t.type === "percent" && t.value > 100) return `第 ${i + 1} 档百分比不能超过 100`;
    const next = sorted[i + 1];
    if (next) {
      if (t.max === null) return `第 ${i + 1} 档无上限，后面不能再有档`;
      if (next.min !== t.max + 1) return `第 ${i + 1} 档和第 ${i + 2} 档之间不连续`;
    } else if (t.max !== null) {
      return "最后一档的上限要留空，表示无上限";
    }
  }
  return null;
}
