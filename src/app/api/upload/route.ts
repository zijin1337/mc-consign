import { unlink } from "node:fs/promises";
import { lt } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser, isBanned } from "@/lib/auth";
import { imageUrl } from "@/lib/image-url";
import { consume } from "@/lib/rate-limit";
import { MAX_IMAGE_BYTES, UploadError, resolveUploadPath, saveListingImage } from "@/lib/upload";

/**
 * 单张截图上传。表单只提交图片 id，不再把文件塞进 Server Action，
 * 所以 Server Action 的体积上限可以降回 2MB，匿名可达的登录 / 验证码接口不再吃 50MB 的请求。
 * 上传成功进 pending_images，提交商品时认领；24 小时没认领的自动清理。
 */

const PENDING_TTL_MS = 24 * 60 * 60_000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || isBanned(user)) return json({ ok: false, message: "请先登录" }, 401);
  if (!consume(`upload:user:${user.id}`, 40, 10 * 60_000).ok) return json({ ok: false, message: "上传太频繁，请稍后再试" }, 429);

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) return json({ ok: false, message: "单张图片不能超过 5MB" }, 413);

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (f instanceof File) file = f;
  } catch {
    return json({ ok: false, message: "上传请求无效，请刷新后重试" }, 400);
  }
  if (!file || file.size === 0) return json({ ok: false, message: "没有收到图片，请重新选择" }, 400);

  try {
    const saved = await saveListingImage(file);
    const [row] = await db
      .insert(schema.pendingImages)
      .values({ userId: user.id, path: saved.path, width: saved.width, height: saved.height, bytes: saved.bytes })
      .returning({ id: schema.pendingImages.id });
    after(() => cleanupStale());
    return json({ ok: true, id: row.id, url: imageUrl(saved.path), width: saved.width, height: saved.height });
  } catch (e) {
    if (e instanceof UploadError) return json({ ok: false, message: e.message }, 422);
    console.error("[upload]", e);
    return json({ ok: false, message: "图片处理失败，请换一张试试" }, 500);
  }
}

/** 删掉 24 小时前上传却没挂到商品上的图片及其文件 */
async function cleanupStale() {
  try {
    const rows = await db
      .delete(schema.pendingImages)
      .where(lt(schema.pendingImages.createdAt, new Date(Date.now() - PENDING_TTL_MS)))
      .returning({ path: schema.pendingImages.path });
    for (const r of rows) {
      const abs = resolveUploadPath(r.path);
      if (abs) unlink(abs).catch(() => {});
    }
  } catch (e) {
    console.error("[upload] cleanup failed", e instanceof Error ? e.message : e);
  }
}
