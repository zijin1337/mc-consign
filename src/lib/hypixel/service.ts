import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { HypixelError, fetchGuild, fetchPlayer, fetchProfiles, hypixelConfigured, isMock, isValidIgn, resolveName, type HxErrorKind } from "./client";
import { rankToMcRank } from "./labels";
import { normalizePlayer, normalizeSkyblock } from "./normalize";
import { SUMMARY_VERSION, type ApiSnapshot, type PlayerSummary, type SkyblockSummary } from "./types";

/**
 * 带数据库缓存的玩家数据服务。
 * 缓存 6 小时；手动刷新 10 分钟一次；名字→uuid 的缓存 24 小时。
 * 上游出错时有旧缓存就用旧的并标 stale，没有才报错。
 */

const TTL_MS = 6 * 60 * 60_000;
const REFRESH_COOLDOWN_MS = 10 * 60_000;
const NAME_TTL_MS = 24 * 60 * 60_000;

export interface PlayerView {
  summary: PlayerSummary;
  skyblock: SkyblockSummary | null;
  fetchedAt: Date;
  stale: boolean;
  mock: boolean;
}

export type PlayerResult = { ok: true; view: PlayerView } | { ok: false; kind: HxErrorKind; message: string };

const { hypixelPlayers } = schema;
type Row = typeof hypixelPlayers.$inferSelect;

const inflight = new Map<string, Promise<Row | null>>();

/** 缓存里的摘要结构是否是当前版本、形状是否可渲染 */
function usable(row: Row | undefined | null): row is Row {
  const s = row?.summary as Partial<PlayerSummary> | undefined;
  return !!row && !!s && s.v === SUMMARY_VERSION && Array.isArray(s.games) && typeof s.networkExp === "number";
}

function viewOf(row: Row, stale: boolean): PlayerView {
  return { summary: row.summary, skyblock: row.skyblock ?? null, fetchedAt: row.fetchedAt, stale, mock: isMock() };
}

function fail(e: unknown): PlayerResult {
  if (e instanceof HypixelError) return { ok: false, kind: e.kind, message: e.message };
  console.error("[hypixel]", e);
  return { ok: false, kind: "upstream", message: "获取 Hypixel 数据失败" };
}

async function fetchAndStore(uuid: string, nameHint: string | undefined, existing: Row | null): Promise<Row | null> {
  const key = uuid;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const [player, guild] = await Promise.all([fetchPlayer(uuid, nameHint), fetchGuild(uuid).catch(() => null)]);
    if (!player) return null;
    const summary = normalizePlayer(player, guild);
    let skyblock = existing?.skyblock ?? null;
    if (summary.hasSkyblock) {
      try {
        skyblock = normalizeSkyblock(await fetchProfiles(uuid), uuid);
      } catch (e) {
        console.warn("[hypixel] skyblock profiles failed, keeping cached", e instanceof Error ? e.message : e);
      }
    } else {
      skyblock = null;
    }
    const now = new Date();
    const [row] = await db
      .insert(hypixelPlayers)
      .values({ uuid, name: summary.name, summary, skyblock, fetchedAt: now })
      .onConflictDoUpdate({ target: hypixelPlayers.uuid, set: { name: summary.name, summary, skyblock, fetchedAt: now } })
      .returning();
    return row;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function getPlayerByUuid(uuidRaw: string, opts: { force?: boolean; nameHint?: string } = {}): Promise<PlayerResult> {
  const uuid = uuidRaw.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuid)) return { ok: false, kind: "not_found", message: "无效的 UUID" };
  if (!hypixelConfigured()) return { ok: false, kind: "unconfigured", message: "未配置 Hypixel API Key" };

  let existing: Row | undefined;
  try {
    [existing] = await db.select().from(hypixelPlayers).where(eq(hypixelPlayers.uuid, uuid)).limit(1);
  } catch (e) {
    return fail(e);
  }
  const fresh = usable(existing) && Date.now() - existing.fetchedAt.getTime() < TTL_MS;
  if (existing && fresh && !opts.force) return { ok: true, view: viewOf(existing, false) };

  try {
    const row = await fetchAndStore(uuid, opts.nameHint ?? existing?.name, existing ?? null);
    if (!row) {
      if (usable(existing)) return { ok: true, view: viewOf(existing, true) };
      return { ok: false, kind: "not_found", message: "该玩家从未登录过 Hypixel" };
    }
    return { ok: true, view: viewOf(row, false) };
  } catch (e) {
    if (usable(existing)) return { ok: true, view: viewOf(existing, true) };
    return fail(e);
  }
}

