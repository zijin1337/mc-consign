"use server";

import { and, asc, count, eq, gte, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole, requireUser, type SafeUser } from "@/lib/auth";
import { findBannedWord } from "@/lib/banned-words";
import { creditForDeal } from "@/lib/credit";
import { calcFee } from "@/lib/fee";
import { AGENT_CANCEL_REASONS, CANCEL_REASON_LABEL, formatDateTime, formatPrice } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { OPEN_ORDER_STATUSES, countOpenOrders, findOpenOrder, isoDate, type OrderStatus } from "@/lib/orders";
import { consume, retryText } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { attachWantedToOrder, fulfillWantedByOrder } from "@/lib/wanted";
import { formValues, type FormState } from "./types";

const { orders, listings, users, creditLogs, aftersales, bannedWords } = schema;
const OPEN = [...OPEN_ORDER_STATUSES];
/** 大纲第 7 节：同一对买卖双方 30 天内成交达到这个次数就标记异常提醒超管 */
const REPEAT_DEAL_LIMIT = 3;
const REPEAT_DEAL_WINDOW_MS = 30 * 86400_000;

/**
 * 所有状态迁移都在事务里先 `select ... for update` 锁住订单行、重新校验状态，再写。
 * 两个人同时点、双击、或者买家撤回与中介开始撞在一起时，只有一个能成功，另一个得到「状态已变化」。
 */
class StateConflict extends Error {
  constructor(public code: string = "state_changed") {
    super(code);
  }
}

function int(v: FormDataEntryValue | null, max = 2_147_483_647): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && Math.abs(n) <= max ? n : null;
}
function text(v: FormDataEntryValue | null, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

async function validAgent(id: number, mustAccept: boolean) {
  const [a] = await db
    .select({ id: users.id, username: users.username, agentAccepting: users.agentAccepting })
    .from(users)
    .where(and(eq(users.id, id), inArray(users.role, ["agent", "admin"]), eq(users.status, "active")))
    .limit(1);
  if (!a) return null;
  if (mustAccept && !a.agentAccepting) return null;
  return a;
}

async function activeAdminIds() {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return rows.map((r) => r.id);
}

function revalidateOrder(orderId: number, listingId: number) {
  revalidatePath("/");
  revalidatePath("/sold");
  revalidatePath("/me");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/agent");
  revalidatePath("/admin/orders");
}

/** 事务内锁住订单行并校验状态 */
async function lockOrder(tx: Tx, id: number, allowed: readonly OrderStatus[]) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
  if (!row || !allowed.includes(row.status)) throw new StateConflict();
  return row;
}

/** 事务内锁住商品行 */
async function lockListing(tx: Tx, id: number) {
  const [row] = await tx.select().from(listings).where(eq(listings.id, id)).for("update");
  if (!row) throw new StateConflict("listing_unavailable");
  return row;
}

/** 中介只能动自己名下的单；超管可以动任何单，但不能处理自己是买方或卖方的单 */
function canAct(user: SafeUser, o: { agentId: number | null; buyerId: number; sellerId: number }) {
  if (o.buyerId === user.id || o.sellerId === user.id) return false;
  return user.role === "admin" || o.agentId === user.id;
}

// ---------- 买家 ----------

