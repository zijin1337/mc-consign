/** 路由参数与分页参数的收敛。乱值一律当作不存在或第一页，不让它进 SQL 触发类型错误。 */

/** 正整数 id，最多 15 位，避免 1e20 / 小数 / 负数 */
export function parseId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d{0,14}$/.test(raw)) return null;
  return Number(raw);
}

/** 页码：1 到 100000 的整数，其余当第一页 */
export function parsePage(raw: unknown): number {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,6}$/.test(s)) return 1;
  return Math.min(100_000, Math.max(1, Number(s)));
}

/** 非负整数筛选值，超出范围或非整数返回 undefined */
export function parseIntParam(raw: unknown, max = 1_000_000_000): number | undefined {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,10}$/.test(s)) return undefined;
  const n = Number(s);
  return n > max ? max : n;
}
