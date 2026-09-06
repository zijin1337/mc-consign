/**
 * 数据模型，对应 docs/02-数据模型初稿.md。
 * 所有表：bigserial 主键 + created_at / updated_at（timestamptz）。
 */
import { relations, sql } from "drizzle-orm";
import type { ApiSnapshot, PlayerSummary, SkyblockSummary } from "../lib/hypixel/types";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- 枚举 ----------
export const userRole = pgEnum("user_role", ["user", "agent", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "banned"]);
export const feeMode = pgEnum("fee_mode", ["all_in", "exclusive"]);
export const listingSource = pgEnum("listing_source", ["self_bought", "mfa", "second_hand"]);
export const listingStatus = pgEnum("listing_status", [
  "pending_review",
  "on_sale",
  "rejected",
  "off_shelf",
  "in_trade",
  "sold",
  "deleted",
]);
export const orderStatus = pgEnum("order_status", [
  "pending_assign",
  "pending_contact",
  "in_progress",
  "completed",
  "cancelled",
]);
export const cancelReason = pgEnum("cancel_reason", [
  "buyer_quit",
  "seller_quit",
  "mismatch",
  "price_disagree",
  "sold_elsewhere",
  "other",
  /** 买家在中介联系前自行撤回，不算爽约 */
  "buyer_withdrawn",
  /** 商品被删除、下架或卖家被封，系统自动关闭 */
  "listing_unavailable",
]);
export const aftersaleStatus = pgEnum("aftersale_status", ["open", "resolved", "rejected"]);
export const aftersaleResult = pgEnum("aftersale_result", ["refund", "negotiated", "rejected"]);
export const creditReason = pgEnum("credit_reason", ["deal", "manual", "aftersale", "no_show", "ban"]);
export const codePurpose = pgEnum("code_purpose", ["register", "reset_password", "change_qq"]);
export const blacklistType = pgEnum("blacklist_type", ["qq", "phone"]);
/** 求购单：求购中 / 已完成（据此下的意向单成交）/ 买家关闭 / 管理员下架。「已过期」是展示状态，不落库 */
export const wantedStatus = pgEnum("wanted_status", ["open", "fulfilled", "closed", "removed"]);
/** 对求购单的账号推荐：待买家回应 / 买家已据此下单 / 买家谢绝 / 推荐人撤回 / 随求购单关闭 */
export const wantedOfferStatus = pgEnum("wanted_offer_status", ["pending", "accepted", "declined", "withdrawn", "closed"]);

// ---------- 公共列 ----------
const id = () => bigserial("id", { mode: "number" }).primaryKey();
const ref = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

// ---------- 游戏模板 attr_schema 的元素类型 ----------
export type AttrFieldType = "int" | "enum" | "multi_enum" | "text" | "year" | "bool";
export interface AttrField {
  key: string;
  label: string;
  type: AttrFieldType;
  options?: string[];
  required: boolean;
  /** 列表页是否公开 */
  publicInList: boolean;
  /** 提示文字 */
  hint?: string;
  /** bool 类型的 [真, 假] 显示文案，例如 ["能", "不能"] */
  boolLabels?: [string, string];
  /** text 类型的格式正则（不带斜杠），例如正版 ID 只允许字母数字下划线 */
  pattern?: string;
  patternMessage?: string;
}

