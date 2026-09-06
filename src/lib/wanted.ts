import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema, type Tx } from "@/db";
import type { SafeUser } from "./auth";
import { parseIntParam, parsePage } from "./ids";
import type { Settings } from "./settings-shared";
import { OPEN_ORDER_STATUSES } from "./orders";

const { wantedRequests, wantedOffers, listings, users, orders } = schema;

export const WANTED_PAGE_SIZE = 24;
/** 仍算「有效推荐」的状态：买家还没处理，或已经据此下单 */
export const LIVE_OFFER_STATUSES = ["pending", "accepted"] as const;

export interface WantedFilters {
  rank?: string;
  /** 卖家视角：我的账号卖 X 元，看预算上限 ≥ X 的求购 */
  minBudget?: number;
  maxBudget?: number;
  page?: number;
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 32) : undefined;
}

export function parseWantedFilters(sp: Record<string, string | string[] | undefined>): WantedFilters {
  return {
    rank: str(sp.rank),
    minBudget: parseIntParam(sp.minBudget, 999_999),
    maxBudget: parseIntParam(sp.maxBudget, 999_999),
    page: parsePage(sp.page),
  };
}

// 子查询里要写 ${wantedRequests}.id 而不是 ${wantedRequests.id}，原因见 listings.ts 的 coverSql
const offerCountSql = sql<number>`(select count(*)::int from wanted_offers wo where wo.request_id = ${wantedRequests}.id and wo.status in ('pending', 'accepted'))`;
const coverSql = sql<string | null>`(select li.path from listing_images li where li.listing_id = ${listings}.id order by li.sort_order asc limit 1)`;

/** 公开展示的条件：求购中且未到期。到期不需要定时任务，查询时自然消失 */
const activeConds = () => [eq(wantedRequests.status, "open"), gt(wantedRequests.expiresAt, sql`now()`)];

const publicColumns = {
  id: wantedRequests.id,
  title: wantedRequests.title,
  ranks: wantedRequests.ranks,
  minLevel: wantedRequests.minLevel,
  capes: wantedRequests.capes,
  budgetMin: wantedRequests.budgetMin,
  budgetMax: wantedRequests.budgetMax,
  requirements: wantedRequests.requirements,
  preferredAgentId: wantedRequests.preferredAgentId,
  expiresAt: wantedRequests.expiresAt,
  createdAt: wantedRequests.createdAt,
  buyerId: wantedRequests.buyerId,
  buyerName: users.username,
  buyerCredit: users.creditScore,
  buyerDeals: users.dealCount,
  offerCount: offerCountSql,
};

/** 求购大厅：求购中且未到期，最新的在前 */
export async function listPublicWanted(f: WantedFilters) {
  const conds = activeConds();
  if (f.rank) conds.push(or(sql`jsonb_array_length(${wantedRequests.ranks}) = 0`, sql`${wantedRequests.ranks} @> ${JSON.stringify([f.rank])}::jsonb`)!);
  if (f.minBudget !== undefined) conds.push(gte(wantedRequests.budgetMax, f.minBudget));
  if (f.maxBudget !== undefined) conds.push(lte(wantedRequests.budgetMax, f.maxBudget));
  const where = and(...conds);
  const page = f.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(publicColumns)
      .from(wantedRequests)
      .innerJoin(users, eq(wantedRequests.buyerId, users.id))
      .where(where)
      .orderBy(desc(wantedRequests.createdAt))
      .limit(WANTED_PAGE_SIZE)
      .offset((page - 1) * WANTED_PAGE_SIZE),
    db.select({ total: count() }).from(wantedRequests).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / WANTED_PAGE_SIZE)) };
}

export type PublicWantedRow = Awaited<ReturnType<typeof listPublicWanted>>["rows"][number];

/** 首页 / 状态面板用：求购中的数量 */
export async function countActiveWantedAll(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(wantedRequests).where(and(...activeConds()));
  return n;
}

/** 详情页数据。generateMetadata 与页面各调一次，用 cache 合并 */
export const getWantedDetail = cache(async (id: number) => {
  const row = await db.query.wantedRequests.findFirst({
    where: eq(wantedRequests.id, id),
    with: {
      buyer: { columns: { id: true, username: true, creditScore: true, dealCount: true } },
      preferredAgent: { columns: { id: true, username: true } },
    },
  });
  if (!row) return null;
  const [[{ offerCount }], [order]] = await Promise.all([
    db
      .select({ offerCount: count() })
      .from(wantedOffers)
      .where(and(eq(wantedOffers.requestId, id), inArray(wantedOffers.status, [...LIVE_OFFER_STATUSES]))),
    // 据此求购单下的、仍在进行或已完成的意向单（买家自己看得到；成交后详情页要指向它）
    db
      .select({ id: orders.id, status: orders.status, listingId: orders.listingId })
      .from(orders)
      .where(and(eq(orders.wantedRequestId, id), inArray(orders.status, [...OPEN_ORDER_STATUSES, "completed"])))
      .orderBy(desc(orders.createdAt))
      .limit(1),
  ]);
  return { ...row, offerCount, linkedOrder: order ?? null };
});