export async function createOrder(_prev: FormState, form: FormData): Promise<FormState> {
  const listingId = int(form.get("listingId"));
  if (!listingId) return { message: "请求无效，请刷新后重试" };
  const user = await requireUser(`/listings/${listingId}/buy`);
  const values = formValues(form, ["message", "agentId"]);
  const message = text(form.get("message"), 200);
  // 从求购单的推荐进来时带上求购单 id；不是自己的或已失效就当没带
  const wantedId = int(form.get("wanted"));

  const rl = consume(`order:user:${user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return { message: `下单太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`, values };

  const [l] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!l || (l.status !== "on_sale" && l.status !== "in_trade")) return { message: "这个账号当前不能购买", values };
  if (l.sellerId === user.id) return { message: "不能购买自己的账号", values };
  if (user.noShowLockedUntil && user.noShowLockedUntil > new Date()) {
    return { message: `因多次爽约，${formatDateTime(user.noShowLockedUntil)} 之前不能下单`, values };
  }
  if (message) {
    const words = (await db.select({ word: bannedWords.word }).from(bannedWords)).map((r) => r.word);
    const bad = findBannedWord(message, words);
    if (bad) return { errors: { message: `留言包含违禁词「${bad}」` }, values };
  }
  const settings = await getSettings();
  const n = await countOpenOrders(user.id);
  if (n >= settings.max_open_orders) {
    return { message: `同时最多排队 ${settings.max_open_orders} 个账号，请先处理已有的意向单`, values };
  }
  if (await findOpenOrder(listingId, user.id)) return { message: "你已经在这个账号的队列里了", values };

  let agentId: number | null = null;
  let agentName = "";
  if (l.preferredAgentId) {
    const a = await validAgent(l.preferredAgentId, false);
    if (a && a.id !== user.id) {
      agentId = a.id;
      agentName = a.username;
    }
  } else {
    const chosen = int(form.get("agentId"));
    if (chosen) {
      const a = await validAgent(chosen, true);
      if (!a) return { errors: { agentId: "该中介暂不接单，请换一位或选平台分派" }, values };
      if (a.id === user.id || a.id === l.sellerId) return { errors: { agentId: "不能选自己或卖家作为中介" }, values };
      agentId = a.id;
      agentName = a.username;
    }
  }
  const status = agentId ? "pending_contact" : "pending_assign";

  let orderId: number;
  try {
    orderId = await db.transaction(async (tx) => {
      const live = await lockListing(tx, listingId);
      if (live.status !== "on_sale" && live.status !== "in_trade") throw new StateConflict("listing_unavailable");
      // 只认买家自己的、仍有效的求购单；该账号对它的待回应推荐标为已采纳
      const wanted = wantedId ? await attachWantedToOrder(tx, wantedId, listingId, user.id) : null;
      const [row] = await tx
        .insert(orders)
        .values({
          listingId,
          buyerId: user.id,
          sellerId: l.sellerId,
          agentId,
          status,
          buyerMessage: message || null,
          assignedAt: agentId ? new Date() : null,
          wantedRequestId: wanted ? wantedId : null,
        })
        .returning({ id: orders.id });
      if (wanted) {
        for (const uid of wanted.offererIds) {
          if (uid === user.id) continue;
          await notify(uid, { type: "wanted_offer_accepted", title: "买家采纳了你的推荐", body: `你为求购「${wanted.title}」推荐的账号「${l.title}」，买家已提交意向单，中介会跟进撮合。`, link: `/orders/${row.id}` }, tx);
        }
      }
      if (agentId) {
        await notify(agentId, { type: "order_new", title: "有新的意向单", body: `买家 ${user.username} 想购买「${l.title}」，请尽快通过 QQ 联系双方。`, link: `/orders/${row.id}` }, tx);
      } else {
        for (const id of await activeAdminIds()) {
          await notify(id, { type: "order_new", title: "意向单待分派", body: `「${l.title}」有新买家，请分派中介。`, link: "/admin/orders?unassigned=1" }, tx);
        }
      }
      await notify(
        l.sellerId,
        {
          type: "order_queued",
          title: "买家已排队",
          body: `「${l.title}」有买家下单${agentId ? `，中介 ${agentName} 会通过 QQ 联系你` : "，等待平台分派中介"}。`,
          link: `/orders/${row.id}`,
        },
        tx,
      );
      return row.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { message: "你已经在这个账号的队列里了", values };
    if (e instanceof StateConflict) return { message: "这个账号刚刚变为不能购买，请刷新后重试", values };
    throw e;
  }
  if (wantedId) revalidatePath(`/wanted/${wantedId}`);
  revalidateOrder(orderId, listingId);
  redirect(`/orders/${orderId}?created=1`);
}

/** 买家在待分派 / 待联系阶段撤回，不计爽约 */
export async function withdrawOrder(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireUser("/orders");
  let listingId = 0;
  try {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id, ["pending_assign", "pending_contact"]);
      if (o.buyerId !== user.id) throw new StateConflict("forbidden");
      listingId = o.listingId;
      const [l] = await tx.select({ title: listings.title }).from(listings).where(eq(listings.id, o.listingId));
      await tx
        .update(orders)
        .set({ status: "cancelled", cancelReason: "buyer_withdrawn", cancelNote: "买家自行撤回", cancelledBy: user.id, cancelledAt: new Date() })
        .where(eq(orders.id, id));
      if (o.agentId) {
        await notify(o.agentId, { type: "order_cancelled", title: "买家已撤回", body: `意向单 #${id} 已被买家撤回，无需再联系。`, link: `/orders/${id}` }, tx);
      }
      await notify(o.sellerId, { type: "order_cancelled", title: "买家已撤回", body: `「${l?.title ?? ""}」的一位买家撤回了意向单 #${id}。`, link: `/orders/${id}` }, tx);
    });
  } catch (e) {
    if (e instanceof StateConflict) redirect(`/orders/${id}?error=${e.code}`);
    throw e;
  }
  revalidateOrder(id, listingId);
}

