"use server";

import { unlink } from "node:fs/promises";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { snapshotForIgn } from "@/lib/hypixel/service";
import { ImageClaimError, claimPendingImages, parseImageIds, parseListingForm } from "@/lib/listing-input";
import { sellerListingBlock } from "@/lib/listings";
import { closeOpenOrdersForListing, notifyOpenOrders } from "@/lib/order-ops";
import { getSettings } from "@/lib/settings";
import { MAX_IMAGES, resolveUploadPath } from "@/lib/upload";
import type { FormState } from "./types";

const { listings, listingImages } = schema;
const EDITABLE = ["pending_review", "on_sale", "rejected", "off_shelf"] as const;

export async function createListing(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/sell/new");
  const settings = await getSettings();
  const blocked = await sellerListingBlock(user, settings);
  if (blocked) return { message: blocked };

  const parsed = await parseListingForm(form, user.id);
  if (!parsed.ok) return parsed.state;
  const { values, base, attrs, title, gameId } = parsed;

  const imageIds = parseImageIds(form);
  if (imageIds.length === 0) return { errors: { images: "请至少上传 1 张游戏截图" }, values };
  if (imageIds.length > MAX_IMAGES) return { errors: { images: `最多上传 ${MAX_IMAGES} 张截图` }, values };

  const hx = await snapshotForIgn(String(attrs.ign ?? ""));

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const images = await claimPendingImages(tx, user.id, imageIds);
      const [row] = await tx
        .insert(listings)
        .values({
          sellerId: user.id,
          gameId,
          title,
          price: base.price,
          feeMode: base.feeMode,
          source: base.source,
          hasTransactionId: base.hasTransactionId,
          contact: base.contact,
          note: base.note || null,
          preferredAgentId: base.preferredAgentId,
          attrs,
          mcUuid: hx?.uuid ?? null,
          apiSnapshot: hx?.snapshot ?? null,
          status: "pending_review",
        })
        .returning({ id: listings.id });
      await tx.insert(listingImages).values(images.map((s, i) => ({ listingId: row.id, path: s.path, sortOrder: i, width: s.width, height: s.height, bytes: s.bytes })));
      return row.id;
    });
  } catch (e) {
    if (e instanceof ImageClaimError) return { errors: { images: e.message }, values };
    throw e;
  }

  revalidatePath("/");
  redirect(`/me?submitted=${id}`);
}

