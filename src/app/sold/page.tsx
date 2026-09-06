import { Pagination } from "@/components/pagination";
import { parsePage } from "@/lib/ids";
import { Badge, Card, Empty, PageHeader, cn, tableFlushClass } from "@/components/ui";
import { formatDate, formatPrice } from "@/lib/labels";
import { listSoldListings } from "@/lib/listings";
import { maskUsername } from "@/lib/mask";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "成交记录" };

export default async function SoldPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [{ rows, total, pages }, settings] = await Promise.all([listSoldListings(page), getSettings()]);

  return (
    <div>
      <PageHeader eyebrow="SOLD" title="成交记录" description={`每一笔经中介完成的交易都公开在这里，可作市场参考价。共 ${total} 笔。`} />
      {rows.length === 0 ? (
        <Empty text="暂无成交记录" />
      ) : (
        <Card flush>
          <table className={cn(tableFlushClass, "table-cards")}>
            <thead>
              <tr>
                <th scope="col">会员</th>
                <th scope="col">等级</th>
                <th scope="col">正版 ID</th>
                {settings.show_sold_price && <th scope="col">成交价</th>}
                <th scope="col">成交日期</th>
                <th scope="col">经手中介</th>
                <th scope="col">卖家</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = r.attrs as { level?: number; rank?: string; ign?: string };
                return (
                  <tr key={r.id}>
                    <td data-label="会员"><Badge>{a.rank || "无"}</Badge></td>
                    <td data-label="等级">{a.level ?? "-"}</td>
                    <td className="tc-main font-mono font-medium">{a.ign || "-"}</td>
                    {settings.show_sold_price && <td data-label="成交价" className="font-semibold text-white">{formatPrice(r.finalPrice ?? r.price)}</td>}
                    <td data-label="成交日期">{formatDate(r.completedAt ?? r.soldAt)}</td>
                    <td data-label="经手中介">{r.agentName ?? "-"}</td>
                    <td data-label="卖家" className="text-zinc-500">{maskUsername(r.sellerName)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/sold" />
    </div>
  );
}
