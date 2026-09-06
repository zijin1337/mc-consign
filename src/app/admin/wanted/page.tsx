import Link from "next/link";
import { removeWanted, restoreWanted } from "@/actions/wanted";
import { Pagination } from "@/components/pagination";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, tableFlushClass } from "@/components/ui";
import { parsePage } from "@/lib/ids";
import { WANTED_STATUS_CLASS, WANTED_STATUS_LABEL, formatDate, formatDateTime } from "@/lib/labels";
import { listAllWanted } from "@/lib/wanted";
import { formatBudget, wantedDaysLeft, wantedDisplayStatus } from "@/lib/wanted-shared";

export const metadata = { title: "求购管理" };

/** 筛选项顺序：求购中 / 已过期 / 已完成 / 已关闭 / 已下架。expired 是展示状态，listAllWanted 会转成「open 且已到期」 */
const STATUS_OPTIONS = ["open", "expired", "fulfilled", "closed", "removed"] as const;

export default async function AdminWantedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (STATUS_OPTIONS as readonly string[]).includes(sp.status) ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = parsePage(sp.page);
  const filtered = status !== "" || q !== "";

  const { rows, total, pages } = await listAllWanted({ status: status || undefined, q: q || undefined, page });

  return (
    <div>
      <PageHeader
        eyebrow="ADMIN"
        eyebrowDetail="求购管理"
        title="求购管理"
        description={`共 ${total} 条。求购发布即公开、不经审核，违规的在这里下架；下架会通知买家并关闭待回应的推荐，之后可以恢复。`}
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={status} className="w-36" aria-label="状态">
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((k) => (
            <option key={k} value={k}>{WANTED_STATUS_LABEL[k]}</option>
          ))}
        </Select>
        <Input name="q" defaultValue={q} placeholder="编号 / 标题 / 买家" className="w-56" aria-label="搜索" />
        <Button type="submit" variant="secondary">查询</Button>
      </form>

      {rows.length === 0 ? (
        <Empty text={filtered ? "没有符合条件的求购" : "暂无求购"} />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">求购</th>
                <th scope="col">买家</th>
                <th scope="col">推荐数</th>
                <th scope="col">状态</th>
                <th scope="col">到期</th>
                <th scope="col">发布时间</th>
                <th scope="col"><span className="sr-only">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ds = wantedDisplayStatus(r);
                return (
                  <tr key={r.id} data-wanted-id={r.id}>
                    <td className="font-mono text-zinc-500">{r.id}</td>
                    <td>
                      <Link href={`/wanted/${r.id}`} className="link-quiet">{r.title}</Link>
                      <p className="text-xs text-zinc-500">{formatBudget(r.budgetMin, r.budgetMax)}</p>
                    </td>
                    <td><Link href={`/admin/users/${r.buyerId}`} className="link">{r.buyerName}</Link></td>
                    <td className="font-mono">{r.offerCount}</td>
                    <td>
                      <Badge className={WANTED_STATUS_CLASS[ds]}>{WANTED_STATUS_LABEL[ds]}</Badge>
                      {r.status === "removed" && r.adminNote && <p className="mt-1 max-w-48 text-xs text-zinc-500">{r.adminNote}</p>}
                    </td>
                    <td className="whitespace-nowrap text-zinc-500">
                      {formatDate(r.expiresAt)}
                      {ds === "open" && <span className="block text-xs">剩 {wantedDaysLeft(r.expiresAt)} 天</span>}
                    </td>
                    <td className="whitespace-nowrap text-zinc-500">{formatDateTime(r.createdAt)}</td>
                    <td>
                      {r.status === "open" ? (
                        <form action={removeWanted} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <Input name="note" placeholder="下架原因（可选）" maxLength={200} aria-label="下架原因" className="h-9 w-40 px-2" />
                          <SubmitButton size="sm" variant="danger" pendingText="…" confirm="下架后买家会收到通知，待回应的推荐会关闭。确定下架？">
                            下架
                          </SubmitButton>
                        </form>
                      ) : r.status === "removed" ? (
                        <form action={restoreWanted}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton size="sm" variant="secondary" pendingText="…">恢复</SubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/admin/wanted" />
    </div>
  );
}
