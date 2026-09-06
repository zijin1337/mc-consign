import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { closeWanted, declineOffer, renewWanted, withdrawOffer } from "@/actions/wanted";
import { AccountFace } from "@/components/listing-cover";
import { OfferForm } from "@/components/offer-form";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Price } from "@/components/price";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, DescList, Empty, Eyebrow, LinkButton } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { idDetail } from "@/lib/eyebrow";
import { parseId } from "@/lib/ids";
import { WANTED_OFFER_STATUS_CLASS, WANTED_OFFER_STATUS_LABEL, WANTED_STATUS_CLASS, WANTED_STATUS_LABEL, formatDate, formatPrice } from "@/lib/labels";
import { maskUsername } from "@/lib/mask";
import { getSettings } from "@/lib/settings";
import { getWantedDetail, listOfferableListings, listOffersForRequest, type WantedOfferRow } from "@/lib/wanted";
import { formatBudget, isOfferActionable, isWantedActive, wantedDaysLeft, wantedDisplayStatus } from "@/lib/wanted-shared";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<PageProps, "params">) {
  const id = parseId((await params).id);
  const r = id ? await getWantedDetail(id) : null;
  return { title: r ? `求购 ${idDetail(r.id, 4)} · ${r.title}` : "求购详情" };
}

/**
 * 求购详情。需登录；已下架的只有买家本人与工作人员能回看。
 * 所有数据都决定 404 / 可见性，不放 Suspense（也不能给这一段加 loading.tsx，否则 404 变 200）。
 */
