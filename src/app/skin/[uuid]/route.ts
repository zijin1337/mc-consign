import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { capePng, portraitPng, rawSkinPng } from "@/lib/hypixel/skin";
import { consume } from "@/lib/rate-limit";

const DAY = "public, max-age=86400, stale-while-revalidate=604800";
const NO_STORE = "no-store";
const KNOWN_TTL_MS = 5 * 60_000;

const g = globalThis as unknown as { __skinKnown?: Map<string, { ok: boolean; at: number }> };
const known = (g.__skinKnown ??= new Map());

/**
 * 只给本站认识的玩家出图：出现在上架账号或 Hypixel 缓存里的 uuid。随机 uuid 不会触发上游请求和落盘。
 * 一条 SQL + 5 分钟进程内缓存，首页一屏 30 张头像不会打 60 次库。
 */
async function knownUuid(uuid: string): Promise<boolean> {
  const hit = known.get(uuid);
  if (hit && Date.now() - hit.at < KNOWN_TTL_MS) return hit.ok;
  const res = await db.execute(sql`select 1 as one from hypixel_players where uuid = ${uuid} union all select 1 from listings where mc_uuid = ${uuid} limit 1`);
  const ok = (res.rows?.length ?? 0) > 0;
  known.set(uuid, { ok, at: Date.now() });
  if (known.size > 5000) known.clear();
  return ok;
}

function png(req: Request, body: Buffer, cache: string) {
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  if (cache !== NO_STORE && req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
  }
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/png", "Cache-Control": cache, ETag: etag } });
}

/**
 * 皮肤资源：/skin/<uuid>?view=raw|cape|body|face
 * raw 原始皮肤纹理（3D 模型用）、cape 披风（没有则 404）、body 2D 正面立绘、face 头像（账号卡用，量最大，单独限流桶）。
 */
export async function GET(req: Request, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  const id = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const view = new URL(req.url).searchParams.get("view") ?? "body";

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const rl = view === "face" ? consume(`skin:face:${ip}`, 600, 60_000) : consume(`skin:ip:${ip}`, 120, 60_000);
  if (!rl.ok) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  if (!(await knownUuid(id))) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

  try {
    if (view === "raw") {
      const r = await rawSkinPng(id);
      return png(req, r.png, r.transient ? NO_STORE : DAY);
    }
    if (view === "cape") {
      const c = await capePng(id);
      if (c.png) return png(req, c.png, DAY);
      return new Response("No cape", { status: 404, headers: { "Cache-Control": c.transient ? NO_STORE : "public, max-age=3600" } });
    }
    const p = await portraitPng(id, view === "face" ? "face" : "body");
    return png(req, p.png, p.transient ? NO_STORE : DAY);
  } catch (e) {
    console.error("[skin]", e);
    return new Response("Render failed", { status: 500, headers: { "Cache-Control": NO_STORE } });
  }
}
