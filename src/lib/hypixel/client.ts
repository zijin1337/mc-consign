import "server-only";
import { mockGuild, mockPlayer, mockProfiles, mockUuid } from "./mock";

/**
 * Hypixel / Mojang 接口的薄封装。只负责请求、超时、错误分类，不做解析。
 * 环境变量：HYPIXEL_API_KEY（developer.hypixel.net 申请），HYPIXEL_MOCK=1 用模拟数据（Mojang 仍走真实接口）。
 */

const HYPIXEL_BASE = "https://api.hypixel.net/v2";
const TIMEOUT_MS = 8000;

export type HxErrorKind = "unconfigured" | "invalid_key" | "rate_limited" | "not_found" | "network" | "upstream";

export class HypixelError extends Error {
  constructor(
    public kind: HxErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const isMock = () => process.env.HYPIXEL_MOCK === "1";
export const hypixelConfigured = () => isMock() || !!process.env.HYPIXEL_API_KEY;

async function hx(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = process.env.HYPIXEL_API_KEY;
  if (!key) throw new HypixelError("unconfigured", "未配置 Hypixel API Key");
  const url = new URL(HYPIXEL_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new HypixelError("network", "连接 Hypixel API 超时或失败");
  }
  if (res.status === 403) throw new HypixelError("invalid_key", "Hypixel API Key 无效或已过期");
  if (res.status === 429) throw new HypixelError("rate_limited", "Hypixel API 请求过于频繁，请稍后再试");
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || json.success !== true) {
    throw new HypixelError("upstream", typeof json?.cause === "string" ? json.cause : `Hypixel API 返回 ${res.status}`);
  }
  return json;
}

/** 玩家不存在或从未登录 Hypixel 时返回 null */
export async function fetchPlayer(uuid: string, nameHint?: string): Promise<Record<string, unknown> | null> {
  if (isMock()) return mockPlayer(uuid, nameHint);
  const json = await hx("/player", { uuid });
  return (json.player as Record<string, unknown> | null) ?? null;
}

export async function fetchGuild(uuid: string): Promise<Record<string, unknown> | null> {
  if (isMock()) return mockGuild(uuid);
  const json = await hx("/guild", { player: uuid });
  return (json.guild as Record<string, unknown> | null) ?? null;
}

export async function fetchProfiles(uuid: string): Promise<unknown[]> {
  if (isMock()) return mockProfiles(uuid);
  const json = await hx("/skyblock/profiles", { uuid });
  return Array.isArray(json.profiles) ? json.profiles : [];
}

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
export const isValidIgn = (s: string) => NAME_RE.test(s);

/**
 * 玩家名 → UUID。先 Mojang，再 minecraftservices 备用。名字不存在返回 null。
 * 模拟模式下名字不存在也给一个伪 uuid，方便演示；两边都连不上时非模拟模式抛 network。
 */
export async function resolveName(name: string): Promise<{ uuid: string; name: string } | null> {
  if (!isValidIgn(name)) return null;
  const urls = [`https://api.mojang.com/users/profiles/minecraft/${name}`, `https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`];
  let notFound = false;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (res.status === 200) {
        const j = (await res.json()) as { id?: string; name?: string };
        if (j?.id && j?.name) return { uuid: j.id.replace(/-/g, "").toLowerCase(), name: j.name };
      }
      if (res.status === 404 || res.status === 204) {
        notFound = true;
        break;
      }
    } catch {
      // 换下一个
    }
  }
  if (isMock()) return { uuid: mockUuid(name), name };
  if (notFound) return null;
  throw new HypixelError("network", "无法连接 Mojang 接口解析玩家名");
}

export interface Textures {
  skinUrl: string;
  slim: boolean;
  capeUrl: string | null;
}

/** ok 有纹理；none 玩家不存在或没有自定义皮肤，可以长期缓存；error 上游抖动，不能缓存 */
export type TexturesResult = { kind: "ok"; tex: Textures } | { kind: "none" } | { kind: "error" };

/** 纹理只允许来自 Mojang 自己的域名，防止把别的地址喂给服务端去下载 */
function textureUrlOk(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname === "textures.minecraft.net";
  } catch {
    return false;
  }
}

/** 皮肤与披风纹理地址。区分「确实没有」和「上游失败」，后者不该被当作没有皮肤缓存起来。 */
export async function fetchTextures(uuid: string): Promise<TexturesResult> {
  try {
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (res.status === 204 || res.status === 404 || res.status === 400) return { kind: "none" };
    if (res.status !== 200) return { kind: "error" };
    const j = (await res.json()) as { properties?: Array<{ name: string; value: string }> };
    const prop = j.properties?.find((p) => p.name === "textures");
    if (!prop) return { kind: "none" };
    const decoded = JSON.parse(Buffer.from(prop.value, "base64").toString("utf8")) as {
      textures?: { SKIN?: { url?: string; metadata?: { model?: string } }; CAPE?: { url?: string } };
    };
    const skinUrl = decoded.textures?.SKIN?.url;
    if (!textureUrlOk(skinUrl)) return { kind: "none" };
    const capeUrl = decoded.textures?.CAPE?.url;
    return { kind: "ok", tex: { skinUrl, slim: decoded.textures?.SKIN?.metadata?.model === "slim", capeUrl: textureUrlOk(capeUrl) ? capeUrl : null } };
  } catch {
    return { kind: "error" };
  }
}

const MAX_TEXTURE_BYTES = 2 * 1024 * 1024;

/** 下载纹理图。只接受 Mojang 域名、2MB 以内。 */
export async function fetchImage(url: string): Promise<Buffer | null> {
  if (!textureUrlOk(url)) return null;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_TEXTURE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_TEXTURE_BYTES ? null : buf;
  } catch {
    return null;
  }
}
