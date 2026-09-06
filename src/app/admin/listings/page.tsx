import Link from "next/link";
import { parsePage } from "@/lib/ids";
import { and, count, desc, eq, gt, or, sql, type SQL } from "drizzle-orm";
import { deleteListing, forceOffShelf, pinListing, restoreListing, setListingWeight, unpinListing } from "@/actions/admin";
import { Pagination } from "@/components/pagination";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, formatDate, formatDateTime, formatPrice } from "@/lib/labels";
import { PIN_PRESET_DAYS, isPinActive } from "@/lib/pin";

export const metadata = { title: "商品管理" };

const PAGE = 30;

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const pinnedOnly = sp.pinned === "1";
  const page = parsePage(sp.page);
  const { listings, users } = schema;

  const conds: SQL[] = [];
  if (status && status in LISTING_STATUS_LABEL) conds.push(eq(listings.status, status as keyof typeof LISTING_STATUS_LABEL));
  else if (!status) conds.push(sql`${listings.status} <> 'deleted'`);
  if (q) {
    const like = `%${q}%`;
    const c = /^\d+$/.test(q)
      ? or(eq(listings.id, Number(q)), sql`${listings.title} ilike ${like}`, sql`${users.username} ilike ${like}`)
      : or(sql`${listings.title} ilike ${like}`, sql`${users.username} ilike ${like}`, sql`${listings.attrs}->>'ign' ilike ${like}`);
    if (c) conds.push(c);
  }
  if (pinnedOnly) conds.push(gt(listings.pinnedUntil, sql`now()`));
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: listings.id,
        title: listings.title,
        price: listings.price,
        status: listings.status,
        weight: listings.weight,
        pinnedUntil: listings.pinnedUntil,
        createdAt: listings.createdAt,
        viewCount: listings.viewCount,
        seller: users.username,
        sellerId: users.id,
      })
      .from(listings)
      .innerJoin(users, eq(listings.sellerId, users.id))
      .where(where)
      .orderBy(desc(listings.createdAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE),
    db.select({ total: count() }).from(listings).innerJoin(users, eq(listings.sellerId, users.id)).where(where),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="商品管理" title="商品管理" description={`共 ${total} 条。权重、置顶、强制下架与删除在这里操作，审核在审核队列。`} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={status} className="w-40">
          <option value="">全部（不含已删除）</option>
          {Object.entries(LISTING_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Input name="q" defaultValue={q} placeholder="编号 / 标题 / 正版 ID / 卖家" className="w-64" />
        <label className="flex h-11 cursor-pointer items-center gap-2 border border-white/10 bg-field px-3 text-sm text-zinc-300 has-[:checked]:border-lime-300/60 has-[:checked]:bg-lime-300/[0.08] has-[:checked]:text-white">
          <input type="checkbox" name="pinned" value="1" defaultChecked={pinnedOnly} />
          只看置顶中
        </label>
        <Button type="submit" variant="secondary">查询</Button>
      </form>

      {rows.length === 0 ? (
        <Empty text="没有符合条件的账号" />
      ) : (
        <Card flush>
          <table className={tableFlushClass}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">账号</th>
                <th scope="col">卖家</th>
                <th scope="col">价格</th>
                <th scope="col">状态</th>
                <th scope="col">权重</th>
                <th scope="col">置顶</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-zinc-600">{r.id}</td>
                  <td>
                    <Link href={`/admin/listings/${r.id}`} className="link-quiet">{r.title}</Link>
                    <p className="text-xs text-zinc-500">{formatDate(r.createdAt)} · 浏览 {r.viewCount}</p>
                  </td>
                  <td><Link href={`/admin/users/${r.sellerId}`} className="link">{r.seller}</Link></td>
                  <td className="font-semibold text-white">{formatPrice(r.price)}</td>
                  <td><Badge className={LISTING_STATUS_CLASS[r.status]}>{LISTING_STATUS_LABEL[r.status]}</Badge></td>
                  <td>
                    <form action={setListingWeight} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="weight" type="number" defaultValue={r.weight} className="h-9 w-20 px-2" />
                      <SubmitButton size="sm" variant="secondary" pendingText="…">存</SubmitButton>
                    </form>
                  </td>
                  <td>
                    {r.status === "sold" || r.status === "deleted" ? (
                      <span className="text-xs text-zinc-600">-</span>
                    ) : (
                      <div className="space-y-1.5">
                        {isPinActive(r.pinnedUntil) && <p className="whitespace-nowrap text-xs text-amber-300">置顶至 {formatDateTime(r.pinnedUntil)}</p>}
                        <div className="flex items-center gap-1.5">
                          <form action={pinListing} className="flex items-center gap-1.5">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="unit" value="days" />
                            <Select name="amount" defaultValue="7" className="h-9 w-20 px-2">
                              {PIN_PRESET_DAYS.map((d) => (
                                <option key={d} value={d}>
                                  {d} 天
                                </option>
                              ))}
                            </Select>
                            <SubmitButton size="sm" variant="secondary" pendingText="…">{isPinActive(r.pinnedUntil) ? "延长" : "置顶"}</SubmitButton>
                          </form>
                          {isPinActive(r.pinnedUntil) && (
                            <form action={unpinListing}>
                              <input type="hidden" name="id" value={r.id} />
                              <SubmitButton size="sm" variant="ghost" pendingText="…">取消置顶</SubmitButton>
                            </form>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <LinkButton href={`/admin/listings/${r.id}`} variant="secondary" size="sm">编辑</LinkButton>
                      {["on_sale", "pending_review", "rejected"].includes(r.status) && (
                        <form action={forceOffShelf}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton size="sm" variant="ghost" pendingText="…" confirm={`下架会关闭排队中的意向单并通知买家，卖家修改后重新审核才能上架。确定强制下架「${r.title}」？`}>
                            下架
                          </SubmitButton>
                        </form>
                      )}
                      {r.status === "deleted" ? (
                        <form action={restoreListing}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton size="sm" variant="secondary" pendingText="…">恢复</SubmitButton>
                        </form>
                      ) : r.status !== "in_trade" && r.status !== "sold" ? (
                        <form action={deleteListing}>
                          <input type="hidden" name="id" value={r.id} />
                          <SubmitButton size="sm" variant="danger" pendingText="…" confirm={`删除后前台不再显示，排队中的意向单会关闭并通知买家；之后可在「已删除」筛选里恢复。确定删除「${r.title}」？`}>
                            删除
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination page={page} pages={pages} params={sp} basePath="/admin/listings" />
    </div>
  );
}
