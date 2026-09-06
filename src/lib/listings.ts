import "server-only";
import { cache } from "react";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { parseIntParam, parsePage } from "./ids";
import { toMarketCard, type MarketCard, type MarketViewer } from "./market-shared";
import type { Settings } from "./settings-shared";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";

const { listings, users, orders } = schema;

export const PAGE_SIZE = 24;

// 卡片数据类型定义在 market-shared.ts（前后端共用），这里转出方便调用方只 import 一处
export type { MarketCard, MarketViewer } from "./market-shared";

export interface ListFilters {
  rank?: string;
  minLevel?: number;
  maxLevel?: number;
  minPrice?: number;
  maxPrice?: number;
  source?: string;
  cape?: string;
  page?: number;
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 32) : undefined;
}

/** 查询串里的筛选值全部收敛成整数与短字符串，乱值当作没填 */
export function parseFilters(sp: Record<string, string | string[] | undefined>): ListFilters {
  return {
    rank: str(sp.rank),
    minLevel: parseIntParam(sp.minLevel, 100_000),
    maxLevel: parseIntParam(sp.maxLevel, 100_000),
    minPrice: parseIntParam(sp.minPrice, 999_999),
    maxPrice: parseIntParam(sp.maxPrice, 999_999),
    source: str(sp.source),
    cape: str(sp.cape),
    page: parsePage(sp.page),
  };
}

// 注意要写 ${listings}.id 而不是 ${listings.id}：没有 join 时 Drizzle 会把后者渲染成不带表名的 "id"，
// 在子查询里会被解析成 li.id，导致永远查不到封面。
const coverSql = sql<string | null>`(select li.path from listing_images li where li.listing_id = ${listings}.id order by li.sort_order asc limit 1)`;

/**
 * 列表页：在售 + 交易中。
 * 置顶中的（pinned_until > now()）进「置顶栏」，受同样的筛选，不分页；其余进网格并分页。
 * 两边排序都是 权重 > 卖家信用分 > 上架时间。置顶到期不需要定时任务，查询时自然落回网格。
 * viewer 决定返回的字段宽度：游客只拿概览（价格、会员、有无披风），登录用户才拿正版 ID / 等级 / 披风种类 / UUID / 核对标。
 * 收窄在这里做，游客拿到的对象里没有那些字段，不是靠前端藏。
 */