export type WantedDetail = NonNullable<Awaited<ReturnType<typeof getWantedDetail>>>;

/** 求购单收到的推荐，带账号与卖家信息。账号是否还能买由前端按 listingStatus 判断，不额外落库 */
export async function listOffersForRequest(requestId: number) {
  const seller = alias(users, "seller");
  const offerer = alias(users, "offerer");
  return db
    .select({
      id: wantedOffers.id,
      listingId: wantedOffers.listingId,
      sellerId: wantedOffers.sellerId,
      offeredBy: wantedOffers.offeredBy,
      message: wantedOffers.message,
      status: wantedOffers.status,
      createdAt: wantedOffers.createdAt,
      respondedAt: wantedOffers.respondedAt,
      listingTitle: listings.title,
      listingPrice: listings.price,
      listingFeeMode: listings.feeMode,
      listingStatus: listings.status,
      listingAttrs: listings.attrs,
      listingMcUuid: listings.mcUuid,
      listingCover: coverSql,
      sellerName: seller.username,
      sellerCredit: seller.creditScore,
      offererName: offerer.username,
      offererRole: offerer.role,
    })
    .from(wantedOffers)
    .innerJoin(listings, eq(wantedOffers.listingId, listings.id))
    .innerJoin(seller, eq(wantedOffers.sellerId, seller.id))
    .innerJoin(offerer, eq(wantedOffers.offeredBy, offerer.id))
    .where(eq(wantedOffers.requestId, requestId))
    .orderBy(asc(wantedOffers.createdAt));
}

export type WantedOfferRow = Awaited<ReturnType<typeof listOffersForRequest>>[number];

/**
 * 我能推荐给这张求购单的账号。
 * 普通用户 = 自己在售 / 交易中的账号；中介与超管 = 市场上全部在售账号。
 * 排除买家自己的账号，以及已推荐过（待回应 / 已采纳 / 已谢绝）的；撤回过的可以再推。
 */