// ---------- users ----------
export const users = pgTable(
  "users",
  {
    id: id(),
    username: varchar("username", { length: 16 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    qq: varchar("qq", { length: 12 }).notNull(),
    qqVerifiedAt: ts("qq_verified_at"),
    phone: varchar("phone", { length: 11 }).notNull(),
    phoneVerifiedAt: ts("phone_verified_at"),
    role: userRole("role").notNull().default("user"),
    creditScore: integer("credit_score").notNull().default(100),
    dealCount: integer("deal_count").notNull().default(0),
    noShowCount: integer("no_show_count").notNull().default(0),
    noShowLockedUntil: ts("no_show_locked_until"),
    status: userStatus("status").notNull().default("active"),
    banReason: text("ban_reason"),
    banUntil: ts("ban_until"),
    usernameChangedAt: ts("username_changed_at"),
    /** 最近一次自己改密码的时间。超管为空表示还在用种子脚本给的初始口令，登录后强制改 */
    passwordChangedAt: ts("password_changed_at"),
    avatarPath: text("avatar_path"),
    notifyEmail: boolean("notify_email").notNull().default(true),
    agentIntro: text("agent_intro"),
    agentAccepting: boolean("agent_accepting").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`),
    uniqueIndex("users_qq_uq").on(t.qq),
    uniqueIndex("users_phone_uq").on(t.phone),
    index("users_role_idx").on(t.role),
    check("users_credit_non_negative", sql`${t.creditScore} >= 0`),
  ],
);

// ---------- games ----------
export const games = pgTable(
  "games",
  {
    id: id(),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    attrSchema: jsonb("attr_schema").$type<AttrField[]>().notNull(),
    titleTemplate: text("title_template").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("games_code_uq").on(t.code)],
);

// ---------- listings ----------
export const listings = pgTable(
  "listings",
  {
    id: id(),
    sellerId: ref("seller_id")
      .notNull()
      .references(() => users.id),
    gameId: ref("game_id")
      .notNull()
      .references(() => games.id),
    title: text("title").notNull(),
    price: integer("price").notNull(),
    feeMode: feeMode("fee_mode").notNull(),
    source: listingSource("source").notNull(),
    hasTransactionId: boolean("has_transaction_id").notNull(),
    /** 仅中介与超管可见 */
    contact: text("contact").notNull(),
    note: text("note"),
    preferredAgentId: ref("preferred_agent_id").references(() => users.id),
    attrs: jsonb("attrs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: listingStatus("status").notNull().default("pending_review"),
    reviewNote: text("review_note"),
    reviewedBy: ref("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    dirtySinceApproval: boolean("dirty_since_approval").notNull().default(false),
    weight: integer("weight").notNull().default(0),
    /** 置顶截止时间，为空或已过期即不置顶。超管设置，带时长 */
    pinnedUntil: ts("pinned_until"),
    /** 正版 ID 解析出的 Mojang UUID（无横线），用于拉取 Hypixel 数据 */
    mcUuid: varchar("mc_uuid", { length: 32 }),
    /** 提交时从 Hypixel API 抓到的等级 / 会员快照，审核核对与「已核对」标签用 */
    apiSnapshot: jsonb("api_snapshot").$type<ApiSnapshot | null>(),
    viewCount: integer("view_count").notNull().default(0),
    approvedAt: ts("approved_at"),
    soldAt: ts("sold_at"),
    deletedAt: ts("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("listings_list_idx").on(t.status, t.weight.desc(), t.approvedAt.asc()),
    index("listings_pinned_idx").on(t.pinnedUntil).where(sql`${t.pinnedUntil} is not null`),
    index("listings_mc_uuid_idx").on(t.mcUuid),
    check("listings_price_positive", sql`${t.price} > 0`),
    index("listings_seller_idx").on(t.sellerId),
    index("listings_attrs_gin").using("gin", t.attrs),
  ],
);

// ---------- listing_images ----------
export const listingImages = pgTable(
  "listing_images",
  {
    id: id(),
    listingId: ref("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    ...timestamps,
  },
  (t) => [index("listing_images_listing_idx").on(t.listingId, t.sortOrder)],
);

// ---------- wanted_requests 求购单 ----------
export const wantedRequests = pgTable(
  "wanted_requests",
  {
    id: id(),
    buyerId: ref("buyer_id")
      .notNull()
      .references(() => users.id),
    gameId: ref("game_id")
      .notNull()
      .references(() => games.id),
    /** 由条件自动生成（wanted-shared.ts renderWantedTitle），列表与通知里用 */
    title: text("title").notNull(),
    /** 可接受的会员类型，空数组 = 不限 */
    ranks: jsonb("ranks").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    minLevel: integer("min_level"),
    /** 想要的披风，空数组 = 不限 */
    capes: jsonb("capes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    budgetMin: integer("budget_min"),
    budgetMax: integer("budget_max").notNull(),
    /** 其他要求，公开可见；发布时拦违禁词与联系方式 */
    requirements: text("requirements"),
    preferredAgentId: ref("preferred_agent_id").references(() => users.id),
    status: wantedStatus("status").notNull().default("open"),
    /** 到期后不再公开展示、不能再被推荐，买家可续期。查询时比较，不用定时任务 */
    expiresAt: ts("expires_at").notNull(),
    /** 管理员下架原因 */
    adminNote: text("admin_note"),
    removedBy: ref("removed_by").references(() => users.id),
    viewCount: integer("view_count").notNull().default(0),
    closedAt: ts("closed_at"),
    ...timestamps,
  },
  (t) => [
    index("wanted_requests_list_idx").on(t.status, t.expiresAt, t.createdAt.desc()),
    index("wanted_requests_buyer_idx").on(t.buyerId),
    check("wanted_requests_budget_positive", sql`${t.budgetMax} > 0`),
    check("wanted_requests_budget_range", sql`${t.budgetMin} is null or ${t.budgetMin} <= ${t.budgetMax}`),
  ],
);

// ---------- wanted_offers 对求购单的账号推荐 ----------
export const wantedOffers = pgTable(
  "wanted_offers",
  {
    id: id(),
    requestId: ref("request_id")
      .notNull()
      .references(() => wantedRequests.id, { onDelete: "cascade" }),
    listingId: ref("listing_id")
      .notNull()
      .references(() => listings.id),
    /** 账号的卖家；推荐人是中介时也记卖家，双方都能看到 */
    sellerId: ref("seller_id")
      .notNull()
      .references(() => users.id),
    /** 推荐人：卖家本人，或中介 / 超管 */
    offeredBy: ref("offered_by")
      .notNull()
      .references(() => users.id),
    message: text("message"),
    status: wantedOfferStatus("status").notNull().default("pending"),
    respondedAt: ts("responded_at"),
    ...timestamps,
  },
  (t) => [
    // 同一个账号对同一张求购单只有一条记录；撤回后再推是更新这条，不新增
    uniqueIndex("wanted_offers_request_listing_uq").on(t.requestId, t.listingId),
    index("wanted_offers_listing_idx").on(t.listingId),
    index("wanted_offers_offered_by_idx").on(t.offeredBy),
    index("wanted_offers_request_idx").on(t.requestId, t.status),
  ],
);

// ---------- orders 意向单 ----------
export const orders = pgTable(
  "orders",
  {
    id: id(),
    listingId: ref("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: ref("buyer_id")
      .notNull()
      .references(() => users.id),
    sellerId: ref("seller_id")
      .notNull()
      .references(() => users.id),
    agentId: ref("agent_id").references(() => users.id),
    status: orderStatus("status").notNull(),
    buyerMessage: text("buyer_message"),
    /** 成交金额，不含中介费 */
    finalPrice: integer("final_price"),
    feeCalculated: integer("fee_calculated"),
    feeActual: integer("fee_actual"),
    feeOverrideReason: text("fee_override_reason"),
    cancelReason: cancelReason("cancel_reason"),
    cancelNote: text("cancel_note"),
    cancelledBy: ref("cancelled_by").references(() => users.id),
    warrantyUntil: date("warranty_until"),
    agentNote: text("agent_note"),
    /** 买家从求购单的推荐下单时挂上求购单；成交后求购单随之完成 */
    wantedRequestId: ref("wanted_request_id").references(() => wantedRequests.id),
    assignedAt: ts("assigned_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    ...timestamps,
  },
  (t) => [
    // 同一买家对同一商品只能有一张未关闭单
    uniqueIndex("orders_open_per_buyer_uq")
      .on(t.listingId, t.buyerId)
      .where(sql`${t.status} in ('pending_assign', 'pending_contact', 'in_progress')`),
    // 一个商品同时只能有一张交易中的单
    uniqueIndex("orders_one_in_progress_uq")
      .on(t.listingId)
      .where(sql`${t.status} = 'in_progress'`),
    // 一个商品只能成交一次
    uniqueIndex("orders_one_completed_uq")
      .on(t.listingId)
      .where(sql`${t.status} = 'completed'`),
    check("orders_final_price_positive", sql`${t.finalPrice} is null or ${t.finalPrice} > 0`),
    check("orders_fees_non_negative", sql`coalesce(${t.feeCalculated}, 0) >= 0 and coalesce(${t.feeActual}, 0) >= 0`),
    index("orders_agent_idx").on(t.agentId, t.status),
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_listing_idx").on(t.listingId, t.createdAt),
    index("orders_wanted_idx").on(t.wantedRequestId).where(sql`${t.wantedRequestId} is not null`),
  ],
);

// ---------- aftersales 售后 ----------
export const aftersales = pgTable(
  "aftersales",
  {
    id: id(),
    orderId: ref("order_id")
      .notNull()
      .references(() => orders.id),
    openedBy: ref("opened_by")
      .notNull()
      .references(() => users.id),
    description: text("description").notNull(),
    status: aftersaleStatus("status").notNull().default("open"),
    result: aftersaleResult("result"),
    resultNote: text("result_note"),
    sellerAtFault: boolean("seller_at_fault"),
    handledBy: ref("handled_by").references(() => users.id),
    closedAt: ts("closed_at"),
    ...timestamps,
  },
  (t) => [index("aftersales_order_idx").on(t.orderId)],
);

// ---------- credit_logs ----------
export const creditLogs = pgTable(
  "credit_logs",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reasonType: creditReason("reason_type").notNull(),
    reasonText: text("reason_text").notNull(),
    refType: text("ref_type"),
    refId: ref("ref_id"),
    operatorId: ref("operator_id").references(() => users.id),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("credit_logs_user_idx").on(t.userId, t.createdAt)],
);

// ---------- audit_logs ----------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    operatorId: ref("operator_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: ref("target_id"),
    before: jsonb("before").$type<unknown>(),
    after: jsonb("after").$type<unknown>(),
    ip: inet("ip"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_operator_idx").on(t.operatorId, t.createdAt),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

// ---------- notifications ----------
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    emailedAt: ts("emailed_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

// ---------- verification_codes ----------
export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: id(),
    target: text("target").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: codePurpose("purpose").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("verification_codes_target_idx").on(t.target, t.purpose, t.createdAt)],
);

// ---------- sessions ----------
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

// ---------- banned_words ----------
export const bannedWords = pgTable(
  "banned_words",
  {
    id: id(),
    word: text("word").notNull(),
    createdBy: ref("created_by").references(() => users.id),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("banned_words_word_uq").on(t.word)],
);

// ---------- blacklist ----------
export const blacklist = pgTable(
  "blacklist",
  {
    id: id(),
    type: blacklistType("type").notNull(),
    value: text("value").notNull(),
    reason: text("reason").notNull(),
    sourceUserId: ref("source_user_id").references(() => users.id),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("blacklist_type_value_uq").on(t.type, t.value)],
);

// ---------- hypixel_players：Hypixel / Mojang 数据缓存 ----------
export const hypixelPlayers = pgTable(
  "hypixel_players",
  {
    /** Mojang UUID，无横线小写 */
    uuid: varchar("uuid", { length: 32 }).primaryKey(),
    name: text("name").notNull(),
    summary: jsonb("summary").$type<PlayerSummary>().notNull(),
    skyblock: jsonb("skyblock").$type<SkyblockSummary | null>(),
    fetchedAt: ts("fetched_at").notNull(),
  },
  (t) => [index("hypixel_players_name_idx").on(sql`lower(${t.name})`)],
);

// ---------- pending_images：已上传、尚未挂到商品上的图片 ----------
export const pendingImages = pgTable(
  "pending_images",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("pending_images_user_idx").on(t.userId), index("pending_images_created_idx").on(t.createdAt)],
);

// ---------- mail_outbox：邮件发件箱，事务提交后再发，回滚就不发 ----------
export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: id(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    notificationId: ref("notification_id"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: ts("locked_at"),
    sentAt: ts("sent_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("mail_outbox_pending_idx").on(t.createdAt).where(sql`${t.sentAt} is null`)],
);

// ---------- settings ----------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: ref("updated_by").references(() => users.id),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

// ---------- relations ----------
export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings, { relationName: "seller" }),
  ordersAsBuyer: many(orders, { relationName: "buyer" }),
  ordersAsAgent: many(orders, { relationName: "agent" }),
  creditLogs: many(creditLogs),
  notifications: many(notifications),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(users, { fields: [listings.sellerId], references: [users.id], relationName: "seller" }),
  preferredAgent: one(users, {
    fields: [listings.preferredAgentId],
    references: [users.id],
    relationName: "preferredAgent",
  }),
  game: one(games, { fields: [listings.gameId], references: [games.id] }),
  images: many(listingImages),
  orders: many(orders),
}));

export const listingImagesRelations = relations(listingImages, ({ one }) => ({
  listing: one(listings, { fields: [listingImages.listingId], references: [listings.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  listing: one(listings, { fields: [orders.listingId], references: [listings.id] }),
  buyer: one(users, { fields: [orders.buyerId], references: [users.id], relationName: "buyer" }),
  seller: one(users, { fields: [orders.sellerId], references: [users.id], relationName: "orderSeller" }),
  agent: one(users, { fields: [orders.agentId], references: [users.id], relationName: "agent" }),
  aftersales: many(aftersales),
  wanted: one(wantedRequests, { fields: [orders.wantedRequestId], references: [wantedRequests.id] }),
}));

export const wantedRequestsRelations = relations(wantedRequests, ({ one, many }) => ({
  buyer: one(users, { fields: [wantedRequests.buyerId], references: [users.id], relationName: "wantedBuyer" }),
  preferredAgent: one(users, { fields: [wantedRequests.preferredAgentId], references: [users.id], relationName: "wantedPreferredAgent" }),
  game: one(games, { fields: [wantedRequests.gameId], references: [games.id] }),
  offers: many(wantedOffers),
}));

export const wantedOffersRelations = relations(wantedOffers, ({ one }) => ({
  request: one(wantedRequests, { fields: [wantedOffers.requestId], references: [wantedRequests.id] }),
  listing: one(listings, { fields: [wantedOffers.listingId], references: [listings.id] }),
  seller: one(users, { fields: [wantedOffers.sellerId], references: [users.id], relationName: "wantedOfferSeller" }),
  offerer: one(users, { fields: [wantedOffers.offeredBy], references: [users.id], relationName: "wantedOfferer" }),
}));

export const aftersalesRelations = relations(aftersales, ({ one }) => ({
  order: one(orders, { fields: [aftersales.orderId], references: [orders.id] }),
}));

export const creditLogsRelations = relations(creditLogs, ({ one }) => ({
  user: one(users, { fields: [creditLogs.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ---------- 行类型 ----------
export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type ListingImage = typeof listingImages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Game = typeof games.$inferSelect;
export type WantedRequest = typeof wantedRequests.$inferSelect;
export type WantedOffer = typeof wantedOffers.$inferSelect;