export async function openAftersale(_prev: FormState, form: FormData): Promise<FormState> {
  const id = int(form.get("id"));
  if (!id) return { message: "请求无效，请刷新后重试" };
  const user = await requireUser(`/orders/${id}`);
  const description = text(form.get("description"), 500);
  const values = { description };
  if (description.length < 10) return { errors: { description: "请至少写 10 个字，说明出了什么问题" }, values };

  const o = await db.query.orders.findFirst({ where: eq(orders.id, id), with: { listing: { columns: { title: true } } } });
  if (!o || o.buyerId !== user.id) return { message: "意向单不存在", values };
  if (o.status !== "completed") return { message: "只有已完成的交易可以申请售后", values };
  if (!o.warrantyUntil || o.warrantyUntil < isoDate(new Date())) return { message: "已过质保期，不能申请售后", values };

  try {
    await db.transaction(async (tx) => {
      await lockOrder(tx, id, ["completed"]);
      const [open] = await tx.select({ id: aftersales.id }).from(aftersales).where(and(eq(aftersales.orderId, id), eq(aftersales.status, "open"))).limit(1);
      if (open) throw new StateConflict("aftersale_open");
      await tx.insert(aftersales).values({ orderId: id, openedBy: user.id, description });
      const targets = o.agentId ? [o.agentId] : await activeAdminIds();
      for (const t of targets) {
        await notify(t, { type: "aftersale_opened", title: "买家申请售后", body: `「${o.listing.title}」的买家申请售后：${description.slice(0, 60)}`, link: `/orders/${id}` }, tx);
      }
      await notify(o.sellerId, { type: "aftersale_opened", title: "买家申请售后", body: `「${o.listing.title}」的买家申请了售后，中介会通过 QQ 联系你核实。`, link: `/orders/${id}` }, tx);
    });
  } catch (e) {
    if (e instanceof StateConflict) return { message: e.code === "aftersale_open" ? "已有一条售后在处理中，请等待结果" : "意向单状态已变化，请刷新后重试", values };
    throw e;
  }
  revalidateOrder(id, o.listingId);
  redirect(`/orders/${id}?aftersale=1`);
}

// ---------- 中介 / 超管 ----------

export async function startOrder(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireRole(["agent", "admin"], "/agent");
  let listingId = 0;
  try {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id, ["pending_contact"]);
      if (!canAct(user, o)) throw new StateConflict("forbidden");
      listingId = o.listingId;
      const l = await lockListing(tx, o.listingId);
      if (l.status !== "on_sale" && l.status !== "in_trade") throw new StateConflict("listing_unavailable");
      const [buyer] = await tx.select({ status: users.status }).from(users).where(eq(users.id, o.buyerId));
      if (buyer?.status === "banned") throw new StateConflict("buyer_banned");

      await tx.update(orders).set({ status: "in_progress", startedAt: new Date() }).where(eq(orders.id, id));
      await tx.update(listings).set({ status: "in_trade" }).where(eq(listings.id, o.listingId));
      await audit(user.id, "start_order", "order", id, undefined, tx);
      await notify(o.buyerId, { type: "order_started", title: "交易已开始", body: `中介已开始处理「${l.title}」的交易，付款只在中介确认后进行。任何人索要你的账号密码或邮箱验证码，或让你付款到中介以外的账户，都是诈骗。`, link: `/orders/${id}` }, tx);
      await notify(o.sellerId, { type: "order_started", title: "交易已开始", body: `中介已开始处理你的账号「${l.title}」，请配合验号与换绑。`, link: `/orders/${id}` }, tx);
      const others = await tx
        .select({ id: orders.id, buyerId: orders.buyerId })
        .from(orders)
        .where(and(eq(orders.listingId, o.listingId), inArray(orders.status, ["pending_assign", "pending_contact"]), ne(orders.id, id)));
      for (const x of others) {
        await notify(x.buyerId, { type: "order_waiting", title: "账号交易中", body: `「${l.title}」正在与另一位买家交易，你的排队保留；若该交易取消，会按顺序通知你。`, link: `/orders/${x.id}` }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) redirect(`/orders/${id}?error=already_in_trade`);
    if (e instanceof StateConflict) redirect(`/orders/${id}?error=${e.code}`);
    throw e;
  }
  revalidateOrder(id, listingId);
}

