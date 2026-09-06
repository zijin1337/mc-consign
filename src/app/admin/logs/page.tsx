import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { parsePage } from "@/lib/ids";
import { Pagination } from "@/components/pagination";
import { Button, Card, Empty, Input, PageHeader, Select, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { formatDateTime } from "@/lib/labels";

export const metadata = { title: "操作日志" };

const PAGE = 50;
const ACTIONS = [
  "view_contact", "review_approve", "review_reject", "edit_listing", "delete_listing", "restore_listing", "force_off_shelf",
  "set_weight", "set_pinned", "assign_order", "cancel_order", "ban_user", "unban_user", "set_role", "edit_agent",
  "credit_adjust", "username_change", "setting_change", "banned_word_add", "banned_word_remove", "risk_flag", "wanted_remove", "wanted_restore",
];

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const operator = typeof sp.operator === "string" ? sp.operator.trim() : "";
  const page = parsePage(sp.page);
  const { auditLogs, users } = schema;

  const conds: SQL[] = [];
  if (action) conds.push(eq(auditLogs.action, action));
  if (operator) conds.push(eq(users.username, operator));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        operator: users.username,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.operatorId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(auditLogs).innerJoin(users, eq(auditLogs.operatorId, users.id)).where(where),
  ]);

  const short = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  };

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="操作日志" title="操作日志" description={`共 ${total} 条，只追加不可改`} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="action" defaultValue={action} className="w-48">
          <option value="">全部动作</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Input name="operator" defaultValue={operator} placeholder="操作人用户名" className="w-40" />
        <Button type="submit" variant="secondary">筛选</Button>
      </form>
      {rows.length === 0 ? (
        <Empty text="暂无日志" />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">操作人</th>
                <th scope="col">动作</th>
                <th scope="col">对象</th>
                <th scope="col">变更前</th>
                <th scope="col">变更后</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-zinc-500">{formatDateTime(l.createdAt)}</td>
                  <td>{l.operator}</td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td className="whitespace-nowrap text-zinc-500">{l.targetType} #{l.targetId ?? "-"}</td>
                  <td className="max-w-xs break-all font-mono text-xs text-zinc-500">{short(l.before)}</td>
                  <td className="max-w-xs break-all font-mono text-xs text-zinc-300">{short(l.after)}</td>
                  <td className="font-mono text-xs text-zinc-600">{l.ip ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} params={sp} basePath="/admin/logs" />
    </div>
  );
}
