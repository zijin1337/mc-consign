import { asc, eq } from "drizzle-orm";
import { parseId } from "@/lib/ids";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/listing-form";
import { Alert, Badge, LinkButton, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { LISTING_STATUS_CLASS, LISTING_STATUS_LABEL } from "@/lib/labels";
import { hypixelConfigured } from "@/lib/hypixel/client";
import { getMcGame, listAgents } from "@/lib/listings";

export const metadata = { title: "编辑账号" };

const EDITABLE = new Set(["pending_review", "on_sale", "rejected", "off_shelf"]);

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();
  const user = await requireUser(`/sell/${id}/edit`);

  const [l] = await db.select().from(schema.listings).where(eq(schema.listings.id, id)).limit(1);
  if (!l || l.sellerId !== user.id || l.status === "deleted") notFound();

  const [game, agents, images] = await Promise.all([
    getMcGame(),
    listAgents(),
    db
      .select({ id: schema.listingImages.id, path: schema.listingImages.path })
      .from(schema.listingImages)
      .where(eq(schema.listingImages.listingId, id))
      .orderBy(asc(schema.listingImages.sortOrder)),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="SELL"
        eyebrowDetail="编辑账号"
        title="编辑账号"
        description={
          <span className="flex items-center gap-2">
            <Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge>
            {l.title}
          </span>
        }
        actions={<LinkButton href="/me" variant="secondary">返回</LinkButton>}
      />
      {l.status === "rejected" && l.reviewNote && (
        <div className="mb-4">
          <Alert kind="error">审核未通过：{l.reviewNote}。修改后重新提交。</Alert>
        </div>
      )}
      {!EDITABLE.has(l.status) ? (
        <Alert kind="warn">当前状态「{LISTING_STATUS_LABEL[l.status]}」不能编辑。</Alert>
      ) : (
        <>
          {l.status === "on_sale" && (
            <div className="mb-4">
              <Alert kind="info">在售账号修改后会回到待审核并暂停展示，通过后恢复在售。排队中的买家和中介会收到通知。</Alert>
            </div>
          )}
          <ListingForm
            hypixelEnabled={hypixelConfigured()}
            mode="edit"
            fields={game.attrSchema}
            agents={agents.filter((a) => a.id !== user.id)}
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
              images,
            }}
          />
        </>
      )}
    </div>
  );
}
