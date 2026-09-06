import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { reviewListing } from "@/actions/admin";
import { ListingCover } from "@/components/listing-cover";
import { Price } from "@/components/price";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, Empty, PageHeader, Textarea, cn, focusRing } from "@/components/ui";
import { VerifiedTag } from "@/components/verified-tag";
import { db, schema } from "@/db";
import { compareSnapshot } from "@/lib/hypixel/compare";
import { FEE_MODE_LABEL, RANK_ACCENT, SOURCE_LABEL, formatDateTime } from "@/lib/labels";

export const metadata = { title: "审核队列" };

export default async function ReviewPage() {
  const { listings, users } = schema;
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      mcUuid: listings.mcUuid,
      price: listings.price,
      feeMode: listings.feeMode,
      source: listings.source,
      hasTransactionId: listings.hasTransactionId,
      note: listings.note,
      contact: listings.contact,
      attrs: listings.attrs,
      apiSnapshot: listings.apiSnapshot,
      updatedAt: listings.updatedAt,
      approvedAt: listings.approvedAt,
      seller: users.username,
      sellerId: users.id,
      credit: users.creditScore,
      cover: sql<string | null>`(select li.path from listing_images li where li.listing_id = ${listings}.id order by li.sort_order asc limit 1)`,
      imageCount: sql<number>`(select count(*)::int from listing_images li where li.listing_id = ${listings}.id)`,
    })
    .from(listings)
    .innerJoin(users, eq(listings.sellerId, users.id))
    .where(eq(listings.status, "pending_review"))
    .orderBy(asc(listings.updatedAt));

  return (
    <div>
      <PageHeader eyebrow="ADMIN" eyebrowDetail="审核队列" title="审核队列" description={`${rows.length} 个待审核，按提交时间排序`} />
      {rows.length === 0 ? (
        <Empty text="暂无待审核的账号" />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const a = r.attrs as Record<string, unknown>;
            const cmp = compareSnapshot(a, r.apiSnapshot);
            // 封面配色与前台卡片同一套：按卖家填的会员取色，没填按「无」走 rose
            const accent = RANK_ACCENT[typeof a.rank === "string" ? a.rank : "无"] ?? "rose";
            return (
              <Card key={r.id}>
                <div className="grid gap-4 md:grid-cols-[200px_1fr_260px]">
                  {/* 没截图时退回像素头像（有正版 uuid）或会员色几何底纹，审核员能一眼对上账号 */}
                  <Link href={`/listings/${r.id}`} className={cn("block", focusRing)}>
                    <ListingCover cover={r.cover} mcUuid={r.mcUuid} accent={accent} className="aspect-[16/10] min-h-0 border-b-0" />
                  </Link>
                  <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/listings/${r.id}`} className="link-quiet text-base font-semibold">{r.title}</Link>
                      {r.approvedAt && <Badge className="bg-cyan-300/15 text-cyan-300">修改重审</Badge>}
                      {cmp.status === "match" && <VerifiedTag />}
                      <span className="text-zinc-600">#{r.id}</span>
                    </div>
                    <p className="mt-1 flex items-baseline gap-2">
                      <Price value={r.price} size="sm" />
                      <span className="text-xs text-zinc-500">{FEE_MODE_LABEL[r.feeMode]}</span>
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-300">
                      <dt className="text-zinc-500">卖家</dt>
                      <dd>
                        <Link href={`/admin/users/${r.sellerId}`} className="link">{r.seller}</Link> · 信用 {r.credit}
                      </dd>
                      <dt className="text-zinc-500">来源 / 交易 ID</dt>
                      <dd>{SOURCE_LABEL[r.source]} / {r.hasTransactionId ? "能提供" : "不能提供"}</dd>
                      <dt className="text-zinc-500">披风 / 换绑 / 封禁</dt>
                      <dd>
                        {Array.isArray(a.capes) && a.capes.length ? (a.capes as string[]).join("、") : "无"} / {a.canRebindEmail ? "能" : "不能"} /{" "}
                        {a.hasBanRecord ? `有${a.banNote ? `（${a.banNote}）` : ""}` : "无"}
                      </dd>
                      <dt className="text-zinc-500">官方数据核对</dt>
                      {/* 一致 / 不一致除颜色外各带一个字形前缀：绿色弱视下 lime 与 amber 几乎同色，靠 ✓ / ! 区分 */}
                      <dd className={cmp.status === "mismatch" ? "font-semibold text-amber-300" : cmp.status === "match" ? "text-lime-300" : "text-zinc-500"}>
                        {cmp.status === "match" ? "✓ " : cmp.status === "mismatch" ? "! " : ""}
                        {cmp.text}
                      </dd>
                      <dt className="text-zinc-500">联系方式</dt>
                      <dd className="font-mono">{r.contact}</dd>
                      <dt className="text-zinc-500">截图 / 提交时间</dt>
                      <dd>{r.imageCount} 张 / {formatDateTime(r.updatedAt)}</dd>
                    </dl>
                    {r.note && <p className="mt-2 rounded-none bg-white/[0.03] p-2 text-zinc-300">说明：{r.note}</p>}
                  </div>
                  <form action={reviewListing} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Textarea name="note" placeholder="拒绝时必填原因，卖家可见" className="min-h-20" />
                    <div className="flex gap-2">
                      <SubmitButton name="decision" value="approve" className="flex-1" pendingText="处理中…">
                        通过
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" variant="danger" className="flex-1" pendingText="处理中…" requireField="note" requireMessage="拒绝时必须填写原因，卖家会看到这段话">
                        拒绝
                      </SubmitButton>
                    </div>
                    <Link href={`/admin/listings/${r.id}`} className="link text-center text-xs">先编辑再审</Link>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
