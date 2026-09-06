import Link from "next/link";
import { parsePage } from "@/lib/ids";
import { and, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { Pagination } from "@/components/pagination";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { ROLE_LABEL, USER_STATUS_LABEL, formatDate } from "@/lib/labels";

export const metadata = { title: "用户管理" };

const PAGE = 30;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const role = typeof sp.role === "string" ? sp.role : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = parsePage(sp.page);
  const { users } = schema;

  const conds: SQL[] = [];
  if (role === "user" || role === "agent" || role === "admin") conds.push(eq(users.role, role));
  if (status === "active" || status === "banned") conds.push(eq(users.status, status));
  if (q) {
    const like = `%${q}%`;
    const c = or(sql`${users.username} ilike ${like}`, eq(users.qq, q), eq(users.phone, q), ...(/^\d+$/.test(q) ? [eq(users.id, Number(q))] : []));
    if (c) conds.push(c);
  }
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        qq: users.qq,
        role: users.role,
        status: users.status,
        creditScore: users.creditScore,
        dealCount: users.dealCount,
        noShowCount: users.noShowCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="用户管理" title="用户管理" description={`共 ${total} 人`} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="用户名 / QQ / 手机号 / 编号" className="w-56" />
        <Select name="role" defaultValue={role} className="w-32">
          <option value="">全部角色</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} className="w-32">
          <option value="">全部状态</option>
          {Object.entries(USER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">查询</Button>
      </form>
      {rows.length === 0 ? (
        <Empty text="没有符合条件的用户" />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">用户名</th>
                <th scope="col">QQ</th>
                <th scope="col">角色</th>
                <th scope="col">状态</th>
                <th scope="col">信用 / 成交 / 爽约</th>
                <th scope="col">注册</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="text-zinc-600">{u.id}</td>
                  <td><Link href={`/admin/users/${u.id}`} className="link-quiet">{u.username}</Link></td>
                  <td className="font-mono">{u.qq}</td>
                  <td>{u.role === "user" ? ROLE_LABEL.user : <Badge className="bg-white/10 text-white">{ROLE_LABEL[u.role]}</Badge>}</td>
                  <td>{u.status === "banned" ? <Badge className="bg-rose-400/15 text-rose-300">已封禁</Badge> : "正常"}</td>
                  <td>{u.creditScore} / {u.dealCount} / {u.noShowCount}</td>
                  <td className="text-zinc-500">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} params={sp} basePath="/admin/users" />
    </div>
  );
}
