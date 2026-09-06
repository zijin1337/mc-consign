/**
 * 置顶规则，见大纲 4.2。前后端共用，不能引 server-only 模块。
 * 置顶由超管设置并带时长；到期自动从置顶栏撤下，不需要定时任务，查询时按 pinned_until > now() 判断。
 */
export type PinUnit = "hours" | "days";

/** 后台快捷时长，单位天 */
export const PIN_PRESET_DAYS = [1, 3, 7, 15, 30] as const;

/** 单次置顶最短 1 小时，累计最长 365 天 */
export const PIN_MIN_MS = 60 * 60 * 1000;
export const PIN_MAX_MS = 365 * 24 * 60 * 60 * 1000;

export function isPinActive(until: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!until) return false;
  const t = typeof until === "string" ? new Date(until) : until;
  return t.getTime() > now.getTime();
}

export function pinDurationMs(amount: number, unit: PinUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount * (unit === "hours" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
}

/**
 * 计算新的置顶截止时间。已在置顶中则从当前截止时间往后延长，否则从现在开始。
 * 时长不足 1 小时或累计超过 365 天返回 null。
 */
export function extendPin(current: Date | string | null | undefined, amount: number, unit: PinUnit, now: Date = new Date()): Date | null {
  const add = pinDurationMs(amount, unit);
  if (add < PIN_MIN_MS) return null;
  const cur = current ? (typeof current === "string" ? new Date(current) : current) : null;
  const base = cur && cur.getTime() > now.getTime() ? cur.getTime() : now.getTime();
  const next = base + add;
  if (next - now.getTime() > PIN_MAX_MS) return null;
  return new Date(next);
}

/** 剩余时长的人话，例如「2 天 3 小时」「40 分钟」 */
export function formatRemaining(until: Date | string | null | undefined, now: Date = new Date()): string {
  if (!isPinActive(until, now)) return "已到期";
  const t = typeof until === "string" ? new Date(until!) : until!;
  const ms = t.getTime() - now.getTime();
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  if (hours > 0) return `${hours} 小时`;
  return `${Math.max(1, minutes)} 分钟`;
}