/** 名字缓存：24 小时内抓过的玩家直接复用 uuid，省一次 Mojang 请求 */
export async function findCachedByName(name: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(hypixelPlayers)
    .where(sql`lower(${hypixelPlayers.name}) = lower(${name})`)
    .limit(1);
  if (!row) return null;
  return Date.now() - row.fetchedAt.getTime() < NAME_TTL_MS ? row : null;
}

export async function getPlayerByName(nameRaw: string): Promise<PlayerResult> {
  const name = nameRaw.trim();
  if (!isValidIgn(name)) return { ok: false, kind: "not_found", message: "正版 ID 必须是 1～16 位字母、数字或下划线" };
  if (!hypixelConfigured()) return { ok: false, kind: "unconfigured", message: "未配置 Hypixel API Key" };

  const cached = await findCachedByName(name);
  if (cached) return getPlayerByUuid(cached.uuid, { nameHint: cached.name });

  try {
    const resolved = await resolveName(name);
    if (!resolved) return { ok: false, kind: "not_found", message: `找不到玩家「${name}」，请检查拼写` };
    return getPlayerByUuid(resolved.uuid, { nameHint: resolved.name });
  } catch (e) {
    return fail(e);
  }
}

/** 上架 / 编辑时抓一次快照。任何失败都返回 null，绝不阻塞提交。整体 12 秒兜底。 */
export async function snapshotForIgn(ign: string): Promise<{ uuid: string; snapshot: ApiSnapshot } | null> {
  if (!hypixelConfigured() || !isValidIgn(ign)) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000));
  try {
    const r = await Promise.race([getPlayerByName(ign), timeout]);
    if (!r || !r.ok) return null;
    const s = r.view.summary;
    return {
      uuid: s.uuid,
      snapshot: {
        uuid: s.uuid,
        name: s.name,
        level: Math.floor(Math.sqrt(2 * s.networkExp + 30625) / 50 - 2.5),
        rank: rankToMcRank(s.rank),
        rankRaw: s.rankDisplay,
        fetchedAt: r.view.fetchedAt.getTime(),
      },
    };
  } catch {
    return null;
  }
}

/** 手动刷新，只能刷新已收录的玩家，10 分钟冷却 */
export async function refreshPlayer(uuidRaw: string): Promise<{ ok: boolean; message: string }> {
  const uuid = uuidRaw.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(uuid)) return { ok: false, message: "无效的玩家" };
  const [existing] = await db.select({ fetchedAt: hypixelPlayers.fetchedAt }).from(hypixelPlayers).where(eq(hypixelPlayers.uuid, uuid)).limit(1);
  if (!existing) return { ok: false, message: "这个正版 ID 还没有收录，不能刷新" };
  const wait = REFRESH_COOLDOWN_MS - (Date.now() - existing.fetchedAt.getTime());
  if (wait > 0) return { ok: false, message: `刚刷新过，${Math.ceil(wait / 60_000)} 分钟后可再次刷新` };
  const r = await getPlayerByUuid(uuid, { force: true });
  if (!r.ok) return { ok: false, message: r.message };
  if (r.view.stale) return { ok: false, message: "Hypixel 官方接口暂不可用，显示的是缓存数据" };
  return { ok: true, message: "已更新" };
}