export async function completeOrder(_prev: FormState, form: FormData): Promise<FormState> {
  const id = int(form.get("id"));
  if (!id) return { message: "请求无效，请刷新后重试" };
  const user = await requireRole(["agent", "admin"], "/agent");
  const values = formValues(form, ["finalPrice", "feeActual", "feeOverrideReason"]);

  const errors: Record<string, string> = {};
  const finalPrice = int(form.get("finalPrice"));
  if (finalPrice === null || finalPrice < 1 || finalPrice > 999_999) errors.finalPrice = "成交金额必须是 1～999999 的整数";
  const settings = await getSettings();
  const feeCalculated = finalPrice ? calcFee(finalPrice, settings.fee_tiers) : 0;
  const feeRaw = form.get("feeActual");
  const feeActual = typeof feeRaw === "string" && feeRaw.trim() !== "" ? int(feeRaw) : feeCalculated;
  if (feeActual === null || feeActual < 0 || feeActual > 999_999) errors.feeActual = "实收中介费必须是 0～999999 的整数";
  const feeOverrideReason = text(form.get("feeOverrideReason"), 200);
  if (feeActual !== null && feeActual !== feeCalculated && !feeOverrideReason) errors.feeOverrideReason = "实收中介费与系统计算不一致，请说明原因";
  if (Object.keys(errors).length) return { errors, values };

  const credit = creditForDeal(finalPrice!);
  const warranty = new Date();
  warranty.setDate(warranty.getDate() + settings.warranty_days);
  const warrantyUntil = isoDate(warranty);
  const now = new Date();
  let listingId = 0;
  let wantedRequestId: number | null = null;

  try {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id, ["in_progress"]);
      wantedRequestId = o.wantedRequestId;
      if (!canAct(user, o)) throw new StateConflict("forbidden");
      listingId = o.listingId;
      const l = await lockListing(tx, o.listingId);

      await tx
        .update(orders)
        .set({ status: "completed", finalPrice: finalPrice!, feeCalculated, feeActual: feeActual!, feeOverrideReason: feeOverrideReason || null, completedAt: now, warrantyUntil })
        .where(eq(orders.id, id));
      await tx.update(listings).set({ status: "sold", soldAt: now }).where(eq(listings.id, o.listingId));

      // 从求购单来的意向单：求购单随之完成，其余待回应的推荐关闭并通知推荐人
      if (o.wantedRequestId) {
        const w = await fulfillWantedByOrder(tx, o.wantedRequestId);
        if (w) {
          for (const uid of w.closedOfferers) {
            await notify(uid, { type: "wanted_fulfilled", title: "求购已完成", body: `求购「${w.title}」的买家已通过其他账号成交，你的推荐已关闭。`, link: `/wanted/${o.wantedRequestId}` }, tx);
          }
        }
      }

      for (const uid of [o.buyerId, o.sellerId]) {
        const [u] = await tx.select({ score: users.creditScore, deals: users.dealCount, status: users.status }).from(users).where(eq(users.id, uid)).for("update");
        const gain = u.status === "banned" ? 0 : credit;
        const after = u.score + gain;
        await tx.update(users).set({ creditScore: after, dealCount: u.deals + 1 }).where(eq(users.id, uid));
        if (gain > 0) {
          await tx.insert(creditLogs).values({
            userId: uid,
            delta: gain,
            balanceAfter: after,
            reasonType: "deal",
            reasonText: `成交「${l.title}」，成交金额 ${formatPrice(finalPrice!)}`,
            refType: "order",
            refId: id,
            operatorId: user.id,
          });
        }
      }

      const others = await tx
        .select({ id: orders.id, buyerId: orders.buyerId })
        .from(orders)
        .where(and(eq(orders.listingId, o.listingId), inArray(orders.status, OPEN), ne(orders.id, id)))
        .for("update");
      if (others.length) {
        await tx
          .update(orders)
          .set({ status: "cancelled", cancelReason: "sold_elsewhere", cancelNote: "账号已被其他买家购买", cancelledAt: now })
          .where(inArray(orders.id, others.map((x) => x.id)));
        for (const x of others) {
          await notify(x.buyerId, { type: "order_cancelled", title: "账号已售出", body: `「${l.title}」已被其他买家购买，你的意向单已关闭。`, link: "/" }, tx);
        }
      }

      // 防刷：同一对买卖双方短期内反复成交，标记并提醒超管核查
      const [{ n: pairDeals }] = await tx
        .select({ n: count() })
        .from(orders)
        .where(and(eq(orders.buyerId, o.buyerId), eq(orders.sellerId, o.sellerId), eq(orders.status, "completed"), gte(orders.completedAt, new Date(now.getTime() - REPEAT_DEAL_WINDOW_MS))));
      if (pairDeals >= REPEAT_DEAL_LIMIT) {
        await audit(user.id, "risk_flag", "order", id, { after: { kind: "repeat_pair", buyerId: o.buyerId, sellerId: o.sellerId, dealsIn30d: pairDeals } }, tx);
        for (const adminId of await activeAdminIds()) {
          await notify(
            adminId,
            {
              type: "risk_flag",
              title: "疑似刷信用分",
              body: `买家 #${o.buyerId} 与卖家 #${o.sellerId} 最近 30 天已成交 ${pairDeals} 次（本单 #${id}）。请核查是否在刷信用分。`,
              link: `/orders/${id}`,
            },
            tx,
          );
        }
      }

      await audit(user.id, "complete_order", "order", id, { after: { finalPrice, feeCalculated, feeActual, feeOverrideReason: feeOverrideReason || null, credit } }, tx);
      const tail = credit > 0 ? `双方信用分各 +${credit}。` : "";
      await notify(o.buyerId, { type: "order_completed", title: "交易完成", body: `「${l.title}」交易完成，成交金额 ${formatPrice(finalPrice!)}。${tail}质保至 ${warrantyUntil}，期内出问题可在意向单页申请售后。`, link: `/orders/${id}` }, tx);
      await notify(o.sellerId, { type: "order_completed", title: "交易完成", body: `你的账号「${l.title}」已成交，成交金额 ${formatPrice(finalPrice!)}。${tail}质保至 ${warrantyUntil}。`, link: `/orders/${id}` }, tx);
    });
  } catch (e) {
    if (e instanceof StateConflict) {
      return { message: e.code === "forbidden" ? "这张单不归你处理" : "意向单状态已变化，请刷新后确认", values };
    }
    throw e;
  }

  if (wantedRequestId) {
    revalidatePath(`/wanted/${wantedRequestId}`);
    revalidatePath("/wanted");
  }
  revalidateOrder(id, listingId);
  redirect(`/orders/${id}?done=1`);
}

