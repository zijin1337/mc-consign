import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Alert, Badge, LinkButton, PageHeader } from "@/components/ui";
import { WantedForm } from "@/components/wanted-form";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/ids";
import { WANTED_STATUS_CLASS, WANTED_STATUS_LABEL, formatDate } from "@/lib/labels";
import { listAgents } from "@/lib/listings";
import { wantedDisplayStatus } from "@/lib/wanted-shared";

export const metadata = { title: "编辑求购" };

export default async function EditWantedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();
  const user = await requireUser(`/wanted/${id}/edit`);

  const [r] = await db.select().from(schema.wantedRequests).where(eq(schema.wantedRequests.id, id)).limit(1);
  if (!r || r.buyerId !== user.id) notFound();
  // 已完成 / 已关闭 / 已下架的不能再编辑，回详情页看状态
  if (r.status !== "open") redirect(`/wanted/${id}`);

  const agents = await listAgents();
  const display = wantedDisplayStatus(r);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="WANTED"
        eyebrowDetail="编辑求购"
        title="编辑求购"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge className={WANTED_STATUS_CLASS[display]}>{WANTED_STATUS_LABEL[display]}</Badge>
            {r.title}
          </span>
        }
        actions={
          <LinkButton href={`/wanted/${id}`} variant="secondary">
            返回详情
          </LinkButton>
        }
      />
      <div className="mb-4">
        <Alert kind="info">
          编辑不改变有效期（到期 {formatDate(r.expiresAt)}）。{display === "expired" ? "求购已到期，保存后仍需在详情页续期才会重新公开。" : "需要延长请在详情页续期。"}
        </Alert>
      </div>
      <WantedForm
        mode="edit"
        agents={agents.filter((a) => a.id !== user.id)}
        request={{
          id: r.id,
          ranks: r.ranks,
          minLevel: r.minLevel,
          capes: r.capes,
          budgetMin: r.budgetMin,
          budgetMax: r.budgetMax,
          requirements: r.requirements,
          preferredAgentId: r.preferredAgentId,
        }}
      />
    </div>
  );
}