export async function listPublicListings(f: ListFilters, viewer: MarketViewer) {
  const conds = [inArray(listings.status, ["on_sale", "in_trade"])];
  if (f.rank) conds.push(sql`${listings.attrs}->>'rank' = ${f.rank}`);
  if (f.minLevel !== undefined) conds.push(sql`coalesce((${listings.attrs}->>'level')::int, 0) >= ${f.minLevel}`);
  if (f.maxLevel !== undefined) conds.push(sql`coalesce((${listings.attrs}->>'level')::int, 0) <= ${f.maxLevel}`);
  if (f.minPrice !== undefined) conds.push(gte(listings.price, f.minPrice));
  if (f.maxPrice !== undefined) conds.push(lte(listings.price, f.maxPrice));
  if (f.source === "self_bought" || f.source === "mfa" || f.source === "second_hand") conds.push(eq(listings.source, f.source));
  if (f.cape) conds.push(sql`coalesce(${listings.attrs}->'capes', '[]'::jsonb) @> ${JSON.stringify([f.cape])}::jsonb`);

  const base = and(...conds);
  const activePin = gt(listings.pinnedUntil, sql`now()`);
  const notPinned = or(isNull(listings.pinnedUntil), lte(listings.pinnedUntil, sql`now()`))!;
  const page = f.page ?? 1;
  // 不查 title：标题含正版 ID，卡片不展示；封面只给登录用户，收窄在 toMarketCard 里做
  const columns = {
    id: listings.id,
    price: listings.price,
    feeMode: listings.feeMode,
    status: listings.status,
    attrs: listings.attrs,
    pinnedUntil: listings.pinnedUntil,
    apiSnapshot: listings.apiSnapshot,
    approvedAt: listings.approvedAt,
    mcUuid: listings.mcUuid,
    cover: coverSql,
    sellerCredit: users.creditScore,
  };
  const query = () => db.select(columns).from(listings).innerJoin(users, eq(listings.sellerId, users.id));
  const order = [desc(listings.weight), desc(users.creditScore), asc(listings.approvedAt)];

  const [pinnedRows, gridRows, [{ total }], game] = await Promise.all([
    query().where(and(base, activePin)).orderBy(...order),
    query()
      .where(and(base, notPinned))
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(listings).where(and(base, notPinned)),
    getMcGame(),
  ]);
  const now = new Date();
  // 公开列表只带模板里标了 publicInList 的属性，以后新增非公开属性不会顺着 attrs 整包漏出去；按访问者身份收窄见 toMarketCard
  const publicKeys = new Set(game.attrSchema.filter((f) => f.publicInList).map((f) => f.key));
  const shape = (r: (typeof pinnedRows)[number]): MarketCard => toMarketCard(r, viewer, publicKeys, now);
  return { pinned: pinnedRows.map(shape), rows: gridRows.map(shape), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * 卖家能否再挂一个（或让一个下架 / 被拒的账号重新进入审核或在售）。
 * 返回拦截原因，null 表示可以。excludeId 是正在操作的商品本身。
 */
export async function sellerListingBlock(user: { id: number; creditScore: number }, settings: Settings, excludeId?: number): Promise<string | null> {
  if (user.creditScore < settings.min_credit_to_list) return `信用分低于 ${settings.min_credit_to_list}，暂时不能上架账号`;
  const conds = [eq(listings.sellerId, user.id), inArray(listings.status, ["pending_review", "on_sale", "in_trade"])];
  if (excludeId) conds.push(sql`${listings.id} <> ${excludeId}`);
  const [{ n }] = await db.select({ n: count() }).from(listings).where(and(...conds));
  if (n >= settings.max_active_listings) return `最多同时挂 ${settings.max_active_listings} 个账号，请先处理已有的`;
  return null;
}

/** 旧名，等同 MarketCard，调用方逐步迁到新名 */
export type PublicListingRow = MarketCard;

/** 详情页数据。同一次渲染里 generateMetadata 与页面各调一次，用 cache 合并成一次查询 */
export const getListingDetail = cache(async (id: number) => {
  const row = await db.query.listings.findFirst({
    where: eq(listings.id, id),
    with: {
      seller: { columns: { id: true, username: true, creditScore: true, dealCount: true } },
      preferredAgent: { columns: { id: true, username: true } },
      game: true,
      images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
    },
  });
  if (!row) return null;
  const [{ queue }] = await db
    .select({ queue: count() })
    .from(orders)
    .where(and(eq(orders.listingId, id), inArray(orders.status, ["pending_assign", "pending_contact", "in_progress"])));
  return { ...row, queue };
});

export type ListingDetail = NonNullable<Awaited<ReturnType<typeof getListingDetail>>>;

/** 已完成区：只暴露列表级信息 + 成交价 + 成交日期 + 中介 */
export async function listSoldListings(pageRaw = 1) {
  const page = Math.min(100_000, Math.max(1, Math.floor(pageRaw) || 1));
  const agent = alias(users, "agent");
  const where = eq(listings.status, "sold");
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: listings.id,
        title: listings.title,
        price: listings.price,
        attrs: listings.attrs,
        soldAt: listings.soldAt,
        sellerName: users.username,
        finalPrice: orders.finalPrice,
        completedAt: orders.completedAt,
        agentName: agent.username,
      })
      .from(listings)
      .innerJoin(users, eq(listings.sellerId, users.id))
      .leftJoin(orders, and(eq(orders.listingId, listings.id), eq(orders.status, "completed")))
      .leftJoin(agent, eq(orders.agentId, agent.id))
      .where(where)
      .orderBy(desc(listings.soldAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(listings).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** 卖家自己的商品 */
export async function listMyListings(sellerId: number) {
  return db
    .select({
      id: listings.id,
      title: listings.title,
      price: listings.price,
      status: listings.status,
      reviewNote: listings.reviewNote,
      dirtySinceApproval: listings.dirtySinceApproval,
      createdAt: listings.createdAt,
      viewCount: listings.viewCount,
      cover: coverSql,
    })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), sql`${listings.status} <> 'deleted'`))
    .orderBy(desc(listings.createdAt));
}

/** 可选的中介列表（接单中的中介和超管） */
export async function listAgents() {
  return db
    .select({ id: users.id, username: users.username, agentIntro: users.agentIntro })
    .from(users)
    .where(and(inArray(users.role, ["agent", "admin"]), eq(users.agentAccepting, true), eq(users.status, "active")))
    .orderBy(asc(users.id));
}

/** 首页状态面板：在售、已成交、接单中介 */
export async function getMarketStats() {
  const [[{ onSale }], [{ sold }], [{ agents }]] = await Promise.all([
    db.select({ onSale: count() }).from(listings).where(inArray(listings.status, ["on_sale", "in_trade"])),
    db.select({ sold: count() }).from(listings).where(eq(listings.status, "sold")),
    db
      .select({ agents: count() })
      .from(users)
      .where(and(inArray(users.role, ["agent", "admin"]), eq(users.status, "active"), eq(users.agentAccepting, true))),
  ]);
  return { onSale, sold, agents };
}

export async function getMcGame() {
  const g = await db.query.games.findFirst({ where: eq(schema.games.code, "mc") });
  if (!g) throw new Error("游戏模板 mc 不存在，请先运行 pnpm db:seed");
  return g;
}
