import { and, count, eq, inArray } from "drizzle-orm";
import { ListingForm } from "@/components/listing-form";
import { Alert, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { hypixelConfigured } from "@/lib/hypixel/client";
import { getMcGame, listAgents } from "@/lib/listings";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "发布账号" };

export default async function NewListingPage() {
  const user = await requireUser("/sell/new");
  const [game, agents, settings, [{ n }]] = await Promise.all([
    getMcGame(),
    listAgents(),
    getSettings(),
    db
      .select({ n: count() })
      .from(schema.listings)
      .where(and(eq(schema.listings.sellerId, user.id), inArray(schema.listings.status, ["pending_review", "on_sale", "in_trade"]))),
  ]);

  const blocked =
    user.creditScore < settings.min_credit_to_list
      ? `你的信用分 ${user.creditScore} 低于发布门槛 ${settings.min_credit_to_list}，暂时不能发布。`
      : n >= settings.max_active_listings
        ? `你已有 ${n} 个账号在审核或在售，达到上限 ${settings.max_active_listings}。成交或下架后可以再发布。`
        : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="SELL" eyebrowDetail="发布账号" title="发布账号" description="如实填写，审核通过后展示。联系方式只有中介和平台可见。" />
      {blocked ? (
        <Alert kind="warn">{blocked}</Alert>
      ) : (
        <ListingForm
          hypixelEnabled={hypixelConfigured()}
          mode="create"
          fields={game.attrSchema}
          agents={agents.filter((a) => a.id !== user.id)}
          defaultContact={`QQ ${user.qq}`}
        />
      )}
    </div>
  );
}
