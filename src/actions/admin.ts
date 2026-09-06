"use server";

import { unlink } from "node:fs/promises";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { validateFeeTiers, type FeeTier } from "@/lib/fee";
import { formatDateTime } from "@/lib/labels";
import { extendPin, type PinUnit } from "@/lib/pin";
import { snapshotForIgn } from "@/lib/hypixel/service";
import { portraitPng } from "@/lib/hypixel/skin";
import { ImageClaimError, claimPendingImages, parseImageIds, parseListingForm } from "@/lib/listing-input";
import { notify } from "@/lib/notify";
import { closeOpenOrdersForListing, detachAgentOrders } from "@/lib/order-ops";
import { SETTING_DEFAULTS, getSettings, setSetting, type Settings } from "@/lib/settings";
import { MAX_IMAGES, resolveUploadPath } from "@/lib/upload";
import type { FormState } from "./types";

const { listings, listingImages, users, sessions, blacklist, creditLogs, bannedWords, orders } = schema;

async function admin() {
  return requireRole(["admin"], "/admin");
}

function int(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function text(v: FormDataEntryValue | null, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// ---------- 审核 ----------

export async function reviewListing(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const decision = form.get("decision");
  const note = text(form.get("note"));
  if (!id) return;
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.status !== "pending_review") return;

  // 更新语句带上状态条件：两个超管同时点，或卖家同时下架，只有一个能生效
  if (decision === "approve") {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(listings)
        .set({
          status: "on_sale",
          approvedAt: l.approvedAt ?? new Date(),
          reviewedBy: me.id,
          reviewedAt: new Date(),
          reviewNote: null,
          dirtySinceApproval: false,
        })
        .where(and(eq(listings.id, id), eq(listings.status, "pending_review")))
        .returning({ id: listings.id });
      if (!row) return;
      await audit(me.id, "review_approve", "listing", id, undefined, tx);
      await notify(l.sellerId, { type: "review_passed", title: "账号审核通过", body: `「${l.title}」已通过审核并上架。有买家下单会通知你。`, link: `/listings/${id}` }, tx);
    });
    // 预热账号卡头像，首页首屏不用等 Mojang
    if (l.mcUuid) {
      const uuid = l.mcUuid;
      after(() => portraitPng(uuid, "face").then(() => undefined, () => undefined));
    }
  } else if (decision === "reject") {
    if (!note) return;
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(listings)
        .set({ status: "rejected", reviewedBy: me.id, reviewedAt: new Date(), reviewNote: note })
        .where(and(eq(listings.id, id), eq(listings.status, "pending_review")))
        .returning({ id: listings.id });
      if (!row) return;
      await audit(me.id, "review_reject", "listing", id, { after: { note } }, tx);
      await notify(l.sellerId, { type: "review_rejected", title: "账号审核未通过", body: `「${l.title}」未通过审核：${note}。修改后可重新提交。`, link: `/sell/${id}/edit` }, tx);
    });
  }
  revalidatePath("/");
  revalidatePath("/admin/review");
  revalidatePath("/admin/listings");
}

// ---------- 商品管理 ----------

