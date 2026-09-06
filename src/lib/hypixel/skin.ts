import "server-only";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { UPLOAD_ROOT } from "../upload";
import { fetchImage, fetchTextures, isMock, type Textures } from "./client";

/**
 * 皮肤资源：原始皮肤纹理（给 3D 模型用）、披风、以及用 sharp 合成的 2D 正面立绘 / 头像（3D 加载前和不支持 WebGL 时的退路）。
 * 纹理来自 Mojang；确实没有皮肤时用内置默认皮肤并缓存；上游抖动时也用默认皮肤但不缓存、不让浏览器缓存。
 */

export type SkinView = "body" | "face";

const CACHE_DIR = path.join(UPLOAD_ROOT, "skins");
const CACHE_TTL_MS = 24 * 60 * 60_000;
const SCALE_BODY = 8;
const SCALE_FACE = 16;

type TexState = { kind: "ok"; tex: Textures } | { kind: "none" } | { kind: "error" };

async function readFresh(file: string): Promise<Buffer | null> {
  try {
    const s = await stat(file);
    if (Date.now() - s.mtimeMs < CACHE_TTL_MS) return await readFile(file);
  } catch {
    // 无缓存
  }
  return null;
}

function cacheFile(uuid: string, suffix: string) {
  return path.join(CACHE_DIR, `${uuid}-${suffix}`);
}

/** 纹理地址缓存。ok 与 none 缓存 24 小时，error 不缓存 */
async function getTextures(uuid: string): Promise<TexState> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(uuid, "textures.json");
  const cached = await readFresh(file);
  if (cached) {
    try {
      const j = JSON.parse(cached.toString("utf8")) as TexState;
      if (j.kind === "ok" || j.kind === "none") return j;
    } catch {
      // 坏缓存，重取
    }
  }
  const r = await fetchTextures(uuid);
  if (r.kind !== "error") writeFile(file, JSON.stringify(r)).catch(() => {});
  return r;
}

function fnv(str: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const MOCK_HAIR = ["#2a2f1a", "#3b2a1a", "#1a1f2f", "#4a2a1a", "#e8ecd8", "#5a3a2a"];
const MOCK_SHIRT = ["#2f6f4f", "#5f2f6f", "#1f5f7f", "#7f3f2f", "#6f6f2f", "#2f2f6f", "#7f5f1f", "#3f6f6f"];
const MOCK_PANTS = ["#23303f", "#3f2333", "#2f3f23", "#33383b", "#1f2b3a"];
const MOCK_STRIPE = ["#c8ff54", "#5fdcff", "#b78aff", "#ffd45d", "#ff8998", "#6ef3c5"];

/**
 * 内置默认皮肤（64x64）。
 * 生产：Steve 配色，玩家没换过皮肤时游戏里就是这个样子，不误导。
 * 模拟模式：假 uuid 拿不到真皮肤，按 uuid 哈希换发色 / 衣色 / 裤色 / 胸前条纹，演示数据里每个玩家长得不一样。
 */
async function defaultSkin(uuid: string): Promise<Buffer> {
  const mock = isMock();
  const skin = mock ? "#d9a37a" : "#b6896c";
  const hair = mock ? MOCK_HAIR[fnv(uuid, 0x811c9dc5) % MOCK_HAIR.length] : "#2b1e13";
  const shirt = mock ? MOCK_SHIRT[fnv(uuid, 0x9747b28c) % MOCK_SHIRT.length] : "#00afaf";
  const pants = mock ? MOCK_PANTS[fnv(uuid, 0x1b873593) % MOCK_PANTS.length] : "#3b3c8a";
  const stripe = mock ? MOCK_STRIPE[fnv(uuid, 0xe6546b64) % MOCK_STRIPE.length] : shirt;
  const iris = mock ? "#1f7a4a" : "#4a3fbf";
  const shoes = "#151a1d";
  const rect = (left: number, top: number, width: number, height: number, hex: string) => ({
    input: { create: { width, height, channels: 4 as const, background: hex } },
    left,
    top,
  });
  return sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      // 头：六面都铺，3D 转起来不会有洞
      rect(0, 0, 32, 16, skin),
      rect(8, 0, 16, 8, hair), // 头顶
      rect(0, 8, 32, 3, hair), // 四面头发
      rect(8, 11, 1, 2, hair),
      rect(15, 11, 1, 2, hair),
      rect(10, 12, 1, 1, "#f4f7f1"), // 眼白
      rect(13, 12, 1, 1, "#f4f7f1"),
      rect(11, 12, 1, 1, iris), // 眼珠
      rect(14, 12, 1, 1, iris),
      rect(11, 14, 2, 1, "#a9714f"), // 嘴
      // 身体
      rect(16, 16, 24, 16, shirt),
      rect(20, 16, 8, 4, shirt),
      rect(23, 20, 2, 12, stripe), // 胸前条纹
      // 右臂 / 右腿（带顶面）
      rect(40, 16, 16, 16, skin),
      rect(40, 20, 16, 3, shirt), // 袖口
      rect(0, 16, 16, 16, pants),
      rect(0, 30, 16, 2, shoes), // 鞋
      // 左腿 / 左臂（64x64 布局）
      rect(16, 48, 16, 16, pants),
      rect(16, 62, 16, 2, shoes),
      rect(32, 48, 16, 16, skin),
      rect(32, 52, 16, 3, shirt),
    ])
    .png()
    .toBuffer();
}