export async function cancelOrder(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  const reason = form.get("reason");
  const note = text(form.get("note"), 300);
  if (!id) return;
  if (typeof reason !== "string" || !(AGENT_CANCEL_REASONS as readonly string[]).includes(reason)) return;
  const r = reason as (typeof AGENT_CANCEL_REASONS)[number];
  const user = await requireRole(["agent", "admin"], "/agent");
  const settings = await getSettings();
  const now = new Date();
  let listingId = 0;

  try {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id, OPEN);
      if (!canAct(user, o)) throw new StateConflict("forbidden");
      listingId = o.listingId;
      const l = await lockListing(tx, o.listingId);

      await tx
        .update(orders)
        .set({ status: "cancelled", cancelReason: r, cancelNote: note || null, cancelledBy: user.id, cancelledAt: now })
        .where(eq(orders.id, id));

      let restored = false;
      if (o.status === "in_progress" && l.status === "in_trade") {
        const [seller] = await tx.select({ status: users.status }).from(users).where(eq(users.id, o.sellerId));
        if (seller?.status === "banned") {
          await tx.update(listings).set({ status: "off_shelf", dirtySinceApproval: true }).where(eq(listings.id, o.listingId));
        } else {
          await tx.update(listings).set({ status: "on_sale" }).where(eq(listings.id, o.listingId));
          restored = true;
          const [next] = await tx
            .select({ id: orders.id, buyerId: orders.buyerId, agentId: orders.agentId })
            .from(orders)
            .where(and(eq(orders.listingId, o.listingId), inArray(orders.status, ["pending_assign", "pending_contact"])))
            .orderBy(asc(orders.createdAt))
            .limit(1);
          if (next) {
            await notify(next.buyerId, { type: "order_your_turn", title: "排队到你了", body: `「${l.title}」上一笔交易已取消，轮到你了。中介会通过 QQ 联系你。`, link: `/orders/${next.id}` }, tx);
            if (next.agentId) {
              await notify(next.agentId, { type: "order_new", title: "轮到下一位买家", body: `「${l.title}」上一笔交易已取消，意向单 #${next.id} 排到了，请联系双方。`, link: `/orders/${next.id}` }, tx);
            } else {
              for (const adminId of await activeAdminIds()) {
                await notify(adminId, { type: "order_new", title: "意向单待分派", body: `「${l.title}」上一笔交易已取消，排到的意向单 #${next.id} 还没有中介，请分派。`, link: "/admin/orders?unassigned=1" }, tx);
              }
            }
          }
        }
      }

      if (r === "buyer_quit") {
        const [b] = await tx.select({ noShow: users.noShowCount, score: users.creditScore }).from(users).where(eq(users.id, o.buyerId)).for("update");
        const noShow = b.noShow + 1;
        const penalty = Math.min(settings.credit_penalty_no_show, b.score);
        const locked = noShow >= settings.no_show_limit ? new Date(now.getTime() + settings.no_show_lock_days * 86400_000) : null;
        await tx
          .update(users)
          .set({ noShowCount: noShow, creditScore: b.score - penalty, ...(locked ? { noShowLockedUntil: locked } : {}) })
          .where(eq(users.id, o.buyerId));
        if (penalty > 0) {
          await tx.insert(creditLogs).values({ userId: o.buyerId, delta: -penalty, balanceAfter: b.score - penalty, reasonType: "no_show", reasonText: `爽约：意向单 #${id} 被中介取消`, refType: "order", refId: id, operatorId: user.id });
        }
        if (locked) {
          await notify(o.buyerId, { type: "no_show_locked", title: "已限制下单", body: `累计爽约 ${noShow} 次，${formatDateTime(locked)} 前不能再下单。`, link: "/orders" }, tx);
        }
      }

      await audit(user.id, "cancel_order", "order", id, { before: o.status, after: { reason: r, note } }, tx);
      const why = `${CANCEL_REASON_LABEL[r]}${note ? `：${note}` : ""}`;
      await notify(o.buyerId, { type: "order_cancelled", title: "意向单已取消", body: `「${l.title}」的意向单已取消。原因：${why}`, link: `/orders/${id}` }, tx);
      await notify(o.sellerId, { type: "order_cancelled", title: "意向单已取消", body: `「${l.title}」的一张意向单已取消。原因：${why}${restored ? " 账号已恢复在售。" : ""}`, link: `/orders/${id}` }, tx);
      if (user.role === "admin" && o.agentId && o.agentId !== user.id) {
        await notify(o.agentId, { type: "order_cancelled", title: "意向单已取消", body: `意向单 #${id} 已由超管取消。原因：${why}`, link: `/orders/${id}` }, tx);
      }
    });
  } catch (e) {
    if (e instanceof StateConflict) redirect(`/orders/${id}?error=${e.code}`);
    throw e;
  }
  revalidateOrder(id, listingId);
}

