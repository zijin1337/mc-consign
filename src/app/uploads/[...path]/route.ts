import { readFile } from "node:fs/promises";
import { resolveUploadPath } from "@/lib/upload";

const SAFE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/;

/** 输出上传目录里的图片。路径形如 /uploads/2026/09/<uuid>.jpg */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const rel = path.join("/");
  if (!SAFE.test(rel)) return new Response("Not found", { status: 404 });
  const abs = resolveUploadPath(rel);
  if (!abs) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
