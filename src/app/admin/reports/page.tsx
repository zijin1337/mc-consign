import { Download } from "lucide-react";
import { Button, Card, Empty, Input, PageHeader, buttonClass, tableFlushClass } from "@/components/ui";
import { formatPrice } from "@/lib/labels";
import { agentMonthlyReport, currentMonth } from "@/lib/orders";

export const metadata = { title: "中介报表" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const rows = await agentMonthlyReport(month);
  const total = rows.reduce((acc, r) => ({ deals: acc.deals + r.deals, gmv: acc.gmv + r.gmv, feeCalculated: acc.feeCalculated + r.feeCalculated, feeActual: acc.feeActual + r.feeActual }), { deals: 0, gmv: 0, feeCalculated: 0, feeActual: 0 });

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="中介报表" title="中介报表" description="按完成时间统计每位中介当月成交。网站不收款，中介费分成按此表线下结算。" />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="month" type="month" defaultValue={month} className="w-44" />
        <Button type="submit" variant="secondary">查看</Button>
        {/* 下载附件走原生 <a>（route 返回 CSV），样式与旁边的 secondary 按钮同一套 */}
        <a href={`/admin/reports/export?month=${month}`} className={buttonClass("secondary")}>
          <Download className="size-4" aria-hidden="true" />
          导出本月明细 CSV
        </a>
      </form>
      {rows.length === 0 ? (
        <Empty text={`${month} 没有完成的交易`} />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">中介</th>
                <th scope="col">成交笔数</th>
                <th scope="col">成交金额合计</th>
                <th scope="col">系统计算中介费</th>
                <th scope="col">实收中介费</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agentId ?? "none"}>
                  <td className="font-medium text-white">{r.agentName ?? "未记录中介"}</td>
                  <td>{r.deals}</td>
                  <td>{formatPrice(r.gmv)}</td>
                  <td>{formatPrice(r.feeCalculated)}</td>
                  <td className="font-semibold text-white">{formatPrice(r.feeActual)}</td>
                </tr>
              ))}
              <tr className="font-semibold text-white">
                <td>合计</td>
                <td>{total.deals}</td>
                <td>{formatPrice(total.gmv)}</td>
                <td>{formatPrice(total.feeCalculated)}</td>
                <td>{formatPrice(total.feeActual)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