export async function updateListing(_prev: FormState, form: FormData): Promise<FormState> {
  const id = Number(form.get("id"));
  const user = await requireUser(`/sell/${id}/edit`);
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.sellerId !== user.id) return { message: "账号不存在" };
  if (!(EDITABLE as readonly string[]).includes(l.status)) return { message: "账号当前状态不能编辑" };

  // 被拒 / 已下架的账号编辑后会重新进入审核，等于重新占一个上架名额，要过同样的门槛
  if (l.status === "rejected" || l.status === "off_shelf") {
    const blocked = await sellerListingBlock(user, await getSettings(), id);
    if (blocked) return { message: blocked };
  }

  const parsed = await parseListingForm(form, user.id);
  if (!parsed.ok) return parsed.state;
  const { values, base, attrs, title } = parsed;

  const existing = await db.select().from(listingImages).where(eq(listingImages.listingId, id)).orderBy(asc(listingImages.sortOrder));
  const removeIds = new Set(form.getAll("removeImage").map(Number).filter(Number.isInteger));
  const keep = existing.filter((img) => !removeIds.has(img.id));
  const imageIds = parseImageIds(form);
  if (keep.length + imageIds.length === 0) return { errors: { images: "至少保留 1 张截图" }, values };
  if (keep.length + imageIds.length > MAX_IMAGES) return { errors: { images: `最多 ${MAX_IMAGES} 张截图` }, values };

  const hx = await snapshotForIgn(String(attrs.ign ?? ""));
  // 已下架的编辑后保持下架但标记需重审；其他状态一律回到待审核
  const nextStatus = l.status === "off_shelf" ? "off_shelf" : "pending_review";

  let changed: boolean;
  try {
    changed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(listings)
        .set({
          title,
          price: base.price,
          feeMode: base.feeMode,
          source: base.source,
          hasTransactionId: base.hasTransactionId,
          contact: base.contact,
          note: base.note || null,
          preferredAgentId: base.preferredAgentId,
          attrs,
          mcUuid: hx?.uuid ?? null,
          apiSnapshot: hx?.snapshot ?? null,
          status: nextStatus,
          dirtySinceApproval: nextStatus === "off_shelf",
          reviewNote: null,
        })
        .where(and(eq(listings.id, id), inArray(listings.status, [...EDITABLE])))
        .returning({ id: listings.id });
      if (!row) return false;
      const added = await claimPendingImages(tx, user.id, imageIds);
      if (removeIds.size) {
        await tx.delete(listingImages).where(and(eq(listingImages.listingId, id), inArray(listingImages.id, [...removeIds])));
      }
      for (let i = 0; i < keep.length; i++) {
        await tx.update(listingImages).set({ sortOrder: i }).where(eq(listingImages.id, keep[i].id));
      }
      if (added.length) {
        await tx.insert(listingImages).values(added.map((s, i) => ({ listingId: id, path: s.path, sortOrder: keep.length + i, width: s.width, height: s.height, bytes: s.bytes })));
      }
      // 在售期间修改会暂时下线重审，排队中的买家和中介需要知道
      if (l.status === "on_sale") {
        await notifyOpenOrders(tx, id, { title: "账号修改待重审", body: `卖家修改了「${title}」的信息，账号暂时下线，审核通过后交易继续。` });
      }
      return true;
    });
  } catch (e) {
    if (e instanceof ImageClaimError) return { errors: { images: e.message }, values };
    throw e;
  }
  if (!changed) return { message: "账号状态刚刚发生变化，请刷新后重试", values };

  for (const img of existing) {
    if (!removeIds.has(img.id)) continue;
    const abs = resolveUploadPath(img.path);
    if (abs) unlink(abs).catch(() => {});
  }

  revalidatePath("/");
  revalidatePath(`/listings/${id}`);
  revalidatePath("/admin/review");
  redirect(`/me?updated=${id}`);
}

/** 卖家下架：在售或待审核 → 已下架。排队中的意向单一并关闭并通知 */
export async function offShelfListing(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const user = await requireUser("/me");
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.sellerId !== user.id) return;
  if (l.status !== "on_sale" && l.status !== "pending_review") return;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(listings)
      .set({ status: "off_shelf", dirtySinceApproval: l.status === "pending_review" ? true : l.dirtySinceApproval })
      .where(and(eq(listings.id, id), inArray(listings.status, ["on_sale", "pending_review"])))
      .returning({ id: listings.id });
    if (!row) return;
    await closeOpenOrdersForListing(tx, id, {
      reason: "listing_unavailable",
      note: "卖家已下架该账号",
      title: "账号已下架",
      body: `「${l.title}」已被卖家下架，相关意向单已全部关闭。`,
      operatorId: user.id,
    });
  });
  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath("/orders");
  revalidatePath("/agent");
  revalidatePath(`/listings/${id}`);
}

/** 卖家重新上架：内容没改直接在售，改过则重新审核。要过上架门槛 */
export async function reShelfListing(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const user = await requireUser("/me");
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.sellerId !== user.id || l.status !== "off_shelf") return;
  const blocked = await sellerListingBlock(user, await getSettings(), id);
  if (blocked) redirect(`/me?error=${encodeURIComponent(blocked)}`);
  await db
    .update(listings)
    .set({ status: l.dirtySinceApproval ? "pending_review" : "on_sale" })
    .where(and(eq(listings.id, id), eq(listings.status, "off_shelf")));
  revalidatePath("/");
  revalidatePath("/me");
  revalidatePath("/admin/review");
}
