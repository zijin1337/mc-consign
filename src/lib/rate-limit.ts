import "server-only";

/**
 * 固定窗口限流，单机内存实现。多实例部署时换成 Redis 或数据库，接口不变。
 * checkLimit 只看不计，recordHit 计一次，consume 查并计。
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __rateLimit?: Map<string, Bucket>; __rateLimitSweep?: number };
const store = (g.__rateLimit ??= new Map<string, Bucket>());

function sweep(now: number) {
  if (now - (g.__rateLimitSweep ?? 0) < 60_000) return;
  g.__rateLimitSweep = now;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

export function checkLimit(key: string, limit: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);
  const b = store.get(key);
  if (!b || b.resetAt <= now) return { ok: true, retryAfterMs: 0 };
  return b.count >= limit ? { ok: false, retryAfterMs: b.resetAt - now } : { ok: true, retryAfterMs: 0 };
}

export function recordHit(key: string, windowMs: number): void {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt <= now) store.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}

export function consume(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const r = checkLimit(key, limit);
  if (r.ok) recordHit(key, windowMs);
  return r;
}

export function retryText(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 60_000))} 分钟`;
}