export default async function WantedDetailPage({ params, searchParams }: PageProps) {
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();
  const user = await requireUser(`/wanted/${id}`);
  const [r, sp, settings] = await Promise.all([getWantedDetail(id), searchParams, getSettings()]);
  if (!r) notFound();

  const isBuyer = r.buyerId === user.id;
  const isStaff = user.role === "admin" || user.role === "agent";
  if (r.status === "removed" && !isBuyer && !isStaff) notFound();

  // 浏览量在响应发出后再写，买家自己和工作人员不计
  if (!isBuyer && !isStaff) {
    after(async () => {
      await db
        .update(schema.wantedRequests)
        .set({ viewCount: sql`${schema.wantedRequests.viewCount} + 1` })
        .where(eq(schema.wantedRequests.id, id))
        .catch(() => {});
    });
  }

  const display = wantedDisplayStatus(r);
  const active = isWantedActive(r);
  const daysLeft = wantedDaysLeft(r.expiresAt);
  const canOffer = active && !isBuyer;
  const [allOffers, offerable] = await Promise.all([listOffersForRequest(id), canOffer ? listOfferableListings(user, id, r.buyerId) : Promise.resolve([])]);
  // 推荐列表：买家与工作人员看全部；其他登录用户只看到自己推荐的 / 自己账号的那几条
  const seesAll = isBuyer || isStaff;
  const offers = seesAll ? allOffers : allOffers.filter((o) => o.offeredBy === user.id || o.sellerId === user.id);
  const order = seesAll ? r.linkedOrder : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Eyebrow section="WANTED" detail={idDetail(r.id, 4)} />
            <Badge className={WANTED_STATUS_CLASS[display]}>{WANTED_STATUS_LABEL[display]}</Badge>
            <span className="font-mono text-xs text-zinc-500">
              发布 {formatDate(r.createdAt)} · 到期 {formatDate(r.expiresAt)}
              {active ? ` · 剩 ${daysLeft} 天` : ""} · 浏览 {r.viewCount}
            </span>
          </div>
          <h1 className="font-mono text-2xl font-black leading-snug tracking-tight text-white sm:text-3xl">{r.title}</h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Price value={r.budgetMax} size="lg" />
            <span className="text-sm text-zinc-400">{r.budgetMin ? `预算区间 ${formatBudget(r.budgetMin, r.budgetMax)}` : "预算上限"}</span>
          </div>
        </div>

        {sp.created && <Alert kind="success">求购已发布，卖家和中介推荐账号后会通知你。</Alert>}
        {sp.updated && <Alert kind="success">修改已保存。</Alert>}
        {r.status === "removed" && (
          <Alert kind="warn">
            这张求购已被平台下架{r.adminNote ? `：${r.adminNote}` : ""}。{isBuyer ? "只有你和工作人员能看到。有异议请联系平台。" : "只有买家本人和工作人员能看到。"}
          </Alert>
        )}
        {display === "expired" && (isBuyer ? <Alert kind="warn">求购已到期，不再公开展示，也不能再收到推荐。续期后会重新出现在大厅。</Alert> : <Alert kind="info">这张求购已到期，不能再推荐账号。</Alert>)}
        {r.status === "closed" && <Alert kind="info">买家已关闭这张求购，不能再推荐账号。</Alert>}
        {order &&
          (r.status === "fulfilled" ? (
            <Alert kind="info">
              已通过意向单{" "}
              <Link className="link" href={`/orders/${order.id}`}>
                #{order.id}
              </Link>{" "}
              成交。
            </Alert>
          ) : (
            <Alert kind="info">
              {isBuyer ? "你已据此求购提交意向单" : "买家已据此求购提交意向单"}{" "}
              <Link className="link" href={`/orders/${order.id}`}>
                #{order.id}
              </Link>
              {isBuyer ? "，中介会通过 QQ 联系你。" : "。"}
            </Alert>
          ))}

        <Card title="求购条件">
          <DescList
            items={[
              { label: "会员类型", value: r.ranks.length ? r.ranks.join(" / ") : "不限" },
              { label: "最低等级", value: r.minLevel ? `Hypixel ${r.minLevel} 级以上` : "不限" },
              { label: "披风", value: r.capes.length ? r.capes.join(" / ") : "不限" },
              { label: "预算", value: <span className="font-semibold text-white">{formatBudget(r.budgetMin, r.budgetMax)}</span> },
              { label: "指定中介", value: r.preferredAgent ? r.preferredAgent.username : "未指定，下单时再选或由平台分派" },
              { label: "有效期至", value: formatDate(r.expiresAt) },
            ]}
          />
        </Card>

        <Card title="其他要求">
          {r.requirements ? <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{r.requirements}</p> : <p className="text-sm text-zinc-500">买家没有补充。</p>}
        </Card>

        <Card title={`收到的推荐（${seesAll ? allOffers.length : r.offerCount}）`}>
          <div data-testid="offers">
            {offers.length === 0 ? (
              seesAll ? (
                <Empty text={isBuyer && active ? "还没有收到推荐。卖家和中介看到你的求购后，会把合适的账号推荐给你。" : "还没有人推荐账号"} />
              ) : (
                <p className="text-sm leading-6 text-zinc-400">
                  这张求购已收到 {r.offerCount} 条有效推荐。{active ? "你也可以把自己的账号推荐给买家。" : ""}
                </p>
              )
            ) : (
              <ul className="divide-y divide-white/[0.08]">
                {offers.map((o) => (
                  <OfferItem key={o.id} o={o} requestId={id} isBuyer={isBuyer} userId={user.id} />
                ))}
              </ul>
            )}
            {!seesAll && offers.length > 0 && <p className="mt-4 text-xs text-zinc-500">这里只显示你的推荐；这张求购共收到 {r.offerCount} 条有效推荐。</p>}
          </div>
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        {isBuyer && r.status === "open" && (
          <Card title="管理求购">
            <div className="flex flex-col gap-2">
              <LinkButton href={`/wanted/${id}/edit`} variant="secondary" className="w-full">
                编辑
              </LinkButton>
              {(!active || daysLeft <= 7) && (
                <form action={renewWanted}>
                  <input type="hidden" name="id" value={id} />
                  <SubmitButton variant="secondary" className="w-full" pendingText="续期中…">
                    续期 {settings.wanted_default_days} 天
                  </SubmitButton>
                </form>
              )}
              <form action={closeWanted}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton variant="ghost" className="w-full" confirm="关闭后卖家和中介不能再推荐，待回应的推荐会一并关闭。确定关闭？" pendingText="关闭中…">
                  关闭求购
                </SubmitButton>
              </form>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {active ? `到期 ${formatDate(r.expiresAt)}，剩 ${daysLeft} 天；剩 7 天内可续期，有效期从续期当天重新计算。` : "已到期，续期后重新公开。"}编辑不改变有效期。
            </p>
          </Card>
        )}

        <Card title="买家">
          <div className="mb-4 flex items-center gap-3 border-b border-white/[0.08] pb-4">
            <PixelAvatar seed={r.buyer.username} size={40} />
            <div>
              <p className="font-mono text-base font-bold text-white">{maskUsername(r.buyer.username)}</p>
              <p className="text-xs text-zinc-500">{isBuyer ? "这是你发布的求购" : "用户名已打码，交易时由中介核对身份"}</p>
            </div>
          </div>
          <DescList
            items={[
              {
                label: "信用分",
                value: (
                  <span className="flex items-center gap-1.5 font-mono font-bold text-white">
                    <ShieldCheck className="size-4 text-zinc-300" aria-hidden="true" />
                    {r.buyer.creditScore}
                  </span>
                ),
              },
              { label: "成交次数", value: r.buyer.dealCount },
            ]}
          />
        </Card>

        {canOffer && (
          <Card title="推荐账号给买家">
            <OfferForm requestId={id} listings={offerable.map((l) => ({ id: l.id, title: l.title, price: l.price }))} isStaff={isStaff} />
            <p className="mt-3 text-xs leading-5 text-zinc-500">买家采纳后进入意向单流程，中介会通过 QQ 联系双方。网站不收款。</p>
          </Card>
        )}
      </div>
    </div>
  );
}

