import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray, or } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { offShelfListing, reShelfListing } from "@/actions/listings";
import { toggleEmailNotify } from "@/actions/me";
import { closeWanted, renewWanted } from "@/actions/wanted";
import { StatCardSkeleton, TableSkeleton } from "@/components/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, DescList, Empty, LinkButton, PageHeader, cn, tableFlushClass } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser, type SafeUser } from "@/lib/auth";
import { imageUrl } from "@/lib/image-url";
import { LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, ROLE_LABEL, WANTED_STATUS_CLASS, WANTED_STATUS_LABEL, formatDate, formatPrice } from "@/lib/labels";
import { listMyListings } from "@/lib/listings";
import { maskUsername } from "@/lib/mask";
import { countUnread } from "@/lib/notify";
import { listMyWanted } from "@/lib/wanted";
import { formatBudget, wantedDaysLeft, wantedDisplayStatus } from "@/lib/wanted-shared";

export const metadata = { title: "我的" };

/** 三格概览、商品表、求购表都要查库，放进 Suspense 流式输出；页头和提示先到 */
async function MeBody({ user }: { user: SafeUser }) {
  const [mine, wanted, orderRows] = await Promise.all([
    listMyListings(user.id),
    listMyWanted(user.id),
    db
      .select({ buyerId: schema.orders.buyerId, sellerId: schema.orders.sellerId, listingId: schema.orders.listingId })
      .from(schema.orders)
      .where(
        and(
          inArray(schema.orders.status, ["pending_assign", "pending_contact", "in_progress"]),
          or(eq(schema.orders.buyerId, user.id), eq(schema.orders.sellerId, user.id)),
        ),
      ),
  ]);
  const openBuying = orderRows.filter((r) => r.buyerId === user.id).length;
  const openSelling = orderRows.filter((r) => r.sellerId === user.id).length;
  // 每个账号上排队中的意向单数，下架前提示卖家会关闭几张
  const openByListing = new Map<number, number>();
  for (const r of orderRows) if (r.sellerId === user.id) openByListing.set(r.listingId, (openByListing.get(r.listingId) ?? 0) + 1);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="个人资料">
          <DescList
            items={[
              { label: "用户名", value: `${user.username}（公开显示为 ${maskUsername(user.username)}）` },
              { label: "角色", value: ROLE_LABEL[user.role] },
              { label: "QQ", value: user.qq },
              { label: "手机", value: user.phone },
              { label: "注册时间", value: formatDate(user.createdAt) },
            ]}
          />
          <div className="mt-4 text-sm">
            <Link href="/me/password" className="link">
              修改密码
            </Link>
          </div>
          <form action={toggleEmailNotify} className="mt-3 flex items-center justify-between gap-2 text-sm">
            <label className="flex min-h-6 items-center gap-2">
              <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} />
              重要通知同时发到 QQ 邮箱
            </label>
            <SubmitButton size="sm" variant="secondary" pendingText="保存中…">保存</SubmitButton>
          </form>
        </Card>
        <Card
          title="信用"
          actions={
            <LinkButton href="/me/credit" variant="ghost" size="sm">
              变动记录
              <ArrowRight className="size-3.5" />
            </LinkButton>
          }
        >
          <div className="flex items-end gap-6">
            <div>
              <p className="text-4xl font-bold text-white">{user.creditScore}</p>
              <p className="text-xs text-zinc-500">信用分</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-zinc-100">{user.dealCount}</p>
              <p className="text-xs text-zinc-500">成交次数</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">每完成一笔交易，买卖双方按成交金额每 10 元加 1 分。信用分越高，发布的账号排得越靠前。</p>
        </Card>
        <Card
          title="我的意向单"
          actions={
            <LinkButton href="/orders" variant="ghost" size="sm">
              全部
              <ArrowRight className="size-3.5" />
            </LinkButton>
          }
        >
          <div className="flex items-end gap-6">
            <div>
              <p className="text-4xl font-bold text-white">{openBuying}</p>
              <p className="text-xs text-zinc-500">我买的进行中</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-zinc-100">{openSelling}</p>
              <p className="text-xs text-zinc-500">我卖的进行中</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">中介会通过 QQ 联系你。状态变化会有站内消息{user.notifyEmail ? "，并同时发到 QQ 邮箱" : ""}。</p>
        </Card>
      </div>

      <Card flush={mine.length > 0} title={`我发布的账号（${mine.length}）`}>
        {mine.length === 0 ? (
          <Empty text="还没有发布过账号" />
        ) : (
          <table className={cn(tableFlushClass, "table-cards")}>
            <thead>
              <tr>
                <th scope="col">账号</th>
                <th scope="col">价格</th>
                <th scope="col">状态</th>
                <th scope="col">浏览</th>
                <th scope="col">发布时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((l) => (
                <tr key={l.id}>
                  <td className="tc-main">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-none bg-white/[0.06]">
                        {l.cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl(l.cover)} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div>
                        <Link href={`/listings/${l.id}`} className="link-quiet">{l.title}</Link>
                        {l.status === "rejected" && l.reviewNote && <p className="text-xs text-rose-300">未通过原因：{l.reviewNote}</p>}
                        {l.status === "off_shelf" && l.dirtySinceApproval && <p className="text-xs text-zinc-500">内容已修改，重新上架需审核</p>}
                      </div>
                    </div>
                  </td>
                  <td data-label="价格" className="font-semibold text-white">{formatPrice(l.price)}</td>
                  <td data-label="状态"><Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge></td>
                  <td data-label="浏览">{l.viewCount}</td>
                  <td data-label="发布时间">{formatDate(l.createdAt)}</td>
                  <td className="tc-actions">
                    <div className="flex flex-wrap gap-1.5">
                      {["pending_review", "on_sale", "rejected", "off_shelf"].includes(l.status) && (
                        <LinkButton href={`/sell/${l.id}/edit`} size="sm" variant="secondary">编辑</LinkButton>
                      )}
                      {(l.status === "on_sale" || l.status === "pending_review") && (
                        <form action={offShelfListing}>
                          <input type="hidden" name="id" value={l.id} />
                          <SubmitButton
                            size="sm"
                            variant="ghost"
                            pendingText="下架中…"
                            confirm={
                              (openByListing.get(l.id) ?? 0) > 0
                                ? `下架会关闭 ${openByListing.get(l.id)} 张排队中的意向单并通知买家。确定下架？`
                                : "下架后账号不再展示，随时可以重新上架。确定下架？"
                            }
                          >
                            下架
                          </SubmitButton>
                        </form>
                      )}
                      {l.status === "off_shelf" && (
                        <form action={reShelfListing}>
                          <input type="hidden" name="id" value={l.id} />
                          <SubmitButton size="sm" variant="secondary" pendingText="处理中…">
                            {l.dirtySinceApproval ? "提交审核" : "重新上架"}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        flush={wanted.length > 0}
        title={`我的求购（${wanted.length}）`}
        actions={
          <LinkButton href="/wanted/new" variant="ghost" size="sm">
            发布求购
            <ArrowRight className="size-3.5" />
          </LinkButton>
        }
      >
        {wanted.length === 0 ? (
          <Empty text="还没有发布过求购" />
        ) : (
          <table className={cn(tableFlushClass, "table-cards")}>
            <thead>
              <tr>
                <th scope="col">求购</th>
                <th scope="col">预算</th>
                <th scope="col">推荐数</th>
                <th scope="col">状态</th>
                <th scope="col">到期</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {wanted.map((w) => {
                const display = wantedDisplayStatus(w);
                // 与详情页同一规则：求购中且剩 7 天内（含已到期）可续期
                const renewable = w.status === "open" && wantedDaysLeft(w.expiresAt) <= 7;
                return (
                  <tr key={w.id} data-wanted-id={w.id}>
                    <td className="tc-main">
                      <Link href={`/wanted/${w.id}`} className="link-quiet">{w.title}</Link>
                      {w.status === "removed" && w.adminNote && <p className="text-xs text-rose-300">下架原因：{w.adminNote}</p>}
                    </td>
                    <td data-label="预算" className="font-semibold text-white">{formatBudget(w.budgetMin, w.budgetMax)}</td>
                    <td data-label="推荐数">{w.offerCount}</td>
                    <td data-label="状态"><Badge className={WANTED_STATUS_CLASS[display]}>{WANTED_STATUS_LABEL[display]}</Badge></td>
                    <td data-label="到期">{formatDate(w.expiresAt)}</td>
                    <td className="tc-actions">
                      <div className="flex flex-wrap gap-1.5">
                        <LinkButton href={`/wanted/${w.id}`} size="sm" variant="secondary">查看</LinkButton>
                        {renewable && (
                          <form action={renewWanted}>
                            <input type="hidden" name="id" value={w.id} />
                            <SubmitButton size="sm" variant="secondary" pendingText="续期中…">续期</SubmitButton>
                          </form>
                        )}
                        {w.status === "open" && (
                          <form action={closeWanted}>
                            <input type="hidden" name="id" value={w.id} />
                            <SubmitButton size="sm" variant="ghost" pendingText="关闭中…" confirm="关闭后卖家和中介不能再推荐，待回应的推荐会一并关闭。确定关闭？">
                              关闭
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

export default async function MePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/me");
  const unread = await countUnread(user.id);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ME"
        title="我的"
        actions={
          <>
            <LinkButton href="/me/notifications" variant="secondary">
              消息{unread > 0 && <Badge className="bg-rose-400 text-on-rose">{unread}</Badge>}
            </LinkButton>
            <LinkButton href="/wanted/new" variant="secondary">
              发布求购
            </LinkButton>
            <LinkButton href="/sell/new">发布账号</LinkButton>
          </>
        }
      />
      {sp.submitted && <Alert kind="success">账号已提交，等待审核。结果会通知你。</Alert>}
      {sp.updated && <Alert kind="success">修改已保存。</Alert>}
      {typeof sp.error === "string" && sp.error && <Alert kind="warn">{sp.error.slice(0, 200)}</Alert>}
      {sp.password && <Alert kind="success">密码已修改，其他设备已退出登录。</Alert>}

      <Suspense
        fallback={
          <div data-skeleton="me" aria-busy="true" aria-label="加载中" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
            <TableSkeleton rows={3} flush />
            <TableSkeleton rows={2} flush />
          </div>
        }
      >
        <MeBody user={user} />
      </Suspense>
    </div>
  );
}
