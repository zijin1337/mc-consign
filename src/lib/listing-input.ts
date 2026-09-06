import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { FormState } from "@/actions/types";
import { formValues } from "@/actions/types";
import { findBannedWord } from "./banned-words";
import { renderTitle } from "./games/mc";
import { getMcGame } from "./listings";
import { listingBaseSchema, parseAttrs, zodErrors } from "./validation";

const { users, bannedWords, pendingImages } = schema;
const BASE_KEYS = ["price", "feeMode", "source", "hasTransactionId", "contact", "note", "preferredAgentId"];

/** 表单里由上传器写入的图片 id，去重 */
export function parseImageIds(form: FormData): number[] {
  const ids = form
    .getAll("imageIds")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

export class ImageClaimError extends Error {}

export interface ClaimedImage {
  path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

/**
 * 把该用户上传的待挂图片从 pending_images 认领走，按表单里的顺序返回。
 * 缺一张（过期被清、不是本人上传、id 伪造）就抛错，让外层事务回滚。
 */
export async function claimPendingImages(tx: Tx, userId: number, ids: number[]): Promise<ClaimedImage[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(pendingImages)
    .where(and(eq(pendingImages.userId, userId), inArray(pendingImages.id, ids)))
    .for("update");
  if (rows.length !== ids.length) throw new ImageClaimError("有截图已过期或无效，请重新上传后再提交");
  await tx.delete(pendingImages).where(inArray(pendingImages.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const r = byId.get(id)!;
    return { path: r.path, width: r.width, height: r.height, bytes: r.bytes };
  });
}

/** 收集表单里的字符串值，出错时回填。多选属性用逗号拼接。 */
export function collectValues(form: FormData): Record<string, string> {
  const values = formValues(form, BASE_KEYS);
  const multi: Record<string, string[]> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("attr_") || typeof v !== "string") continue;
    (multi[k] ??= []).push(v);
  }
  for (const [k, arr] of Object.entries(multi)) values[k] = arr.join(",");
  return values;
}

export type ParsedListing =
  | { ok: false; state: FormState }
  | {
      ok: true;
      values: Record<string, string>;
      base: Awaited<ReturnType<typeof listingBaseSchema.parseAsync>>;
      attrs: Record<string, unknown>;
      title: string;
      gameId: number;
    };

/** 卖家和超管共用的商品表单解析：基础字段 + 游戏属性 + 违禁词 + 指定中介校验 */
export async function parseListingForm(form: FormData, sellerId: number): Promise<ParsedListing> {
  const values = collectValues(form);
  const game = await getMcGame();
  const errors: Record<string, string> = {};

  const base = listingBaseSchema.safeParse({
    price: form.get("price"),
    feeMode: form.get("feeMode"),
    source: form.get("source"),
    hasTransactionId: form.get("hasTransactionId"),
    contact: form.get("contact"),
    note: form.get("note") ?? "",
    preferredAgentId: form.get("preferredAgentId") ?? "",
  });
  if (!base.success) Object.assign(errors, zodErrors(base.error));

  const { attrs, errors: attrErrors } = parseAttrs(game.attrSchema, form);
  for (const [k, msg] of Object.entries(attrErrors)) errors[`attr_${k}`] = msg;
  if (Object.keys(errors).length) return { ok: false, state: { errors, values } };
  const d = base.data!;

  const words = (await db.select({ word: bannedWords.word }).from(bannedWords)).map((r) => r.word);
  const texts = [d.note, d.contact, ...game.attrSchema.filter((f) => f.type === "text").map((f) => String(attrs[f.key] ?? ""))];
  for (const t of texts) {
    const bad = findBannedWord(t, words);
    if (bad) return { ok: false, state: { message: `内容包含违禁词「${bad}」，请修改后再提交`, values } };
  }

  if (d.preferredAgentId !== null) {
    if (d.preferredAgentId === sellerId) return { ok: false, state: { errors: { preferredAgentId: "不能指定卖家自己为中介" }, values } };
    const [agent] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, d.preferredAgentId), inArray(users.role, ["agent", "admin"]), eq(users.status, "active")))
      .limit(1);
    if (!agent) return { ok: false, state: { errors: { preferredAgentId: "指定的中介不存在或已停止接单" }, values } };
  }

  return { ok: true, values, base: d, attrs, title: renderTitle(game.titleTemplate, attrs), gameId: game.id };
}