export async function adminUpdateListing(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return { message: "请求无效，请刷新后重试" };
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.status === "deleted") return { message: "账号不存在" };

  const parsed = await parseListingForm(form, l.sellerId);
  if (!parsed.ok) return parsed.state;
  const { values, base, attrs, title } = parsed;

  const existing = await db.select().from(listingImages).where(eq(listingImages.listingId, id)).orderBy(asc(listingImages.sortOrder));
  const removeIds = new Set(form.getAll("removeImage").map(Number).filter(Number.isInteger));
  const keep = existing.filter((img) => !removeIds.has(img.id));
  const imageIds = parseImageIds(form);
  if (keep.length + imageIds.length === 0) return { errors: { images: "至少保留 1 张截图" }, values };
  if (keep.length + imageIds.length > MAX_IMAGES) return { errors: { images: `最多 ${MAX_IMAGES} 张截图` }, values };

  const before = { title: l.title, price: l.price, feeMode: l.feeMode, source: l.source, hasTransactionId: l.hasTransactionId, contact: l.contact, note: l.note, preferredAgentId: l.preferredAgentId, attrs: l.attrs };
  const hx = await snapshotForIgn(String(attrs.ign ?? ""));
  const after = {
    title,
    price: base.price,
    feeMode: base.feeMode,
    source: base.source,
    hasTransactionId: base.hasTransactionId,
    contact: base.contact,
    note: base.note || null,
    preferredAgentId: base.preferredAgentId,
    attrs,
    mcUuid: hx?.uuid ?? l.mcUuid,
    apiSnapshot: hx?.snapshot ?? l.apiSnapshot,
  };

  try {
    await db.transaction(async (tx) => {
      // 超管自己上传的图，按超管的 id 认领
      const added = await claimPendingImages(tx, me.id, imageIds);
      await tx.update(listings).set(after).where(eq(listings.id, id));
      if (removeIds.size) await tx.delete(listingImages).where(and(eq(listingImages.listingId, id), inArray(listingImages.id, [...removeIds])));
      for (let i = 0; i < keep.length; i++) await tx.update(listingImages).set({ sortOrder: i }).where(eq(listingImages.id, keep[i].id));
      if (added.length) {
        await tx.insert(listingImages).values(added.map((s, i) => ({ listingId: id, path: s.path, sortOrder: keep.length + i, width: s.width, height: s.height, bytes: s.bytes })));
      }
      await audit(me.id, "edit_listing", "listing", id, { before, after: { ...after, removedImages: [...removeIds], addedImages: added.length } }, tx);
    });
  } catch (e) {
    if (e instanceof ImageClaimError) return { errors: { images: e.message }, values };
    throw e;
  }
  for (const img of existing) {
    if (!removeIds.has(img.id)) continue;
    const abs = resolveUploadPath(img.path);
    if (abs) unlink(abs).catch(() => {});
  }
  revalidatePath("/");
  revalidatePath(`/listings/${id}`);
  revalidatePath(`/admin/listings/${id}`);
  return { ok: true, message: "已保存，账号状态不变", values: parsed.values };
}

export async function setListingWeight(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const weight = int(form.get("weight")) ?? 0;
  if (!id || Math.abs(weight) > 1_000_000) return;
  const [l] = await db.select({ weight: listings.weight }).from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.weight === weight) return;
  await db.transaction(async (tx) => {
    await tx.update(listings).set({ weight }).where(eq(listings.id, id));
    await audit(me.id, "set_weight", "listing", id, { before: l.weight, after: weight }, tx);
  });
  revalidatePath("/");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
}

/**
 * 置顶（或延长置顶）。已在置顶中则从当前截止时间往后延长，否则从现在开始。
 * 到期自动从置顶栏撤下，不需要定时任务。
 */
export async function pinListing(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const amount = int(form.get("amount"));
  const unit: PinUnit = form.get("unit") === "hours" ? "hours" : "days";
  if (!id || !amount) return;
  const [l] = await db
    .select({ status: listings.status, title: listings.title, sellerId: listings.sellerId, pinnedUntil: listings.pinnedUntil })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);
  if (!l || l.status === "sold" || l.status === "deleted") return;
  const until = extendPin(l.pinnedUntil, amount, unit);
  if (!until) return;
  await db.transaction(async (tx) => {
    await tx.update(listings).set({ pinnedUntil: until }).where(eq(listings.id, id));
    await audit(me.id, "set_pinned", "listing", id, { before: l.pinnedUntil, after: { pinnedUntil: until, amount, unit } }, tx);
    await notify(
      l.sellerId,
      { type: "listing_pinned", title: "账号已被置顶", body: `「${l.title}」已被平台置顶展示，置顶至 ${formatDateTime(until)}。`, link: `/listings/${id}` },
      tx,
    );
  });
  revalidatePath("/");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
}

export async function unpinListing(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [l] = await db.select({ pinnedUntil: listings.pinnedUntil }).from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || !l.pinnedUntil) return;
  await db.transaction(async (tx) => {
    await tx.update(listings).set({ pinnedUntil: null }).where(eq(listings.id, id));
    await audit(me.id, "set_pinned", "listing", id, { before: l.pinnedUntil, after: null }, tx);
  });
  revalidatePath("/");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
}