export interface SkinAsset {
  png: Buffer;
  slim: boolean;
  /** 是否真实玩家皮肤 */
  real: boolean;
  /** 上游抖动导致的兜底结果，不应缓存 */
  transient: boolean;
}

/** 原始皮肤 PNG（64x64 或旧版 64x32），3D 模型直接用 */
export async function rawSkinPng(uuid: string): Promise<SkinAsset> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(uuid, "raw.png");
  const tex = await getTextures(uuid);
  if (tex.kind === "error") return { png: await defaultSkin(uuid), slim: false, real: false, transient: true };
  if (tex.kind === "none") return { png: await defaultSkin(uuid), slim: false, real: false, transient: false };
  const cached = await readFresh(file);
  if (cached) return { png: cached, slim: tex.tex.slim, real: true, transient: false };
  const png = await fetchImage(tex.tex.skinUrl);
  if (!png) return { png: await defaultSkin(uuid), slim: false, real: false, transient: true };
  writeFile(file, png).catch(() => {});
  return { png, slim: tex.tex.slim, real: true, transient: false };
}

/** 披风 PNG；没有披风返回 null。transient 表示上游抖动，别缓存 404 */
export async function capePng(uuid: string): Promise<{ png: Buffer | null; transient: boolean }> {
  const tex = await getTextures(uuid);
  if (tex.kind === "error") return { png: null, transient: true };
  if (tex.kind === "none" || !tex.tex.capeUrl) return { png: null, transient: false };
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(uuid, "cape.png");
  const cached = await readFresh(file);
  if (cached) return { png: cached, transient: false };
  const png = await fetchImage(tex.tex.capeUrl);
  if (!png) return { png: null, transient: true };
  writeFile(file, png).catch(() => {});
  return { png, transient: false };
}

interface Part {
  src: { left: number; top: number; width: number; height: number };
  dst: { left: number; top: number };
  flop?: boolean;
}

