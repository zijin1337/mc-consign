import { desc, eq } from "drizzle-orm";
import { Card, Empty, LinkButton, PageHeader, cn, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";

export const metadata = { title: "信用分记录" };

const REASON_LABEL = { deal: "成交", manual: "平台调整", aftersale: "售后判定", no_show: "爽约", ban: "封禁" } as const;

export default async function CreditPage() {
  const user = await requireUser("/me/credit");
  const logs = await db
    .select()
    .from(schema.creditLogs)
    .where(eq(schema.creditLogs.userId, user.id))
    .orderBy(desc(schema.creditLogs.createdAt))
    .limit(200);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="ME" eyebrowDetail="信用分" title="信用分记录" description={`当前信用分 ${user.creditScore}`} actions={<LinkButton href="/me" variant="secondary">返回</LinkButton>} />
      {logs.length === 0 ? (
        <Empty text="还没有信用分变动" />
      ) : (
        <Card flush>
          <table className={cn(tableFlushClass, "table-cards")}>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">变动</th>
                <th scope="col">变动后</th>
                <th scope="col">类型</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td data-label="时间" className="whitespace-nowrap text-zinc-500">{formatDateTime(l.createdAt)}</td>
                  <td data-label="变动" className={l.delta >= 0 ? "font-semibold text-white" : "font-semibold text-rose-300"}>
                    {l.delta >= 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td data-label="变动后">{l.balanceAfter}</td>
                  <td data-label="类型">{REASON_LABEL[l.reasonType]}</td>
                  <td className="tc-main">{l.reasonText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
