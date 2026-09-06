"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema, type Tx } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole, requireUser, type SafeUser } from "@/lib/auth";
import { findBannedWord } from "@/lib/banned-words";
import { findContactLeak } from "@/lib/contact-leak";
import { MC_CAPES, MC_RANKS } from "@/lib/games/mc";
import { formatPrice } from "@/lib/labels";
import { getMcGame } from "@/lib/listings";
import { notify } from "@/lib/notify";
import { consume, retryText } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { wantedSchema, zodErrors } from "@/lib/validation";
import { wantedBlock } from "@/lib/wanted";
import { WANTED_MESSAGE_MAX, isWantedActive, renderWantedTitle } from "@/lib/wanted-shared";
import { formValues, type FormState } from "./types";

const { wantedRequests, wantedOffers, listings, users, bannedWords } = schema;
const VALUE_KEYS = ["minLevel", "budgetMin", "budgetMax", "requirements", "preferredAgentId", "days"];

function int(v: FormDataEntryValue | null, max = 2_147_483_647): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}
function text(v: FormDataEntryValue | null, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function revalidateWanted(id?: number) {
  revalidatePath("/wanted");
  if (id) revalidatePath(`/wanted/${id}`);
  revalidatePath("/me");
  revalidatePath("/agent");
  revalidatePath("/admin/wanted");
}

async function bannedWordList() {
  return (await db.select({ word: bannedWords.word }).from(bannedWords)).map((r) => r.word);
}

/** 公开文本的两道闸：违禁词与联系方式。返回错误文案，null 表示通过 */
async function publicTextProblem(s: string, what: string): Promise<string | null> {
  if (!s) return null;
  const bad = findBannedWord(s, await bannedWordList());
  if (bad) return `${what}包含违禁词「${bad}」，请修改后再提交`;
  const leak = findContactLeak(s);
  if (leak) return `${what}里不能留${leak}，平台会通过中介联系双方`;
  return null;
}

type ParsedWanted =
  | { ok: false; state: FormState }
  | {
      ok: true;
      values: Record<string, string>;
      data: Awaited<ReturnType<typeof wantedSchema.parseAsync>>;
      ranks: string[];
      capes: string[];
      title: string;
    };

/** 发布与编辑共用的表单解析：数值校验、多选合法性、公开文本两道闸、指定中介校验 */
async function parseWantedForm(form: FormData, buyerId: number): Promise<ParsedWanted> {
  const ranks = [...new Set(form.getAll("ranks").map(String))];
  const capes = [...new Set(form.getAll("capes").map(String))];
  const values = { ...formValues(form, VALUE_KEYS), ranks: ranks.join(","), capes: capes.join(",") };
  const errors: Record<string, string> = {};

  if (ranks.some((r) => !(MC_RANKS as readonly string[]).includes(r))) errors.ranks = "会员类型的选项无效，请刷新后重选";
  if (capes.some((c) => !(MC_CAPES as readonly string[]).includes(c))) errors.capes = "披风的选项无效，请刷新后重选";

  const parsed = wantedSchema.safeParse({
    minLevel: form.get("minLevel") ?? "",
    budgetMin: form.get("budgetMin") ?? "",
    budgetMax: form.get("budgetMax") ?? "",
    requirements: form.get("requirements") ?? "",
    preferredAgentId: form.get("preferredAgentId") ?? "",
    days: form.get("days") ?? "",
  });
  if (!parsed.success) Object.assign(errors, zodErrors(parsed.error));
  if (Object.keys(errors).length) return { ok: false, state: { errors, values } };
  const d = parsed.data!;

  const problem = await publicTextProblem(d.requirements, "其他要求");
  if (problem) return { ok: false, state: { errors: { requirements: problem }, values } };

  if (d.preferredAgentId !== null) {
    if (d.preferredAgentId === buyerId) return { ok: false, state: { errors: { preferredAgentId: "不能指定自己为中介" }, values } };
    const [agent] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, d.preferredAgentId), inArray(users.role, ["agent", "admin"]), eq(users.status, "active"), eq(users.agentAccepting, true)))
      .limit(1);
    if (!agent) return { ok: false, state: { errors: { preferredAgentId: "指定的中介不存在或已停止接单" }, values } };
  }

  const title = renderWantedTitle({ ranks, minLevel: d.minLevel, capes, budgetMin: d.budgetMin, budgetMax: d.budgetMax });
  return { ok: true, values, data: d, ranks, capes, title };
}

