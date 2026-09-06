import Link from "next/link";
import { Suspense } from "react";
import { Skel, TableSkeleton } from "@/components/skeleton";
import { Alert, Badge, Card, Empty, LinkButton, PageHeader, cn, focusRing, tableFlushClass } from "@/components/ui";
import { requireRole, type SafeUser } from "@/lib/auth";
import { FEE_MODE_LABEL, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, formatDateTime, formatPrice } from "@/lib/labels";
import { countAgentOrders, listAgentOrders, type AgentOrderRow, type OrderStatus } from "@/lib/orders";
import { countActiveWantedAll, listOpenWantedForAgent, type PublicWantedRow } from "@/lib/wanted";
import { formatBudget, wantedConditionTags, wantedDaysLeft } from "@/lib/wanted-shared";

export const metadata = { title: "中介台" };

/** 前四个 tab 按意向单状态分组；第五个「求购」列出求购中的单子，中介去推荐账号 */
type Tab = { key: string; label: string; kind: "orders"; statuses: OrderStatus[] } | { key: "wanted"; label: string; kind: "wanted" };

const TABS: Tab[] = [
  { key: "pending", label: "待联系", kind: "orders", statuses: ["pending_contact"] },
  { key: "in_progress", label: "交易中", kind: "orders", statuses: ["in_progress"] },
  { key: "completed", label: "已完成", kind: "orders", statuses: ["completed"] },
  { key: "cancelled", label: "已取消", kind: "orders", statuses: ["cancelled"] },
  { key: "wanted", label: "求购", kind: "wanted" },
];

/** tab 栏与列表都依赖数据库计数，一起放进 Suspense。求购列表只在求购 tab 取（最多 100 条），其他 tab 只查一个计数 */
async function AgentBody({ user, tab }: { user: SafeUser; tab: Tab }) {
  const [rows, counts, wanted, wantedCount] = await Promise.all([
    tab.kind === "orders" ? listAgentOrders(user.id, tab.statuses) : Promise.resolve([] as AgentOrderRow[]),
    countAgentOrders(user.id),
    tab.kind === "wanted" ? listOpenWantedForAgent(user.id) : Promise.resolve([] as PublicWantedRow[]),
    tab.kind === "wanted" ? Promise.resolve(null) : countActiveWantedAll(),
  ]);
  const countOf: Record<string, number> = {
    pending: counts.pending,
    in_progress: counts.inProgress,
    completed: counts.completed,
    cancelled: counts.cancelled,
    wanted: wantedCount ?? wanted.length,
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/agent?tab=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={cn("nav-link flex items-center gap-2", focusRing, t.key === tab.key && "nav-link-active")}
          >
            {t.label}
            <span className="font-mono text-xs text-zinc-500">{countOf[t.key]}</span>
          </Link>
        ))}
      </div>

      {tab.kind === "wanted" ? (
        wanted.length === 0 ? (
          <Empty text="暂无进行中的求购" />
        ) : (
          <Card flush>
            <table className={cn(tableFlushClass, "table-cards")}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">求购</th>
                  <th scope="col">预算</th>
                  <th scope="col">买家</th>
                  <th scope="col">推荐数</th>
                  <th scope="col">剩余</th>
                  <th scope="col">指定中介</th>
                  <th scope="col"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {wanted.map((w) => (
                  <tr key={w.id} data-wanted-id={w.id}>
                    <td data-label="编号" className="font-mono text-zinc-500">{w.id}</td>
                    <td className="tc-main">
                      <Link href={`/wanted/${w.id}`} className="link-quiet">{w.title}</Link>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {wantedConditionTags(w).map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    </td>
                    <td data-label="预算" className="whitespace-nowrap font-semibold text-white">{formatBudget(w.budgetMin, w.budgetMax)}</td>
                    <td data-label="买家">
                      {w.buyerName}
                      <span className="block text-xs text-zinc-500">信用 {w.buyerCredit} · 成交 {w.buyerDeals} 次</span>
                    </td>
                    <td data-label="推荐数" className="font-mono">{w.offerCount}</td>
                    <td data-label="剩余" className="whitespace-nowrap text-zinc-500">{wantedDaysLeft(w.expiresAt)} 天</td>
                    <td data-label="指定中介">{w.preferredAgentId === user.id ? <Badge className="bg-amber-300/15 text-amber-300">指定你</Badge> : "-"}</td>
                    <td className="tc-actions"><LinkButton href={`/wanted/${w.id}`} size="sm">去推荐</LinkButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : rows.length === 0 ? (
        <Empty text={`没有${tab.label}的意向单`} />
      ) : (
        <Card flush>
          <table className={cn(tableFlushClass, "table-cards")}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">账号</th>
                <th scope="col">买家</th>
                <th scope="col">卖家</th>
                <th scope="col">留言</th>
                <th scope="col">{tab.key === "completed" ? "成交 / 中介费" : "时间"}</th>
                <th scope="col">状态</th>
                <th scope="col"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="单号" className="font-mono text-zinc-500">{r.id}</td>
                  <td className="tc-main">
                    <Link href={`/listings/${r.listingId}`} className="link-quiet">{r.title}</Link>
                    <p className="text-xs text-zinc-500">
                      {formatPrice(r.price)} · {FEE_MODE_LABEL[r.feeMode]}
                    </p>
                  </td>
                  <td data-label="买家">{r.buyerName}</td>
                  <td data-label="卖家">{r.sellerName}</td>
                  <td data-label="留言" className="text-zinc-400">
                    <span className="block max-w-xs truncate">{r.buyerMessage ?? "-"}</span>
                  </td>
                  <td data-label={tab.key === "completed" ? "成交 / 中介费" : "时间"} className="whitespace-nowrap text-zinc-500">
                    {tab.key === "completed" ? `${formatPrice(r.finalPrice ?? 0)} / ${formatPrice(r.feeActual ?? 0)}` : formatDateTime(r.startedAt ?? r.createdAt)}
                  </td>
                  <td data-label="状态"><Badge className={ORDER_STATUS_CLASS[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge></td>
                  <td className="tc-actions"><LinkButton href={`/orders/${r.id}`} size="sm">处理</LinkButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

export default async function AgentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["agent", "admin"], "/agent");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];

  return (
    <div>
      <PageHeader
        eyebrow="AGENT"
        title="中介台"
        description={
          tab.kind === "wanted"
            ? "买家发布的求购，指定你跟进的排在前面。有合适的在售账号就点「去推荐」，买家采纳后按意向单流程处理。"
            : "按提交顺序处理。先通过 QQ 联系买卖双方，确认要交易再点「开始交易」，成交后点「完成交易」填成交金额。"
        }
        actions={
          user.role === "admin" ? (
            <LinkButton href={tab.kind === "wanted" ? "/admin/wanted" : "/admin/orders"} variant="secondary">
              {tab.kind === "wanted" ? "全部求购" : "全部意向单"}
            </LinkButton>
          ) : undefined
        }
      />
      {!user.agentAccepting && <div className="mb-4"><Alert kind="warn">你已停止接单，买家下单时选不到你。要恢复接单请联系超管。</Alert></div>}

      <Suspense
        fallback={
          <div data-skeleton="agent" aria-busy="true" aria-label="加载中">
            <div className="mb-4 flex gap-6 border-b border-white/10 px-4 py-3">
              {TABS.map((t) => (
                <Skel key={t.key} className="h-4 w-16" />
              ))}
            </div>
            <TableSkeleton rows={4} title={false} flush />
          </div>
        }
      >
        <AgentBody user={user} tab={tab} />
      </Suspense>
    </div>
  );
}