/** 强制下架，卖家重新上架需重审 */
export async function forceOffShelf(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || !["on_sale", "pending_review", "rejected"].includes(l.status)) return;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(listings)
      .set({ status: "off_shelf", dirtySinceApproval: true })
      .where(and(eq(listings.id, id), inArray(listings.status, ["on_sale", "pending_review", "rejected"])))
      .returning({ id: listings.id });
    if (!row) return;
    await closeOpenOrdersForListing(tx, id, {
      reason: "listing_unavailable",
      note: "账号被平台下架",
      title: "账号已被平台下架",
      body: `「${l.title}」已被平台下架，相关意向单已全部关闭。`,
      operatorId: me.id,
    });
    await audit(me.id, "force_off_shelf", "listing", id, { before: l.status }, tx);
    await notify(l.sellerId, { type: "review_rejected", title: "账号已被平台下架", body: `「${l.title}」已被平台下架。修改后重新提交审核，通过后可以再上架。`, link: `/sell/${id}/edit` }, tx);
  });
  revalidatePath("/");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
  revalidatePath("/orders");
  revalidatePath("/agent");
}

export async function deleteListing(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.status === "deleted" || l.status === "in_trade") return;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(listings)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(and(eq(listings.id, id), sql`${listings.status} not in ('deleted', 'in_trade')`))
      .returning({ id: listings.id });
    if (!row) return;
    await closeOpenOrdersForListing(tx, id, {
      reason: "listing_unavailable",
      note: "账号已被删除",
      title: "账号已被删除",
      body: `「${l.title}」已被平台删除，相关意向单已全部关闭。`,
      operatorId: me.id,
    });
    await audit(me.id, "delete_listing", "listing", id, { before: l.status }, tx);
  });
  revalidatePath("/");
  revalidatePath("/admin/listings");
  revalidatePath("/orders");
  revalidatePath("/agent");
  redirect("/admin/listings?status=deleted");
}

export async function restoreListing(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [l] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!l || l.status !== "deleted") return;
  await db.transaction(async (tx) => {
    await tx.update(listings).set({ status: "off_shelf", deletedAt: null, dirtySinceApproval: true }).where(eq(listings.id, id));
    await audit(me.id, "restore_listing", "listing", id, undefined, tx);
  });
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
}

// ---------- 用户管理 ----------