// ---------- 买家 ----------

export async function createWanted(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/wanted/new");
  const settings = await getSettings();
  const blocked = await wantedBlock(user, settings);
  if (blocked) return { message: blocked };

  const rl = consume(`wanted:create:${user.id}`, 5, 60 * 60_000);
  if (!rl.ok) return { message: `发布太频繁，请 ${retryText(rl.retryAfterMs)} 后再试` };

  const parsed = await parseWantedForm(form, user.id);
  if (!parsed.ok) return parsed.state;
  const { values, data, ranks, capes, title } = parsed;
  if (data.days === null) return { errors: { days: "请选择有效期" }, values };
  const game = await getMcGame();
  const expiresAt = new Date(Date.now() + data.days * 86400_000);

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(wantedRequests)
      .values({
        buyerId: user.id,
        gameId: game.id,
        title,
        ranks,
        minLevel: data.minLevel,
        capes,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        requirements: data.requirements || null,
        preferredAgentId: data.preferredAgentId,
        status: "open",
        expiresAt,
      })
      .returning({ id: wantedRequests.id });
    if (data.preferredAgentId) {
      await notify(
        data.preferredAgentId,
        {
          type: "wanted_new",
          title: "有买家指定你跟进求购",
          body: `买家 ${user.username} 发布了求购「${title}」并指定你跟进。有合适的账号可以推荐给对方。`,
          link: `/wanted/${row.id}`,
        },
        tx,
      );
    }
    return row.id;
  });

  revalidateWanted(id);
  redirect(`/wanted/${id}?created=1`);
}

export async function updateWanted(_prev: FormState, form: FormData): Promise<FormState> {
  const id = int(form.get("id"));
  if (!id) return { message: "请求无效，请刷新后重试" };
  const user = await requireUser(`/wanted/${id}/edit`);
  const [r] = await db.select().from(wantedRequests).where(eq(wantedRequests.id, id)).limit(1);
  if (!r || r.buyerId !== user.id) return { message: "求购单不存在" };
  if (r.status !== "open") return { message: "已关闭或已完成的求购不能再编辑" };

  const parsed = await parseWantedForm(form, user.id);
  if (!parsed.ok) return parsed.state;
  const { values, data, ranks, capes, title } = parsed;

  const [row] = await db
    .update(wantedRequests)
    .set({
      title,
      ranks,
      minLevel: data.minLevel,
      capes,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
      requirements: data.requirements || null,
      preferredAgentId: data.preferredAgentId,
    })
    .where(and(eq(wantedRequests.id, id), eq(wantedRequests.status, "open")))
    .returning({ id: wantedRequests.id });
  if (!row) return { message: "求购单状态刚刚发生变化，请刷新后重试", values };

  revalidateWanted(id);
  redirect(`/wanted/${id}?updated=1`);
}

/** 买家关闭求购：求购中（含已到期）→ 已关闭，待回应的推荐一并关闭并通知推荐人 */
export async function closeWanted(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireUser("/me");
  await db.transaction(async (tx) => {
    const [r] = await tx
      .update(wantedRequests)
      .set({ status: "closed", closedAt: new Date() })
      .where(and(eq(wantedRequests.id, id), eq(wantedRequests.buyerId, user.id), eq(wantedRequests.status, "open")))
      .returning({ title: wantedRequests.title });
    if (!r) return;
    await closePendingOffers(tx, id, { type: "wanted_closed", title: "求购已关闭", body: `求购「${r.title}」的买家已关闭求购，你的推荐随之关闭。` });
  });
  revalidateWanted(id);
}

/** 买家续期：从现在起再挂默认天数。到期或未到期都可以，关闭的不行 */
export async function renewWanted(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireUser("/me");
  const rl = consume(`wanted:renew:${user.id}`, 6, 60 * 60_000);
  if (!rl.ok) redirect(`/me?error=${encodeURIComponent(`续期太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`)}`);
  const settings = await getSettings();
  await db
    .update(wantedRequests)
    .set({ expiresAt: new Date(Date.now() + settings.wanted_default_days * 86400_000) })
    .where(and(eq(wantedRequests.id, id), eq(wantedRequests.buyerId, user.id), eq(wantedRequests.status, "open")));
  revalidateWanted(id);
}