/** 正面各部件在 64x64 皮肤图里的位置，slim 模型手臂宽 3 */
function bodyParts(legacy: boolean, slim: boolean): { base: Part[]; overlay: Part[] } {
  const aw = slim ? 3 : 4;
  const armL = slim ? 1 : 0;
  const base: Part[] = [
    { src: { left: 8, top: 8, width: 8, height: 8 }, dst: { left: 4, top: 0 } },
    { src: { left: 20, top: 20, width: 8, height: 12 }, dst: { left: 4, top: 8 } },
    { src: { left: 44, top: 20, width: aw, height: 12 }, dst: { left: armL, top: 8 } },
    { src: { left: 4, top: 20, width: 4, height: 12 }, dst: { left: 4, top: 20 } },
  ];
  const overlay: Part[] = [{ src: { left: 40, top: 8, width: 8, height: 8 }, dst: { left: 4, top: 0 } }];
  if (legacy) {
    base.push(
      { src: { left: 44, top: 20, width: aw, height: 12 }, dst: { left: 12, top: 8 }, flop: true },
      { src: { left: 4, top: 20, width: 4, height: 12 }, dst: { left: 8, top: 20 }, flop: true },
    );
  } else {
    base.push(
      { src: { left: 36, top: 52, width: aw, height: 12 }, dst: { left: 12, top: 8 } },
      { src: { left: 20, top: 52, width: 4, height: 12 }, dst: { left: 8, top: 20 } },
    );
    overlay.push(
      { src: { left: 20, top: 36, width: 8, height: 12 }, dst: { left: 4, top: 8 } },
      { src: { left: 44, top: 36, width: aw, height: 12 }, dst: { left: armL, top: 8 } },
      { src: { left: 52, top: 52, width: aw, height: 12 }, dst: { left: 12, top: 8 } },
      { src: { left: 4, top: 36, width: 4, height: 12 }, dst: { left: 4, top: 20 } },
      { src: { left: 4, top: 52, width: 4, height: 12 }, dst: { left: 8, top: 20 } },
    );
  }
  return { base, overlay };
}

async function cut(skin: Buffer, p: Part): Promise<OverlayOptions> {
  let img = sharp(skin).extract(p.src);
  if (p.flop) img = img.flop();
  return { input: await img.png().toBuffer(), left: p.dst.left, top: p.dst.top };
}

/**
 * 第二层（帽子、外套、袖裤）的老皮肤兼容：早期皮肤把没用的第二层区域填成不透明纯黑，
 * 游戏里当作透明处理。这里同样处理：整层不透明时把纯黑当透明；处理后仍然整层不透明的直接丢弃。
 */
async function cleanOverlay(layer: OverlayOptions): Promise<OverlayOptions | null> {
  const { data, info } = await sharp(layer.input as Buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
  if (opaque < px) return layer;
  let stillOpaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + 3] = 0;
    else stillOpaque++;
  }
  if (stillOpaque === px) return null;
  const input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { ...layer, input };
}

async function compose(skin: Buffer, view: SkinView, slim: boolean): Promise<Buffer> {
  const meta = await sharp(skin).metadata();
  const legacy = (meta.height ?? 64) < 64;
  const rgba = await sharp(skin).ensureAlpha().png().toBuffer();
  if (view === "face") {
    const face = await cut(rgba, { src: { left: 8, top: 8, width: 8, height: 8 }, dst: { left: 0, top: 0 } });
    const hat = await cleanOverlay(await cut(rgba, { src: { left: 40, top: 8, width: 8, height: 8 }, dst: { left: 0, top: 0 } }));
    return sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(hat ? [face, hat] : [face])
      .png()
      .toBuffer()
      .then((b) => sharp(b).resize(8 * SCALE_FACE, 8 * SCALE_FACE, { kernel: sharp.kernel.nearest }).png().toBuffer());
  }
  const { base, overlay } = bodyParts(legacy, slim);
  const baseLayers = await Promise.all(base.map((p) => cut(rgba, p)));
  const overlayLayers = (await Promise.all(overlay.map(async (p) => cleanOverlay(await cut(rgba, p))))).filter((l): l is OverlayOptions => l !== null);
  const small = await sharp({ create: { width: 16, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([...baseLayers, ...overlayLayers])
    .png()
    .toBuffer();
  return sharp(small).resize(16 * SCALE_BODY, 32 * SCALE_BODY, { kernel: sharp.kernel.nearest }).png().toBuffer();
}

/** 2D 立绘 / 头像；总是返回一张图 */
export async function portraitPng(uuid: string, view: SkinView): Promise<{ png: Buffer; transient: boolean }> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cacheFile(uuid, `${view}.png`);
  const cached = await readFresh(file);
  if (cached) return { png: cached, transient: false };
  const skin = await rawSkinPng(uuid);
  const png = await compose(skin.png, view, skin.slim);
  if (!skin.transient) writeFile(file, png).catch(() => {});
  return { png, transient: skin.transient };
}
