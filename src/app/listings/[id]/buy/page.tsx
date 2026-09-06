import { notFound, redirect } from "next/navigation";
import { Price } from "@/components/price";
import { Alert, Badge, Card, DescList, Eyebrow } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { parseId } from "@/lib/ids";
import { imageUrl } from "@/lib/image-url";
import { FEE_MODE_HINT, FEE_MODE_LABEL, LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, formatDateTime } from "@/lib/labels";
import { getListingDetail, listAgents } from "@/lib/listings";
import { maskUsername } from "@/lib/mask";
import { countOpenOrders, findOpenOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { getWantedDetail } from "@/lib/wanted";
import { isWantedActive } from "@/lib/wanted-shared";
import { BuyForm } from "./buy-form";

export const metadata = { title: "提交意向单" };

const STEPS = [
  "提交意向单，中介收到通知。",
  "中介通过 QQ 联系你和卖家，核对账号并确认价格。",
  "你把款付给中介，卖家换绑交付，你验收。",
  "中介放款给卖家并标记交易完成，双方获得信用分，质保期开始。",
];

export default async function BuyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const listingId = Number(id);
  if (!Number.isInteger(listingId)) notFound();
  const user = await requireUser(`/listings/${listingId}/buy`);
  const l = await getListingDetail(listingId);
  if (!l || (l.status !== "on_sale" && l.status !== "in_trade")) notFound();
  if (l.sellerId === user.id) redirect(`/listings/${listingId}`);
  const existing = await findOpenOrder(listingId, user.id);
  if (existing) redirect(`/orders/${existing.id}`);

  // 从求购详情「去下单」带过来的 ?wanted=：只认自己的、仍有效的求购单，其他情况当没带
  const wantedParam = parseId(typeof sp.wanted === "string" ? sp.wanted : undefined);
  const [settings, openCount, agents, wanted] = await Promise.all([
    getSettings(),
    countOpenOrders(user.id),
    l.preferredAgent ? Promise.resolve([]) : listAgents(),
    wantedParam ? getWantedDetail(wantedParam) : Promise.resolve(null),
  ]);
  const wantedId = wanted && wanted.buyerId === user.id && isWantedActive(wanted) ? wanted.id : null;
  const locked = user.noShowLockedUntil && user.noShowLockedUntil > new Date();
  const blocked = locked
    ? `因多次爽约，${formatDateTime(user.noShowLockedUntil)} 之前不能下单。`
    : openCount >= settings.max_open_orders
      ? `你已有 ${openCount} 张进行中的意向单，达到上限 ${settings.max_open_orders}。先处理完再下单。`
      : null;
  const cover = l.images[0]?.path;
  const attrs = l.attrs as Record<string, unknown>;

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-5">
        <div>
          <Eyebrow section="ACCOUNT" detail="提交意向单" className="mb-3" />
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">我要买这个账号</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">提交意向单不产生任何费用。网站不收款，付款只在中介确认后进行。</p>
        </div>
        <Card>
          <div className="flex gap-4">
            <div className="h-20 w-32 shrink-0 overflow-hidden border border-white/10 bg-white/[0.04]">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl(cover)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-mono text-lg font-bold text-white">{String(attrs.ign ?? l.title)}</p>
              <p className="mt-1 text-sm text-zinc-400">{l.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge>
                <Price value={l.price} size="sm" />
                <span className="text-xs text-zinc-500">{FEE_MODE_LABEL[l.feeMode]} · {FEE_MODE_HINT[l.feeMode]}</span>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <DescList
              items={[
                { label: "卖家", value: `${maskUsername(l.seller.username)} · 信用 ${l.seller.creditScore}` },
                { label: "当前排队", value: `${l.queue} 人` },
              ]}
            />
          </div>
          {l.status === "in_trade" && (
            <div className="mt-4">
              <Alert kind="info">这个账号正在与另一位买家交易。你提交后会排队，当前交易取消后会按顺序通知你。</Alert>
            </div>
          )}
        </Card>
        <Card title="交易流程">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm leading-6 text-zinc-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center bg-white/10 font-mono text-xs font-bold text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-4 border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100/80">
            任何人索要你的账号密码或邮箱验证码，或让你付款到中介以外的账户，都是诈骗。
          </p>
        </Card>
      </div>
      <Card title="填写意向单" className="lg:sticky lg:top-24 lg:self-start">
        {blocked ? (
          <Alert kind="warn">{blocked}</Alert>
        ) : (
          <BuyForm listingId={l.id} agents={agents.filter((a) => a.id !== user.id && a.id !== l.sellerId)} preferredAgent={l.preferredAgent} wantedId={wantedId} />
        )}
      </Card>
    </div>
  );
}