/** 关闭一张求购单下所有待回应的推荐并通知推荐人。事务内调用 */
async function closePendingOffers(tx: Tx, requestId: number, n: { type: "wanted_closed" | "wanted_removed"; title: string; body: string }) {
  const closed = await tx
    .update(wantedOffers)
    .set({ status: "closed", respondedAt: new Date() })
    .where(and(eq(wantedOffers.requestId, requestId), eq(wantedOffers.status, "pending")))
    .returning({ offeredBy: wantedOffers.offeredBy });
  for (const uid of new Set(closed.map((c) => c.offeredBy))) {
    await notify(uid, { ...n, link: `/wanted/${requestId}` }, tx);
  }
}

// ---------- 推荐账号 ----------

/** 卖家或中介 / 超管把一个在售账号推荐给求购单 */
export async function offerListing(_prev: FormState, form: FormData): Promise<FormState> {
  const requestId = int(form.get("requestId"));
  const listingId = int(form.get("listingId"));
  if (!requestId) return { message: "请求无效，请刷新后重试" };
  const user = await requireUser(`/wanted/${requestId}`);
  const values = formValues(form, ["listingId", "message"]);
  if (!listingId) return { errors: { listingId: "请选择要推荐的账号" }, values };
  const message = text(form.get("message"), WANTED_MESSAGE_MAX);

  const rl = consume(`wanted:offer:${user.id}`, 20, 60 * 60_000);
  if (!rl.ok) return { message: `推荐太频繁，请 ${retryText(rl.retryAfterMs)} 后再试`, values };

  const [r] = await db.select().from(wantedRequests).where(eq(wantedRequests.id, requestId)).limit(1);
  if (!r || !isWantedActive(r)) return { message: "这张求购单已关闭或已到期", values };
  if (r.buyerId === user.id) return { message: "不能给自己的求购推荐账号", values };

  const [l] = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!l || (l.status !== "on_sale" && l.status !== "in_trade")) return { errors: { listingId: "这个账号当前不在售" }, values };
  if (l.sellerId === r.buyerId) return { errors: { listingId: "这是买家自己的账号" }, values };
  const isStaff = user.role === "agent" || user.role === "admin";
  if (l.sellerId !== user.id && !isStaff) return { message: "只能推荐自己的账号", values };

  const problem = await publicTextProblem(message, "留言");
  if (problem) return { errors: { message: problem }, values };

  const who = l.sellerId === user.id ? "卖家" : `中介 ${user.username}`;
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: wantedOffers.id, status: wantedOffers.status })
        .from(wantedOffers)
        .where(and(eq(wantedOffers.requestId, requestId), eq(wantedOffers.listingId, listingId)))
        .for("update");
      if (existing?.status === "declined") throw new OfferConflict("买家已经谢绝过这个账号");
      if (existing && existing.status !== "withdrawn") throw new OfferConflict("这个账号已经推荐给这位买家了");
      if (existing) {
        await tx
          .update(wantedOffers)
          .set({ status: "pending", message: message || null, offeredBy: user.id, sellerId: l.sellerId, respondedAt: null })
          .where(eq(wantedOffers.id, existing.id));
      } else {
        await tx.insert(wantedOffers).values({ requestId, listingId, sellerId: l.sellerId, offeredBy: user.id, message: message || null, status: "pending" });
      }
      await notify(
        r.buyerId,
        {
          type: "wanted_offer",
          title: "求购收到推荐",
          body: `${who}给你的求购「${r.title}」推荐了账号「${l.title}」（${formatPrice(l.price)}）。合适的话可以直接下单。`,
          link: `/wanted/${requestId}`,
        },
        tx,
      );
      if (l.sellerId !== user.id) {
        await notify(
          l.sellerId,
          {
            type: "wanted_offer",
            title: "中介推荐了你的账号",
            body: `中介 ${user.username} 把你的账号「${l.title}」推荐给了求购「${r.title}」的买家。买家下单后你会收到意向单通知。`,
            link: `/wanted/${requestId}`,
          },
          tx,
        );
      }
    });
  } catch (e) {
    if (e instanceof OfferConflict) return { message: e.message, values };
    if (isUniqueViolation(e)) return { message: "这个账号已经推荐给这位买家了", values };
    throw e;
  }
  revalidateWanted(requestId);
  return { ok: true, message: "已推荐给买家，对方会收到通知" };
}

