import Link from "next/link";
import { parseId } from "@/lib/ids";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { adminUpdateListing, deleteListing, forceOffShelf, pinListing, restoreListing, setListingWeight, unpinListing } from "@/actions/admin";
import { ListingForm } from "@/components/listing-form";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, DescList, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { idDetail } from "@/lib/eyebrow";
import { LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { hypixelConfigured } from "@/lib/hypixel/client";
import { getMcGame, listAgents } from "@/lib/listings";
import { formatRemaining, isPinActive } from "@/lib/pin";

export const metadata = { title: "编辑账号" };

export default async function AdminListingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["admin"], "/admin");
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();

  const l = await db.query.listings.findFirst({
    where: eq(schema.listings.id, id),
    with: {
      seller: { columns: { id: true, username: true, qq: true, phone: true, creditScore: true, dealCount: true, status: true } },
      images: { orderBy: (img) => [asc(img.sortOrder)] },
    },
  });
  if (!l) notFound();
  const [game, agents] = await Promise.all([getMcGame(), listAgents()]);
  // 编辑页会显示卖家联系方式，每次打开留痕
  await audit(me.id, "view_contact", "listing", id);
  const pinActive = isPinActive(l.pinnedUntil);
  const canPin = l.status !== "sold" && l.status !== "deleted";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ADMIN"
        eyebrowDetail={`账号 ${idDetail(l.id, 4)}`}
        title={`账号 #${l.id}`}
        description={
          <span className="flex items-center gap-2">
            <Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge>
            {l.title}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/listings/${l.id}`} variant="secondary">前台预览</LinkButton>
            <LinkButton href="/admin/listings" variant="secondary">返回列表</LinkButton>
          </>
        }
      />
      {l.reviewNote && l.status === "rejected" && <Alert kind="error">拒绝原因：{l.reviewNote}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="卖家（联系方式已记录本次查看）">
          <DescList
            items={[
              { label: "用户名", value: <Link href={`/admin/users/${l.seller.id}`} className="link">{l.seller.username}</Link> },
              { label: "QQ / 手机", value: <span className="font-mono">{l.seller.qq} / {l.seller.phone}</span> },
              { label: "信用分 / 成交", value: `${l.seller.creditScore} / ${l.seller.dealCount}` },
              { label: "上架填写的联系方式", value: <span className="font-mono">{l.contact}</span> },
              { label: "提交 / 最后修改", value: `${formatDateTime(l.createdAt)} / ${formatDateTime(l.updatedAt)}` },
              { label: "审核", value: l.reviewedAt ? `${formatDateTime(l.reviewedAt)}` : "未审核" },
            ]}
          />
        </Card>
        <Card title="排序与置顶">
          <form action={setListingWeight} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={l.id} />
            <label className="text-sm">
              <span className="mb-1 block text-zinc-400">手动权重（越大越靠前）</span>
              <Input name="weight" type="number" defaultValue={l.weight} className="w-32" />
            </label>
            <SubmitButton variant="secondary" pendingText="保存中…">保存权重</SubmitButton>
          </form>
          <div className="mt-4 border-t border-white/[0.08] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">置顶栏</p>
              {pinActive ? (
                <span className="text-xs text-amber-300">
                  置顶中 · 至 {formatDateTime(l.pinnedUntil)} · 剩余 {formatRemaining(l.pinnedUntil)}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">未置顶</span>
              )}
            </div>
            {canPin ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <form action={pinListing} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <label className="text-sm">
                    <span className="mb-1 block text-zinc-400">{pinActive ? "延长时长" : "置顶时长"}</span>
                    <Input name="amount" type="number" min={1} defaultValue={7} className="w-24" />
                  </label>
                  <Select name="unit" defaultValue="days" className="w-24">
                    <option value="days">天</option>
                    <option value="hours">小时</option>
                  </Select>
                  <SubmitButton variant="secondary" pendingText="处理中…">{pinActive ? "延长置顶" : "置顶"}</SubmitButton>
                </form>
                {pinActive && (
                  <form action={unpinListing}>
                    <input type="hidden" name="id" value={l.id} />
                    <SubmitButton variant="ghost" pendingText="处理中…">取消置顶</SubmitButton>
                  </form>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">已成交或已删除的账号不能置顶。</p>
            )}
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              置顶中的账号显示在首页置顶栏，到期自动撤下。置顶中再置顶，从当前截止时间往后延长；单次至少 1 小时，累计最长 365 天。卖家会收到置顶通知。
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
            {["on_sale", "pending_review", "rejected"].includes(l.status) && (
              <form action={forceOffShelf}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton variant="secondary" pendingText="处理中…" confirm="下架会关闭排队中的意向单并通知买家，卖家修改后重新审核才能上架。确定强制下架？">
                  强制下架
                </SubmitButton>
              </form>
            )}
            {l.status === "deleted" ? (
              <form action={restoreListing}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton variant="secondary" pendingText="处理中…">恢复为已下架</SubmitButton>
              </form>
            ) : l.status !== "in_trade" && l.status !== "sold" ? (
              <form action={deleteListing}>
                <input type="hidden" name="id" value={l.id} />
                <SubmitButton variant="danger" pendingText="删除中…" confirm="删除后前台不再显示，排队中的意向单会关闭并通知买家；之后可在「已删除」筛选里恢复。确定删除？">
                  删除
                </SubmitButton>
              </form>
            ) : null}
            {l.status === "pending_review" && <Link href="/admin/review" className="link self-center text-sm">去审核队列通过 / 拒绝</Link>}
          </div>
        </Card>
      </div>

      {l.status === "deleted" ? (
        <Alert kind="warn">已删除的账号不能编辑，请先恢复。</Alert>
      ) : (
        <ListingForm
          hypixelEnabled={hypixelConfigured()}
          mode="edit"
          fields={game.attrSchema}
          agents={agents.filter((a) => a.id !== l.sellerId)}
          action={adminUpdateListing}
          submitText="保存修改"
          footnote="超管修改不改变账号状态，所有改动记入日志。"
          listing={{
            id: l.id,
            price: l.price,
            feeMode: l.feeMode,
            source: l.source,
            hasTransactionId: l.hasTransactionId,
            contact: l.contact,
            note: l.note,
            preferredAgentId: l.preferredAgentId,
            attrs: l.attrs,
            images: l.images.map((i) => ({ id: i.id, path: i.path })),
          }}
        />
      )}
    </div>
  );
}
