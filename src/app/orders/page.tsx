import Link from "next/link";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeleton";
import { Badge, Card, Empty, LinkButton, PageHeader, cn, tableFlushClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { imageUrl } from "@/lib/image-url";
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, formatDateTime, formatPrice } from "@/lib/labels";
import { maskUsername } from "@/lib/mask";
import { listMyOrders, type MyOrderRow } from "@/lib/orders";

export const metadata = { title: "我的意向单" };

function OrderTable({ rows, counterpartLabel }: { rows: MyOrderRow[]; counterpartLabel: string }) {
  if (rows.length === 0) return <Empty text="还没有意向单" />;
  return (
    <table className={cn(tableFlushClass, "table-cards")}>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">账号</th>
          <th scope="col">{counterpartLabel}</th>
          <th scope="col">中介</th>
          <th scope="col">状态</th>
          <th scope="col">时间</th>
          <th scope="col"><span className="sr-only">操作</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td data-label="单号" className="font-mono text-zinc-500">{r.id}</td>
            <td className="tc-main">
              <div className="flex items-center gap-3">
                <div className="h-10 w-16 shrink-0 overflow-hidden bg-white/[0.06]">
                  {r.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(r.cover)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <Link href={`/listings/${r.listingId}`} className="link-quiet block truncate">{r.title}</Link>
                  <span className="text-xs text-zinc-500">
                    标价 {formatPrice(r.price)}
                    {r.finalPrice ? ` · 成交 ${formatPrice(r.finalPrice)}` : ""}
                  </span>
                </div>
              </div>
            </td>
            <td data-label={counterpartLabel}>{maskUsername(r.counterpart)}</td>
            <td data-label="中介">{r.agentName ?? <span className="text-amber-300">待分派</span>}</td>
            <td data-label="状态"><Badge className={ORDER_STATUS_CLASS[r.status]}>{ORDER_STATUS_LABEL[r.status]}</Badge></td>
            <td data-label="时间" className="whitespace-nowrap text-zinc-500">{formatDateTime(r.createdAt)}</td>
            <td className="tc-actions"><LinkButton href={`/orders/${r.id}`} size="sm" variant="secondary">查看</LinkButton></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 数据部分单独成组件放进 Suspense：鉴权在外面先完成，列表流式到达前先显示骨架 */
async function OrdersBody({ userId }: { userId: number }) {
  const { asBuyer, asSeller } = await listMyOrders(userId);
  return (
    <>
      <Card flush={asBuyer.length > 0} title={`我买的（${asBuyer.length}）`}>
        <OrderTable rows={asBuyer} counterpartLabel="卖家" />
      </Card>
      <Card flush={asSeller.length > 0} title={`我卖的（${asSeller.length}）`}>
        <OrderTable rows={asSeller} counterpartLabel="买家" />
      </Card>
    </>
  );
}

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="ORDERS" title="我的意向单" description="买家下单后由中介通过 QQ 撮合，每一步状态都记录在这里。" actions={<LinkButton href="/" variant="secondary">浏览账号</LinkButton>} />
      <Suspense
        fallback={
          <div data-skeleton="orders" aria-busy="true" aria-label="加载中" className="space-y-6">
            <TableSkeleton rows={2} flush />
            <TableSkeleton rows={3} flush />
          </div>
        }
      >
        <OrdersBody userId={user.id} />
      </Suspense>
    </div>
  );
}