export async function saveAgentNote(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireRole(["agent", "admin"], "/agent");
  const [o] = await db.select({ agentId: orders.agentId, buyerId: orders.buyerId, sellerId: orders.sellerId }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!o || !canAct(user, o)) return;
  await db.update(orders).set({ agentNote: text(form.get("note"), 1000) || null }).where(eq(orders.id, id));
  revalidatePath(`/orders/${id}`);
}

export async function resolveAftersale(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  const result = form.get("result");
  const note = text(form.get("note"), 500);
  if (!id || (result !== "refund" && result !== "negotiated" && result !== "rejected")) return;
  // 驳回的售后不能同时判卖家责任
  const sellerAtFault = result !== "rejected" && form.get("sellerAtFault") === "on";
  const user = await requireRole(["agent", "admin"], "/agent");
  const settings = await getSettings();
  let orderId = 0;
  let listingId = 0;

  try {
    await db.transaction(async (tx) => {
      const [a] = await tx.select().from(aftersales).where(eq(aftersales.id, id)).for("update");
      if (!a || a.status !== "open") throw new StateConflict("aftersale_closed");
      const o = await lockOrder(tx, a.orderId, ["completed"]);
      if (!canAct(user, o)) throw new StateConflict("forbidden");
      orderId = o.id;
      listingId = o.listingId;
      const [l] = await tx.select({ title: listings.title }).from(listings).where(eq(listings.id, o.listingId));
      const title = l?.title ?? "";

      await tx
        .update(aftersales)
        .set({ status: result === "rejected" ? "rejected" : "resolved", result, resultNote: note || null, sellerAtFault, handledBy: user.id, closedAt: new Date() })
        .where(eq(aftersales.id, id));
      let penaltyNote = "";
      if (sellerAtFault && settings.credit_penalty_aftersale > 0) {
        const [s] = await tx.select({ score: users.creditScore }).from(users).where(eq(users.id, o.sellerId)).for("update");
        const penalty = Math.min(settings.credit_penalty_aftersale, s.score);
        if (penalty > 0) {
          await tx.update(users).set({ creditScore: s.score - penalty }).where(eq(users.id, o.sellerId));
          await tx.insert(creditLogs).values({ userId: o.sellerId, delta: -penalty, balanceAfter: s.score - penalty, reasonType: "aftersale", reasonText: `售后判定卖家责任：意向单 #${o.id}`, refType: "aftersale", refId: id, operatorId: user.id });
          penaltyNote = `信用分 -${penalty}。`;
        }
      }
      await audit(user.id, "aftersale_resolve", "order", o.id, { after: { aftersaleId: id, result, note, sellerAtFault } }, tx);
      const resultLabel = { refund: "退款", negotiated: "协商解决", rejected: "驳回" }[result];
      await notify(o.buyerId, { type: "aftersale_resolved", title: "售后已处理", body: `「${title}」的售后已处理：${resultLabel}${note ? `，${note}` : ""}。`, link: `/orders/${o.id}` }, tx);
      await notify(o.sellerId, { type: "aftersale_resolved", title: "售后已处理", body: `「${title}」的售后已处理：${resultLabel}${note ? `，${note}` : ""}。${sellerAtFault ? `判定卖家责任。${penaltyNote}` : ""}`, link: `/orders/${o.id}` }, tx);
    });
  } catch (e) {
    if (e instanceof StateConflict) {
      if (orderId) redirect(`/orders/${orderId}?error=${e.code}`);
      return;
    }
    throw e;
  }
  revalidateOrder(orderId, listingId);
}