export async function banUser(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const reason = text(form.get("reason"));
  const days = int(form.get("days")) ?? 0;
  if (!id || !reason || id === me.id) return;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.role === "admin") return;
  const banUntil = days > 0 ? new Date(Date.now() + days * 86400_000) : null;

  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "banned", banReason: reason, banUntil, creditScore: 0 }).where(eq(users.id, id));
    if (u.creditScore !== 0) {
      await tx.insert(creditLogs).values({ userId: id, delta: -u.creditScore, balanceAfter: 0, reasonType: "ban", reasonText: `封禁清零：${reason}`, operatorId: me.id });
    }

    // 作为卖家：所有未售出的商品下架（含交易中的），上面的意向单全部关闭
    const sellerListings = await tx
      .select({ id: listings.id, title: listings.title })
      .from(listings)
      .where(and(eq(listings.sellerId, id), inArray(listings.status, ["pending_review", "on_sale", "rejected", "in_trade"])))
      .for("update");
    if (sellerListings.length) {
      await tx
        .update(listings)
        .set({ status: "off_shelf", dirtySinceApproval: true })
        .where(inArray(listings.id, sellerListings.map((x) => x.id)));
      for (const sl of sellerListings) {
        await closeOpenOrdersForListing(tx, sl.id, {
          reason: "listing_unavailable",
          note: "卖家账号被封禁",
          title: "账号已下架",
          body: `「${sl.title}」的卖家已被平台封禁，账号已下架，相关意向单已全部关闭。`,
          operatorId: me.id,
        });
      }
    }

    // 作为买家：进行中的意向单全部关闭；交易中的商品恢复在售并通知卖家与中介
    const buyerOrders = await tx
      .select({ id: orders.id, status: orders.status, listingId: orders.listingId, sellerId: orders.sellerId, agentId: orders.agentId })
      .from(orders)
      .where(and(eq(orders.buyerId, id), inArray(orders.status, ["pending_assign", "pending_contact", "in_progress"])))
      .for("update");
    if (buyerOrders.length) {
      await tx
        .update(orders)
        .set({ status: "cancelled", cancelReason: "other", cancelNote: "买家账号被封禁", cancelledBy: me.id, cancelledAt: new Date() })
        .where(inArray(orders.id, buyerOrders.map((o) => o.id)));
      for (const o of buyerOrders) {
        if (o.status === "in_progress") {
          await tx.update(listings).set({ status: "on_sale" }).where(and(eq(listings.id, o.listingId), eq(listings.status, "in_trade")));
        }
        await notify(o.sellerId, { type: "order_cancelled", title: "意向单已取消", body: `意向单 #${o.id} 的买家已被平台封禁，意向单已关闭${o.status === "in_progress" ? "，账号已恢复在售" : ""}。`, link: `/orders/${o.id}` }, tx);
        if (o.agentId) await notify(o.agentId, { type: "order_cancelled", title: "意向单已取消", body: `意向单 #${o.id} 的买家已被平台封禁，意向单已关闭，无需再联系。`, link: `/orders/${o.id}` }, tx);
      }
    }

    // 作为中介：名下进行中的单退回待分派 / 清空中介，通知超管改派
    if (u.role === "agent") await detachAgentOrders(tx, id, `中介 ${u.username} 被封禁`);

    await tx.delete(sessions).where(eq(sessions.userId, id));
    await tx
      .insert(blacklist)
      .values([
        { type: "qq", value: u.qq, reason, sourceUserId: id },
        { type: "phone", value: u.phone, reason, sourceUserId: id },
      ])
      .onConflictDoNothing();
    await audit(me.id, "ban_user", "user", id, { after: { reason, banUntil } }, tx);
    await notify(id, { type: "banned", title: "账号已封禁", body: `你的账号已被封禁，原因：${reason}。${banUntil ? `${formatDateTime(banUntil)} 解封。` : "永久封禁。"}` }, tx);
  });
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath("/agent");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/users/${id}`);
}

export async function unbanUser(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.status !== "banned") return;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "active", banReason: null, banUntil: null }).where(eq(users.id, id));
    await tx.delete(blacklist).where(eq(blacklist.sourceUserId, id));
    await audit(me.id, "unban_user", "user", id, undefined, tx);
  });
  revalidatePath(`/admin/users/${id}`);
}

export async function setRole(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const role = form.get("role");
  if (!id || id === me.id) return;
  if (role !== "user" && role !== "agent" && role !== "admin") return;
  const [u] = await db.select({ role: users.role, username: users.username }).from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.role === role) return;
  const label = { user: "普通用户", agent: "中介", admin: "超管" }[role];
  await db.transaction(async (tx) => {
    await tx.update(users).set({ role }).where(eq(users.id, id));
    // 失去中介资格：名下进行中的单要有人接手
    if (role === "user") await detachAgentOrders(tx, id, `${u.username} 已不再是中介`);
    await audit(me.id, "set_role", "user", id, { before: u.role, after: role }, tx);
    await notify(id, { type: "role_changed", title: "角色已变更", body: `你的角色已调整为「${label}」。`, link: role === "user" ? "/me" : "/agent" }, tx);
  });
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/agent");
}

export async function updateAgentProfile(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const agentIntro = text(form.get("agentIntro"), 60) || null;
  const agentAccepting = form.get("agentAccepting") === "on";
  await db.transaction(async (tx) => {
    await tx.update(users).set({ agentIntro, agentAccepting }).where(eq(users.id, id));
    await audit(me.id, "edit_agent", "user", id, { after: { agentIntro, agentAccepting } }, tx);
  });
  revalidatePath(`/admin/users/${id}`);
}

export async function adjustCredit(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  const delta = int(form.get("delta"));
  const reason = text(form.get("reason"));
  if (!id || !delta || !reason || Math.abs(delta) > 100_000) return;
  await db.transaction(async (tx) => {
    const [u] = await tx.select({ score: users.creditScore }).from(users).where(eq(users.id, id)).for("update");
    if (!u) return;
    const after = Math.max(0, u.score + delta);
    await tx.update(users).set({ creditScore: after }).where(eq(users.id, id));
    await tx.insert(creditLogs).values({ userId: id, delta: after - u.score, balanceAfter: after, reasonType: "manual", reasonText: reason, operatorId: me.id });
    await audit(me.id, "credit_adjust", "user", id, { before: u.score, after }, tx);
    await notify(id, { type: "credit_changed", title: "信用分已调整", body: `平台调整了你的信用分 ${delta > 0 ? "+" : ""}${after - u.score}，原因：${reason}。当前 ${after} 分。`, link: "/me/credit" }, tx);
  });
  revalidatePath("/");
  revalidatePath(`/admin/users/${id}`);
}

// ---------- 配置 ----------

export async function updateSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await admin();
  const current = await getSettings();
  const errors: Record<string, string> = {};
  const next: Partial<Settings> = {};

  const tiers: FeeTier[] = [];
  for (let i = 0; i < 8; i++) {
    const min = int(form.get(`tier_min_${i}`));
    const maxRaw = form.get(`tier_max_${i}`);
    const type = form.get(`tier_type_${i}`);
    const value = int(form.get(`tier_value_${i}`));
    if (min === null && value === null) continue;
    if (min === null || value === null || (type !== "fixed" && type !== "percent")) {
      errors.fee_tiers = `第 ${i + 1} 档填写不完整`;
      break;
    }
    const max = typeof maxRaw === "string" && maxRaw.trim() !== "" ? int(maxRaw) : null;
    tiers.push({ min, max, type, value });
  }
  if (!errors.fee_tiers) {
    const err = validateFeeTiers(tiers);
    if (err) errors.fee_tiers = err;
    else next.fee_tiers = tiers;
  }

  const numericKeys = [
    "warranty_days",
    "max_active_listings",
    "min_credit_to_list",
    "max_open_orders",
    "no_show_limit",
    "no_show_lock_days",
    "credit_penalty_aftersale",
    "credit_penalty_no_show",
    "wanted_max_active",
    "wanted_default_days",
  ] as const;
  for (const k of numericKeys) {
    const n = int(form.get(k));
    if (n === null || n < 0 || n > 100_000) errors[k] = "请填写 0～100000 的整数";
    else next[k] = n;
  }
  next.show_sold_price = form.get("show_sold_price") === "on";
  next.announcement = text(form.get("announcement"), 300);

  if (Object.keys(errors).length) return { errors, message: "有填写错误，配置未保存" };

  const changed: string[] = [];
  await db.transaction(async (tx) => {
    for (const k of Object.keys(next) as Array<keyof Settings>) {
      const before = current[k];
      const after = next[k]!;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      await setSetting(k, after as never, me.id, tx);
      await audit(me.id, "setting_change", "setting", null, { before: { [k]: before }, after: { [k]: after } }, tx);
      changed.push(k);
    }
  });
  revalidatePath("/");
  revalidatePath("/sold");
  return { ok: true, message: changed.length ? `已保存 ${changed.length} 项修改` : "没有变化" };
}

export async function resetSettingsToDefault(): Promise<void> {
  const me = await admin();
  for (const k of Object.keys(SETTING_DEFAULTS) as Array<keyof Settings>) {
    await setSetting(k, SETTING_DEFAULTS[k] as never, me.id);
  }
  await audit(me.id, "setting_change", "setting", null, { after: "reset_to_default" });
  revalidatePath("/admin/settings");
}

// ---------- 违禁词 ----------

export async function addBannedWord(form: FormData): Promise<void> {
  const me = await admin();
  const word = text(form.get("word"), 30);
  if (!word) return;
  const [row] = await db.insert(bannedWords).values({ word, createdBy: me.id }).onConflictDoNothing().returning({ id: bannedWords.id });
  if (row) await audit(me.id, "banned_word_add", "banned_word", row.id, { after: word });
  revalidatePath("/admin/banned-words");
}

export async function removeBannedWord(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const [row] = await db.delete(bannedWords).where(eq(bannedWords.id, id)).returning({ word: bannedWords.word });
  if (row) await audit(me.id, "banned_word_remove", "banned_word", id, { before: row.word });
  revalidatePath("/admin/banned-words");
}
