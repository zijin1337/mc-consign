import Link from "next/link";
import { parsePage } from "@/lib/ids";
import { assignOrder } from "@/actions/orders";
import { Pagination } from "@/components/pagination";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, tableFlushClass } from "@/components/ui";
import { CANCEL_REASON_LABEL, ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, formatDateTime, formatPrice } from "@/lib/labels";
import { listAllOrders, listAssignableAgents } from "@/lib/orders";

export const metadata = { title: "意向单管理" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const agentId = typeof sp.agent === "string" && /^\d+$/.test(sp.agent) ? Number(sp.agent) : undefined;
  const unassigned = sp.unassigned === "1";
  const page = parsePage(sp.page);

  const [{ rows, total, pages }, agents] = await Promise.all([listAllOrders({ status, q, agentId, unassigned, page }), listAssignableAgents()]);

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="意向单" title="意向单管理" description={`共 ${total} 条。待分派的单在这里指定中介，也可以随时改派。`} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={status} className="w-36">
          <option value="">全部状态</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select name="agent" defaultValue={agentId ? String(agentId) : ""} className="w-40">
          <option value="">全部中介</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.username}</option>
          ))}
        </Select>
        <label className="flex h-11 cursor-pointer items-center gap-2 border border-white/10 bg-field px-3 text-sm text-zinc-300 has-[:checked]:border-lime-300/60 has-[:checked]:bg-lime-300/[0.08] has-[:checked]:text-white">
          <input type="checkbox" name="unassigned" value="1" defaultChecked={unassigned} />
          只看未分派
        </label>
        <Input name="q" defaultValue={q} placeholder="单号 / 账号 / 买家 / 卖家" className="w-56" />
        <Button type="submit" variant="secondary">查询</Button>
      </form>

      {rows.length === 0 ? (
        <Empty text="没有符合条件的意向单" />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">账号</th>
                <th scope="col">买家</th>
                <th scope="col">卖家</th>
                <th scope="col">中介</th>
                <th scope="col">状态</th>
                <th scope="col">时间</th>
                <th scope="col"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = r.status === "pending_assign" || r.status === "pending_contact" || r.status === "in_progress";
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-zinc-500">{r.id}</td>
                    <td>
                      <Link href={`/admin/listings/${r.listingId}`} className="link-quiet">{r.title}</Link>
                      <p className="text-xs text-zinc-500">
                        {formatPrice(r.price)}
                        {r.finalPrice ? ` · 成交 ${formatPrice(r.finalPrice)}` : ""}
                      </p>
                    </td>
                    <td><Link href={`/admin/users/${r.buyerId}`} className="link">{r.buyerName}</Link></td>
                    <td><Link href={`/admin/users/${r.sellerId}`} className="link">{r.sellerName}</Link></td>
                    <td>
                      {open ? (
                        <form action={assignOrder} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <Select name="agentId" defaultValue="" className="h-9 w-36 px-2">
                            <option value="">{r.agentName ?? "未分派"}</option>
                            {agents
                              .filter((a) => a.id !== r.buyerId && a.id !== r.sellerId && a.id !== r.agentId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.username}
                                  {a.agentAccepting ? "" : "（停止接单）"}
                                </option>
                              ))}
                          </Select>
                          <SubmitButton size="sm" variant="secondary" pendingText="…">{r.agentId ? "改派" : "分派"}</SubmitButton>
                        </form>
                      ) : (
                        r.agentName ?? "-"
                      )}
                    </td>
                    <td>
                      <Badge className={ORDER_STATUS_CLASS[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge>
                      {r.status === "cancelled" && r.cancelReason && <p className="mt-1 text-xs text-zinc-500">{CANCEL_REASON_LABEL[r.cancelReason]}</p>}
                    </td>
                    <td className="whitespace-nowrap text-zinc-500">{formatDateTime(r.createdAt)}</td>
                    <td><LinkButton href={`/orders/${r.id}`} variant="secondary" size="sm">查看</LinkButton></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/admin/orders" />
    </div>
  );
}