// ---------- 超管分派 ----------

export async function assignOrder(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  const agentId = int(form.get("agentId"));
  if (!id || !agentId) return;
  const me = await requireRole(["admin"], "/admin/orders");
  const a = await validAgent(agentId, false);
  if (!a) return;
  let listingId = 0;

  try {
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id, OPEN);
      if (a.id === o.buyerId || a.id === o.sellerId || a.id === o.agentId) throw new StateConflict("bad_agent");
      listingId = o.listingId;
      const [l] = await tx.select({ title: listings.title }).from(listings).where(eq(listings.id, o.listingId));
      const title = l?.title ?? "";
      await tx
        .update(orders)
        .set({ agentId: a.id, assignedAt: new Date(), ...(o.status === "pending_assign" ? { status: "pending_contact" as const } : {}) })
        .where(eq(orders.id, id));
      await audit(me.id, "assign_order", "order", id, { before: o.agentId, after: a.id }, tx);
      await notify(a.id, { type: "order_new", title: "意向单已分派给你", body: `「${title}」的意向单 #${id} 已分派给你，请尽快联系双方。`, link: `/orders/${id}` }, tx);
      await notify(o.buyerId, { type: "order_assigned", title: "已安排中介", body: `中介 ${a.username} 负责「${title}」的交易，会通过 QQ 联系你，请留意好友申请。`, link: `/orders/${id}` }, tx);
      if (o.agentId) {
        await notify(o.agentId, { type: "order_cancelled", title: "意向单已改派", body: `意向单 #${id} 已改派给 ${a.username}。`, link: `/orders/${id}` }, tx);
      }
    });
  } catch (e) {
    if (e instanceof StateConflict) return;
    throw e;
  }
  revalidateOrder(id, listingId);
}