class OfferConflict extends Error {}

/** 推荐人或账号卖家撤回一条待回应的推荐 */
export async function withdrawOffer(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireUser("/wanted");
  const [o] = await db.select().from(wantedOffers).where(eq(wantedOffers.id, id)).limit(1);
  if (!o || (o.offeredBy !== user.id && o.sellerId !== user.id) || o.status !== "pending") return;
  await db
    .update(wantedOffers)
    .set({ status: "withdrawn", respondedAt: new Date() })
    .where(and(eq(wantedOffers.id, id), eq(wantedOffers.status, "pending")));
  revalidateWanted(o.requestId);
}

/** 买家谢绝一条推荐并通知推荐人 */
export async function declineOffer(form: FormData): Promise<void> {
  const id = int(form.get("id"));
  if (!id) return;
  const user = await requireUser("/wanted");
  await db.transaction(async (tx) => {
    const [o] = await tx
      .select({ id: wantedOffers.id, status: wantedOffers.status, requestId: wantedOffers.requestId, offeredBy: wantedOffers.offeredBy, listingId: wantedOffers.listingId, buyerId: wantedRequests.buyerId, requestTitle: wantedRequests.title, listingTitle: listings.title })
      .from(wantedOffers)
      .innerJoin(wantedRequests, eq(wantedOffers.requestId, wantedRequests.id))
      .innerJoin(listings, eq(wantedOffers.listingId, listings.id))
      .where(eq(wantedOffers.id, id))
      .for("update", { of: wantedOffers });
    if (!o || o.buyerId !== user.id || o.status !== "pending") return;
    await tx.update(wantedOffers).set({ status: "declined", respondedAt: new Date() }).where(eq(wantedOffers.id, id));
    await notify(o.offeredBy, { type: "wanted_offer_declined", title: "买家谢绝了你的推荐", body: `求购「${o.requestTitle}」的买家谢绝了账号「${o.listingTitle}」。`, link: `/wanted/${o.requestId}` }, tx);
  });
  const [o] = await db.select({ requestId: wantedOffers.requestId }).from(wantedOffers).where(eq(wantedOffers.id, id)).limit(1);
  revalidateWanted(o?.requestId);
}

// ---------- 超管 ----------

async function admin(): Promise<SafeUser> {
  return requireRole(["admin"], "/admin/wanted");
}

/** 超管下架求购单：求购中 → 已下架，待回应的推荐关闭，通知买家 */
export async function removeWanted(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  const note = text(form.get("note"), 200);
  await db.transaction(async (tx) => {
    const [r] = await tx
      .update(wantedRequests)
      .set({ status: "removed", adminNote: note || null, removedBy: me.id, closedAt: new Date() })
      .where(and(eq(wantedRequests.id, id), eq(wantedRequests.status, "open")))
      .returning({ title: wantedRequests.title, buyerId: wantedRequests.buyerId });
    if (!r) return;
    await closePendingOffers(tx, id, { type: "wanted_removed", title: "求购已下架", body: `求购「${r.title}」已被平台下架，你的推荐随之关闭。` });
    await notify(r.buyerId, { type: "wanted_removed", title: "求购已被平台下架", body: `求购「${r.title}」已被平台下架${note ? `：${note}` : ""}。修改后可以重新发布。`, link: `/wanted/${id}` }, tx);
    await audit(me.id, "wanted_remove", "wanted", id, { before: "open", after: { status: "removed", note: note || null } }, tx);
  });
  revalidateWanted(id);
}

/** 超管恢复：已下架 → 求购中。到期的恢复后仍显示已过期，买家可自行续期 */
export async function restoreWanted(form: FormData): Promise<void> {
  const me = await admin();
  const id = int(form.get("id"));
  if (!id) return;
  await db.transaction(async (tx) => {
    const [r] = await tx
      .update(wantedRequests)
      .set({ status: "open", adminNote: null, removedBy: null, closedAt: null })
      .where(and(eq(wantedRequests.id, id), eq(wantedRequests.status, "removed")))
      .returning({ id: wantedRequests.id });
    if (!r) return;
    await audit(me.id, "wanted_restore", "wanted", id, { before: "removed", after: "open" }, tx);
  });
  revalidateWanted(id);
}
