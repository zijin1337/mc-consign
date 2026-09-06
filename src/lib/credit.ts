/** 信用分规则：成交金额不含中介费，每 10 元加 1 分，向下取整。 */
export const CREDIT_BASE = 100;

export function creditForDeal(finalPrice: number): number {
  if (!Number.isFinite(finalPrice) || finalPrice <= 0) return 0;
  return Math.floor(finalPrice / 10);
}
