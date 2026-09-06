import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { SafeUser } from "./auth";

const { orders, listings, users } = schema;

export const OPEN_ORDER_STATUSES = ["pending_assign", "pending_contact", "in_progress"] as const;
export type OrderStatus = (typeof orders.$inferSelect)["status"];

const listingCover = sql<string | null>`(select li.path from listing_images li where li.listing_id = ${listings}.id order by li.sort_order asc limit 1)`;

const SITE_TZ = process.env.SITE_TZ || "Asia/Shanghai";
const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** 站点时区下的 YYYY-MM-DD，质保日期与「今天」的比较都用它，不受服务器 TZ 影响 */
export function isoDate(d: Date) {
  return isoFmt.format(d);
}

/** 买家在某商品上是否已有未关闭意向单 */
export async function findOpenOrder(listingId: number, buyerId: number) {
  const [row] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.listingId, listingId), eq(orders.buyerId, buyerId), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
    .limit(1);
  return row ?? null;
}

export async function countOpenOrders(buyerId: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.buyerId, buyerId), inArray(orders.status, [...OPEN_ORDER_STATUSES])));
  return n;
}

export async function getOrder(id: number) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      listing: { with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)], limit: 1 } } },
      buyer: { columns: { id: true, username: true, qq: true, creditScore: true, dealCount: true, noShowCount: true } },
      seller: { columns: { id: true, username: true, qq: true, creditScore: true, dealCount: true } },
      agent: { columns: { id: true, username: true, agentIntro: true } },
      aftersales: { orderBy: (a, { desc }) => [desc(a.createdAt)] },
    },
  });
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

export interface OrderPerms {
  isBuyer: boolean;
  isSeller: boolean;
  /** 被分派到这单的中介 */
  isAgent: boolean;
  isAdmin: boolean;
  canView: boolean;
  /** 中介或超管：可推进订单、看双方联系方式 */
  canAct: boolean;
}

export function orderPerms(o: { buyerId: number; sellerId: number; agentId: number | null }, u: SafeUser): OrderPerms {
  const isBuyer = o.buyerId === u.id;
  const isSeller = o.sellerId === u.id;
  const isAgent = o.agentId !== null && o.agentId === u.id;
  const isAdmin = u.role === "admin";
  return { isBuyer, isSeller, isAgent, isAdmin, canView: isBuyer || isSeller || isAgent || isAdmin, canAct: isAgent || isAdmin };
}

