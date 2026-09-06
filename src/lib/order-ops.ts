import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { notify } from "./notify";
import { OPEN_ORDER_STATUSES } from "./orders";

/**
 * 商品与用户状态变化时对意向单的联动处理。全部要求在调用方的事务里执行。
 */

const { orders, users } = schema;
const OPEN = [...OPEN_ORDER_STATUSES];
type CancelReason = NonNullable<(typeof orders.$inferSelect)["cancelReason"]>;

/**
 * 关闭某商品上所有未关闭的意向单（删除、下架、卖家被封时用），不给买家记爽约。
 * 返回被关闭的单，含之前是否有交易中的单，方便调用方决定商品状态。
 */
export async function closeOpenOrdersForListing(
  tx: Tx,
  listingId: number,
  opts: { reason: CancelReason; note: string; title: string; body: string; operatorId: number | null; except?: number },
) {
  const rows = await tx
    .select({ id: orders.id, buyerId: orders.buyerId, agentId: orders.agentId, status: orders.status })
    .from(orders)
    .where(and(eq(orders.listingId, listingId), inArray(orders.status, OPEN)))
    .for("update");
  const targets = rows.filter((r) => r.id !== opts.except);
  if (targets.length === 0) return { closed: [] as typeof rows, hadInProgress: false };
  const now = new Date();
  await tx
    .update(orders)
    .set({ status: "cancelled", cancelReason: opts.reason, cancelNote: opts.note, cancelledBy: opts.operatorId, cancelledAt: now })
    .where(inArray(orders.id, targets.map((r) => r.id)));
  const agents = new Set<number>();
  for (const r of targets) {
    await notify(r.buyerId, { type: "order_cancelled", title: opts.title, body: opts.body, link: `/orders/${r.id}` }, tx);
    if (r.agentId) agents.add(r.agentId);
  }
  for (const a of agents) {
    await notify(a, { type: "order_cancelled", title: opts.title, body: `${opts.body}无需再联系双方。`, link: "/agent?tab=cancelled" }, tx);
  }
  return { closed: targets, hadInProgress: targets.some((r) => r.status === "in_progress") };
}

/** 通知某商品上未关闭意向单的买家与中介，例如卖家修改了信息、商品暂时下线重审 */
export async function notifyOpenOrders(tx: Tx, listingId: number, n: { title: string; body: string }) {
  const rows = await tx
    .select({ id: orders.id, buyerId: orders.buyerId, agentId: orders.agentId })
    .from(orders)
    .where(and(eq(orders.listingId, listingId), inArray(orders.status, OPEN)));
  const agents = new Set<number>();
  for (const r of rows) {
    await notify(r.buyerId, { type: "order_waiting", title: n.title, body: n.body, link: `/orders/${r.id}` }, tx);
    if (r.agentId) agents.add(r.agentId);
  }
  for (const a of agents) await notify(a, { type: "order_waiting", title: n.title, body: n.body, link: "/agent" }, tx);
  return rows.length;
}

/**
 * 中介被封禁或失去中介资格：待联系的单退回待分派，交易中的单保留状态但清空中介，
 * 通知超管改派，通知买家中介变更。返回受影响的单数。
 */
export async function detachAgentOrders(tx: Tx, agentId: number, why: string): Promise<number> {
  const rows = await tx
    .select({ id: orders.id, status: orders.status, buyerId: orders.buyerId })
    .from(orders)
    .where(and(eq(orders.agentId, agentId), inArray(orders.status, OPEN)))
    .for("update");
  if (rows.length === 0) return 0;
  const pending = rows.filter((r) => r.status === "pending_contact").map((r) => r.id);
  const active = rows.filter((r) => r.status === "in_progress").map((r) => r.id);
  if (pending.length) await tx.update(orders).set({ agentId: null, status: "pending_assign", assignedAt: null }).where(inArray(orders.id, pending));
  if (active.length) await tx.update(orders).set({ agentId: null }).where(inArray(orders.id, active));
  const admins = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
  for (const a of admins) {
    await notify(
      a.id,
      {
        type: "order_new",
        title: "意向单需要改派",
        body: `${why}，其名下 ${rows.length} 张进行中的意向单需要重新分派${active.length ? `，其中 ${active.length} 张已在交易中，请优先处理` : ""}。`,
        link: "/admin/orders?unassigned=1",
      },
      tx,
    );
  }
  for (const r of rows) {
    await notify(r.buyerId, { type: "order_assigned", title: "中介变更", body: "原中介无法继续处理你的意向单，平台会重新安排中介，请留意通知。", link: `/orders/${r.id}` }, tx);
  }
  return rows.length;
}