export async function listOfferableListings(user: SafeUser, requestId: number, buyerId: number) {
  const offered = db
    .select({ listingId: wantedOffers.listingId })
    .from(wantedOffers)
    .where(and(eq(wantedOffers.requestId, requestId), inArray(wantedOffers.status, ["pending", "accepted", "declined"])));
  const conds = [inArray(listings.status, ["on_sale", "in_trade"]), notInArray(listings.id, offered), ne(listings.sellerId, buyerId)];
  if (user.role === "user") conds.push(eq(listings.sellerId, user.id));
  return db
    .select({ id: listings.id, title: listings.title, price: listings.price, sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(and(...conds))
    .orderBy(desc(listings.approvedAt))
    .limit(200);
}

/** 我发布的求购单 */
export async function listMyWanted(buyerId: number) {
  return db
    .select({
      id: wantedRequests.id,
      title: wantedRequests.title,
      budgetMin: wantedRequests.budgetMin,
      budgetMax: wantedRequests.budgetMax,
      status: wantedRequests.status,
      expiresAt: wantedRequests.expiresAt,
      createdAt: wantedRequests.createdAt,
      adminNote: wantedRequests.adminNote,
      offerCount: offerCountSql,
    })
    .from(wantedRequests)
    .where(eq(wantedRequests.buyerId, buyerId))
    .orderBy(desc(wantedRequests.createdAt));
}

export type MyWantedRow = Awaited<ReturnType<typeof listMyWanted>>[number];

/** 我推荐过的账号（作为推荐人或卖家），我的页与中介台用 */
export async function listMyOffers(userId: number) {
  return db
    .select({
      id: wantedOffers.id,
      requestId: wantedOffers.requestId,
      requestTitle: wantedRequests.title,
      requestStatus: wantedRequests.status,
      requestExpiresAt: wantedRequests.expiresAt,
      listingId: wantedOffers.listingId,
      listingTitle: listings.title,
      listingStatus: listings.status,
      status: wantedOffers.status,
      createdAt: wantedOffers.createdAt,
    })
    .from(wantedOffers)
    .innerJoin(wantedRequests, eq(wantedOffers.requestId, wantedRequests.id))
    .innerJoin(listings, eq(wantedOffers.listingId, listings.id))
    .where(or(eq(wantedOffers.offeredBy, userId), eq(wantedOffers.sellerId, userId)))
    .orderBy(desc(wantedOffers.createdAt))
    .limit(100);
}

export type MyOfferRow = Awaited<ReturnType<typeof listMyOffers>>[number];

export async function countActiveWanted(buyerId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(wantedRequests)
    .where(and(eq(wantedRequests.buyerId, buyerId), ...activeConds()));
  return n;
}

/** 买家能否再发一张求购单。返回拦截原因，null 表示可以 */
export async function wantedBlock(user: { id: number }, settings: Settings): Promise<string | null> {
  const n = await countActiveWanted(user.id);
  if (n >= settings.wanted_max_active) return `最多同时挂 ${settings.wanted_max_active} 张求购单，请先关闭已有的`;
  return null;
}

/** 中介台：求购中的单子，指定了我的排在前面 */
export async function listOpenWantedForAgent(agentId: number) {
  return db
    .select(publicColumns)
    .from(wantedRequests)
    .innerJoin(users, eq(wantedRequests.buyerId, users.id))
    .where(and(...activeConds()))
    .orderBy(sql`case when ${wantedRequests.preferredAgentId} = ${agentId} then 0 else 1 end`, desc(wantedRequests.createdAt))
    .limit(100);
}

/** 后台：全部求购单。status 可传展示状态 expired（求购中但已到期） */
export async function listAllWanted(f: { status?: string; q?: string; page: number }, pageSize = 30) {
  const conds = [];
  if (f.status === "expired") conds.push(eq(wantedRequests.status, "open"), lte(wantedRequests.expiresAt, sql`now()`));
  else if (f.status === "open") conds.push(...activeConds());
  else if (f.status === "fulfilled" || f.status === "closed" || f.status === "removed") conds.push(eq(wantedRequests.status, f.status));
  if (f.q) {
    const q = f.q.slice(0, 50);
    conds.push(/^\d{1,15}$/.test(q) ? eq(wantedRequests.id, Number(q)) : or(ilike(wantedRequests.title, `%${q}%`), ilike(users.username, `%${q}%`))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: wantedRequests.id,
        title: wantedRequests.title,
        budgetMin: wantedRequests.budgetMin,
        budgetMax: wantedRequests.budgetMax,
        status: wantedRequests.status,
        expiresAt: wantedRequests.expiresAt,
        createdAt: wantedRequests.createdAt,
        adminNote: wantedRequests.adminNote,
        buyerId: wantedRequests.buyerId,
        buyerName: users.username,
        offerCount: offerCountSql,
      })
      .from(wantedRequests)
      .innerJoin(users, eq(wantedRequests.buyerId, users.id))
      .where(where)
      .orderBy(desc(wantedRequests.createdAt))
      .limit(pageSize)
      .offset((f.page - 1) * pageSize),
    db.select({ total: count() }).from(wantedRequests).innerJoin(users, eq(wantedRequests.buyerId, users.id)).where(where),
  ]);
  return { rows, total, page: f.page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * 下单时把求购单挂到意向单上（createOrder 事务内调用）。
 * 只认买家自己的、仍有效的求购单；该账号对这张求购单的待回应推荐一并标为「已采纳」。
 * 返回 null 表示求购单无效，意向单照常创建、只是不挂。
 */
export async function attachWantedToOrder(tx: Tx, requestId: number, listingId: number, buyerId: number) {
  const [r] = await tx
    .select({ id: wantedRequests.id, title: wantedRequests.title })
    .from(wantedRequests)
    .where(and(eq(wantedRequests.id, requestId), eq(wantedRequests.buyerId, buyerId), ...activeConds()))
    .for("update");
  if (!r) return null;
  const accepted = await tx
    .update(wantedOffers)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(and(eq(wantedOffers.requestId, requestId), eq(wantedOffers.listingId, listingId), eq(wantedOffers.status, "pending")))
    .returning({ offeredBy: wantedOffers.offeredBy, sellerId: wantedOffers.sellerId });
  return { title: r.title, offererIds: [...new Set(accepted.map((a) => a.offeredBy))] };
}

/**
 * 意向单完成时求购单随之完成（completeOrder 事务内调用），其余待回应的推荐关闭。
 * 返回被关闭推荐的推荐人 id，调用方负责通知。
 */
export async function fulfillWantedByOrder(tx: Tx, requestId: number) {
  const now = new Date();
  const [r] = await tx
    .update(wantedRequests)
    .set({ status: "fulfilled", closedAt: now })
    .where(and(eq(wantedRequests.id, requestId), eq(wantedRequests.status, "open")))
    .returning({ title: wantedRequests.title });
  if (!r) return null;
  const closed = await tx
    .update(wantedOffers)
    .set({ status: "closed", respondedAt: now })
    .where(and(eq(wantedOffers.requestId, requestId), eq(wantedOffers.status, "pending")))
    .returning({ offeredBy: wantedOffers.offeredBy });
  return { title: r.title, closedOfferers: [...new Set(closed.map((c) => c.offeredBy))] };
}