/** 我买的 + 我卖的 */
export async function listMyOrders(userId: number) {
  const agent = alias(users, "agent");
  const other = alias(users, "other");
  const base = {
    id: orders.id,
    status: orders.status,
    createdAt: orders.createdAt,
    finalPrice: orders.finalPrice,
    listingId: orders.listingId,
    title: listings.title,
    price: listings.price,
    cover: listingCover,
    agentName: agent.username,
    counterpart: other.username,
  };
  const [asBuyer, asSeller] = await Promise.all([
    db
      .select(base)
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(other, eq(orders.sellerId, other.id))
      .leftJoin(agent, eq(orders.agentId, agent.id))
      .where(eq(orders.buyerId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select(base)
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(other, eq(orders.buyerId, other.id))
      .leftJoin(agent, eq(orders.agentId, agent.id))
      .where(eq(orders.sellerId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(100),
  ]);
  return { asBuyer, asSeller };
}
export type MyOrderRow = Awaited<ReturnType<typeof listMyOrders>>["asBuyer"][number];

/** 中介工作台 */
export async function listAgentOrders(agentId: number, statuses: readonly OrderStatus[]) {
  const buyer = alias(users, "buyer");
  const seller = alias(users, "seller");
  return db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
      startedAt: orders.startedAt,
      completedAt: orders.completedAt,
      cancelledAt: orders.cancelledAt,
      finalPrice: orders.finalPrice,
      feeActual: orders.feeActual,
      buyerMessage: orders.buyerMessage,
      listingId: orders.listingId,
      title: listings.title,
      price: listings.price,
      feeMode: listings.feeMode,
      listingStatus: listings.status,
      buyerName: buyer.username,
      sellerName: seller.username,
    })
    .from(orders)
    .innerJoin(listings, eq(orders.listingId, listings.id))
    .innerJoin(buyer, eq(orders.buyerId, buyer.id))
    .innerJoin(seller, eq(orders.sellerId, seller.id))
    .where(and(eq(orders.agentId, agentId), inArray(orders.status, [...statuses])))
    .orderBy(statuses.includes("completed") || statuses.includes("cancelled") ? desc(orders.createdAt) : asc(orders.createdAt))
    .limit(200);
}
export type AgentOrderRow = Awaited<ReturnType<typeof listAgentOrders>>[number];

export async function countAgentOrders(agentId: number) {
  const rows = await db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .where(eq(orders.agentId, agentId))
    .groupBy(orders.status);
  const n = (s: OrderStatus) => rows.find((r) => r.status === s)?.n ?? 0;
  return { pending: n("pending_contact"), inProgress: n("in_progress"), completed: n("completed"), cancelled: n("cancelled") };
}

/** 超管：全部意向单 */
export async function listAllOrders(f: { status?: string; agentId?: number; unassigned?: boolean; q?: string; page: number }, pageSize = 30) {
  const buyer = alias(users, "buyer");
  const seller = alias(users, "seller");
  const agent = alias(users, "agent");
  const conds: SQL[] = [];
  if (f.status && f.status in { pending_assign: 1, pending_contact: 1, in_progress: 1, completed: 1, cancelled: 1 }) {
    conds.push(eq(orders.status, f.status as OrderStatus));
  }
  if (f.unassigned) conds.push(sql`${orders.agentId} is null`);
  if (f.agentId) conds.push(eq(orders.agentId, f.agentId));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(
      /^\d+$/.test(f.q)
        ? sql`(${orders.id} = ${Number(f.q)} or ${listings.title} ilike ${like})`
        : sql`(${listings.title} ilike ${like} or ${buyer.username} ilike ${like} or ${seller.username} ilike ${like})`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        createdAt: orders.createdAt,
        finalPrice: orders.finalPrice,
        cancelReason: orders.cancelReason,
        listingId: orders.listingId,
        title: listings.title,
        price: listings.price,
        buyerId: orders.buyerId,
        buyerName: buyer.username,
        sellerId: orders.sellerId,
        sellerName: seller.username,
        agentId: orders.agentId,
        agentName: agent.username,
      })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(buyer, eq(orders.buyerId, buyer.id))
      .innerJoin(seller, eq(orders.sellerId, seller.id))
      .leftJoin(agent, eq(orders.agentId, agent.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(pageSize)
      .offset((f.page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(buyer, eq(orders.buyerId, buyer.id))
      .innerJoin(seller, eq(orders.sellerId, seller.id))
      .where(where),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** 可被分派的中介（含超管），不看是否接单，由超管判断 */
export async function listAssignableAgents() {
  return db
    .select({ id: users.id, username: users.username, agentAccepting: users.agentAccepting, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ["agent", "admin"]), eq(users.status, "active")))
    .orderBy(asc(users.id));
}

function monthRange(month: string): [Date, Date] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return [new Date(y, mo - 1, 1), new Date(y, mo, 1)];
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 中介月报表：按中介汇总当月完成单 */
export async function agentMonthlyReport(month: string) {
  const range = monthRange(month);
  if (!range) return [];
  const agent = alias(users, "agent");
  return db
    .select({
      agentId: orders.agentId,
      agentName: agent.username,
      deals: count(),
      gmv: sql<number>`coalesce(sum(${orders.finalPrice}), 0)::int`,
      feeCalculated: sql<number>`coalesce(sum(${orders.feeCalculated}), 0)::int`,
      feeActual: sql<number>`coalesce(sum(${orders.feeActual}), 0)::int`,
    })
    .from(orders)
    .leftJoin(agent, eq(orders.agentId, agent.id))
    .where(and(eq(orders.status, "completed"), gte(orders.completedAt, range[0]), lt(orders.completedAt, range[1])))
    .groupBy(orders.agentId, agent.username)
    .orderBy(desc(count()));
}

/** 中介月报表明细，导出 CSV 用 */
export async function completedOrdersInMonth(month: string) {
  const range = monthRange(month);
  if (!range) return [];
  const buyer = alias(users, "buyer");
  const seller = alias(users, "seller");
  const agent = alias(users, "agent");
  return db
    .select({
      id: orders.id,
      completedAt: orders.completedAt,
      title: listings.title,
      listingPrice: listings.price,
      feeMode: listings.feeMode,
      finalPrice: orders.finalPrice,
      feeCalculated: orders.feeCalculated,
      feeActual: orders.feeActual,
      feeOverrideReason: orders.feeOverrideReason,
      buyerName: buyer.username,
      sellerName: seller.username,
      agentName: agent.username,
    })
    .from(orders)
    .innerJoin(listings, eq(orders.listingId, listings.id))
    .innerJoin(buyer, eq(orders.buyerId, buyer.id))
    .innerJoin(seller, eq(orders.sellerId, seller.id))
    .leftJoin(agent, eq(orders.agentId, agent.id))
    .where(and(eq(orders.status, "completed"), gte(orders.completedAt, range[0]), lt(orders.completedAt, range[1])))
    .orderBy(asc(orders.completedAt));
}