/** 一条推荐：账号头像 + 标题 + 价格 + 状态；买家能去下单 / 谢绝，推荐人或卖家能撤回。`li[data-offer-id]` 是 e2e 契约 */
function OfferItem({ o, requestId, isBuyer, userId }: { o: WantedOfferRow; requestId: number; isBuyer: boolean; userId: number }) {
  const buyable = o.listingStatus === "on_sale" || o.listingStatus === "in_trade";
  const actionable = isOfferActionable(o);
  const canWithdraw = !isBuyer && o.status === "pending" && (o.offeredBy === userId || o.sellerId === userId);
  const bySeller = o.offeredBy === o.sellerId;

  return (
    <li data-offer-id={o.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        {o.listingMcUuid ? <AccountFace uuid={o.listingMcUuid} /> : <span className="size-8 shrink-0 border border-white/10 bg-white/[0.04]" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/listings/${o.listingId}`} className="link-quiet">
              {o.listingTitle}
            </Link>
            <span className="font-semibold text-white">{formatPrice(o.listingPrice)}</span>
            <Badge className={WANTED_OFFER_STATUS_CLASS[o.status]}>{WANTED_OFFER_STATUS_LABEL[o.status]}</Badge>
            {!buyable && <Badge>账号已不在售</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {bySeller ? `卖家 ${maskUsername(o.sellerName)}` : `中介 ${o.offererName} · 卖家 ${maskUsername(o.sellerName)}`} · 卖家信用 {o.sellerCredit} · {formatDate(o.createdAt)}
          </p>
          {o.message && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{o.message}</p>}
        </div>
      </div>
      {((isBuyer && actionable) || canWithdraw) && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {isBuyer && actionable && (
            <>
              <LinkButton href={`/listings/${o.listingId}/buy?wanted=${requestId}`} size="sm">
                去下单
              </LinkButton>
              <form action={declineOffer}>
                <input type="hidden" name="id" value={o.id} />
                <SubmitButton size="sm" variant="ghost" confirm="谢绝后这个账号不能再推荐给你。确定谢绝？" pendingText="谢绝中…">
                  谢绝
                </SubmitButton>
              </form>
            </>
          )}
          {canWithdraw && (
            <form action={withdrawOffer}>
              <input type="hidden" name="id" value={o.id} />
              <SubmitButton size="sm" variant="ghost" confirm="撤回后还可以再次推荐这个账号。确定撤回？" pendingText="撤回中…">
                撤回
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
