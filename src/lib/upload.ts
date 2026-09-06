import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata, type OutputInfo } from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 9;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** 按真实内容识别出的格式，浏览器声明的 MIME 不可信 */
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_WIDTH = 1600;
/** 4000 x 10000 级别的图已经远超截图需要，再大就是解压炸弹 */
const MAX_INPUT_PIXELS = 40_000_000;

export const UPLOAD_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR || "./uploads");

export class UploadError extends Error {}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** 水印：右下角一条站名，中间一条斜向淡水印，防截图盗用。 */
function watermarkSvg(width: number, height: number): Buffer {
  const text = escapeXml(process.env.WATERMARK_TEXT || process.env.SITE_NAME || "方块寄售平台");
  const small = Math.max(16, Math.round(width / 32));
  const big = Math.max(28, Math.round(width / 12));
  const pad = Math.round(small * 0.8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>text{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;font-weight:600}</style>
  <text x="${width - pad}" y="${height - pad}" text-anchor="end" font-size="${small}" fill="#fff" fill-opacity="0.85" stroke="#000" stroke-opacity="0.35" stroke-width="1">${text}</text>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${big}" fill="#fff" fill-opacity="0.16" transform="rotate(-28 ${width / 2} ${height / 2})">${text}</text>
</svg>`;
  return Buffer.from(svg);
}

export interface SavedImage {
  path: string;
  width: number;
  height: number;
  bytes: number;
}

/** 校验、压缩、打水印、落盘。返回相对 UPLOAD_ROOT 的路径。原图不保留。 */
export async function saveListingImage(file: File): Promise<SavedImage> {
  if (!ALLOWED_TYPES.has(file.type)) throw new UploadError("只支持 jpg、png、webp 图片");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("单张图片不能超过 5MB");

  const input = Buffer.from(await file.arrayBuffer());
  let img = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  let meta: Metadata;
  try {
    meta = await img.metadata();
  } catch {
    throw new UploadError("图片无法识别，请换一张");
  }
  if (!meta.width || !meta.height || !meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new UploadError("只支持 jpg、png、webp 图片");
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new UploadError("图片尺寸过大，请先缩小再上传");

  img = img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  let resized: { data: Buffer; info: OutputInfo };
  try {
    resized = await img.toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError("图片处理失败，请换一张试试");
  }
  const w = resized.info.width;
  const h = resized.info.height;

  const out = await sharp(resized.data)
    .composite([{ input: watermarkSvg(w, h), top: 0, left: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const now = new Date();
  const rel = path.posix.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.jpg`,
  );
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, out);
  return { path: rel, width: w, height: h, bytes: out.length };
}

/** 把相对路径解析到上传目录内，拒绝目录穿越。 */
export function resolveUploadPath(rel: string): string | null {
  const abs = path.resolve(UPLOAD_ROOT, rel);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep)) return null;
  return abs;
}
