import { getCurrentUser } from "@/lib/auth";
import { FEE_MODE_LABEL, formatDateTime } from "@/lib/labels";
import { completedOrdersInMonth, currentMonth } from "@/lib/orders";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 中介月报表明细，CSV 带 BOM 方便 Excel 直接打开 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();
  const rows = await completedOrdersInMonth(month);

  const header = ["单号", "完成时间", "账号", "标价", "中介费方式", "成交金额", "系统中介费", "实收中介费", "差异原因", "买家", "卖家", "中介"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, formatDateTime(r.completedAt), r.title, r.listingPrice, FEE_MODE_LABEL[r.feeMode], r.finalPrice, r.feeCalculated, r.feeActual, r.feeOverrideReason, r.buyerName, r.sellerName, r.agentName]
        .map(csvCell)
        .join(","),
    );
  }
  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agent-report-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
