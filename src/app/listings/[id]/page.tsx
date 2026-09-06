import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { ArrowRight, Check, Minus, ShieldCheck, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { HypixelPanel, HypixelPanelSkeleton } from "@/components/hypixel/panel";
import { HypixelPanelBoundary } from "@/components/hypixel/panel-boundary";
import { PixelAvatar } from "@/components/pixel-avatar";
import { Price } from "@/components/price";
import { Alert, Badge, Card, DescList, Eyebrow, LinkButton, StatGrid, cn, focusRing } from "@/components/ui";
import { VerifiedTag } from "@/components/verified-tag";
import { compareSnapshot } from "@/lib/hypixel/compare";
import { parseId } from "@/lib/ids";
import { db, schema } from "@/db";
import { formatAttr } from "@/lib/attrs";
import { requireUser } from "@/lib/auth";
import { idDetail } from "@/lib/eyebrow";
import { calcFee } from "@/lib/fee";
import { imageUrl } from "@/lib/image-url";
import { FEE_MODE_HINT, FEE_MODE_LABEL, LISTING_STATUS_CLASS, LISTING_STATUS_LABEL, RANK_ACCENT, SOURCE_LABEL, formatDate, formatPrice } from "@/lib/labels";
import { getListingDetail } from "@/lib/listings";
import { maskUsername } from "@/lib/mask";
import { findOpenOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const l = id ? await getListingDetail(id) : null;
  return { title: l ? l.title : "账号详情" };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseId(idStr);
  if (!id) notFound();
  const user = await requireUser(`/listings/${id}`);
  const [l, settings, myOrder] = await Promise.all([getListingDetail(id), getSettings(), findOpenOrder(id, user.id)]);
  if (!l) notFound();

  const isOwner = l.sellerId === user.id;
  // 中介处理售后时也要能回看已售出 / 已下架的账号
  const isStaff = user.role === "admin" || user.role === "agent";
  const visible = l.status === "on_sale" || l.status === "in_trade";
  if (!visible && !isOwner && !isStaff) notFound();

  // 浏览量在响应发出后再写，卖家自己和工作人员不计
  if (!isOwner && !isStaff) {
    after(async () => {
      await db
        .update(schema.listings)
        .set({ viewCount: sql`${schema.listings.viewCount} + 1` })
        .where(eq(schema.listings.id, id))
        .catch(() => {});
    });
  }

  const fee = calcFee(l.price, settings.fee_tiers);
  const fields = l.game.attrSchema;
  const attrs = l.attrs as Record<string, unknown>;
  const rank = String(attrs.rank ?? "无");
  // 未知会员按「无」处理：品牌绿不做默认封面色
  const accent = RANK_ACCENT[rank] ?? "rose";
  const [hero, ...rest] = l.images;
  const cmp = compareSnapshot(attrs, l.apiSnapshot);
  // 要点：只有官方数据核对一致是平台核验（绿勾）；卖家自述是中性陈述；否定项用琥珀提醒——绿勾不配否定事实
  const highlights: Highlight[] = [
    l.hasTransactionId ? { text: "卖家能提供交易 ID", kind: "neutral" } : { text: "卖家不能提供交易 ID", kind: "warn" },
    attrs.canRebindEmail ? { text: "支持换绑邮箱", kind: "neutral" } : { text: "不支持换绑邮箱", kind: "warn" },
    attrs.hasBanRecord
      ? { text: `有 Hypixel 封禁记录${attrs.banNote ? `：${attrs.banNote}` : ""}`, kind: "warn" }
      : { text: "无 Hypixel 封禁记录", kind: "neutral" },
    { text: `账号来源：${SOURCE_LABEL[l.source]}`, kind: "neutral" },
    ...(cmp.status === "match" || cmp.status === "partial"
      ? [{ text: `Hypixel 官方数据核对：${cmp.text}`, kind: cmp.status === "match" ? ("ok" as const) : ("neutral" as const) }]
      : []),
  ];

  const cta = { id: l.id, isOwner, myOrderId: myOrder?.id ?? null, visible };
  const hasCta = isOwner || !!myOrder || visible;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Eyebrow section="ACCOUNT" detail={idDetail(l.id, 4)} />
            <Badge className={LISTING_STATUS_CLASS[l.status]}>{LISTING_STATUS_LABEL[l.status]}</Badge>
            {/* 与列表卡、审核队列同一实现：只有官方快照核对一致才打标（页面里唯一的 lime 信息标记） */}
            {cmp.status === "match" && <VerifiedTag />}
            <span className="font-mono text-xs text-zinc-500">
              上架 {formatDate(l.approvedAt ?? l.createdAt)} · 浏览 {l.viewCount} · 排队 {l.queue} 人
            </span>
          </div>
          <h1 className="font-mono text-3xl font-black tracking-tight text-white sm:text-5xl">{String(attrs.ign ?? l.title)}</h1>
          <p className="mt-3 text-base text-zinc-400">
            {rank} · Hypixel {String(attrs.level ?? "-")} 级{Array.isArray(attrs.capes) && attrs.capes.length ? ` · 披风 ${(attrs.capes as string[]).join("/")}` : ""}
          </p>
        </div>

        {!visible && <Alert kind="warn">这个账号当前不公开展示（{LISTING_STATUS_LABEL[l.status]}），只有卖家本人和工作人员能看到。</Alert>}
        {l.status === "in_trade" && visible && (
          <Alert kind="info">
            {/* Alert 自带 Info 图标，这里不再叠第二个图标 */}
            <span className="block font-semibold">这个账号正在交易中</span>
            你仍可排队，当前交易取消后会按顺序通知你。
          </Alert>
        )}

        <div className={`listing-cover ${hero ? "has-image" : `cover-${accent}`} min-h-64 border border-white/10 sm:min-h-96`}>
          {hero ? (
            <>
              {/* 覆盖层贴满封面，封面 overflow:hidden，焦点环往内画才看得见 */}
              <a
                href={imageUrl(hero.path)}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 z-[3] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime-300"
                aria-label="查看原图"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cover-shot" src={imageUrl(hero.path)} alt={l.title} />
              <div className="cover-shade" />
            </>
          ) : (
            <div className="cover-noise" />
          )}
          <span className="cover-index">SCREENSHOT / 01</span>
          <span className="cover-edition">{rank}</span>
          <span className="score-chip">
            <ShieldCheck className="size-4 text-zinc-300" />
            卖家信用 {l.seller.creditScore}
          </span>
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {rest.map((img, i) => (
              <a
                key={img.id}
                href={imageUrl(img.path)}
                target="_blank"
                rel="noreferrer"
                aria-label={`查看第 ${i + 2} 张截图`}
                className={cn("relative block aspect-[16/10] overflow-hidden border border-white/10 bg-card hover:border-white/40", focusRing)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(img.path)} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 font-mono text-[10px] font-bold tracking-[0.12em] text-white/60">{String(i + 2).padStart(2, "0")}</span>
              </a>
            ))}
          </div>
        )}

        {cmp.status === "mismatch" && (
          <Alert kind="warn">卖家填写的等级或会员类型与 Hypixel 官方数据不一致（{cmp.text}）。以官方数据为准，下单前请与中介确认。</Alert>
        )}
        <HypixelPanelBoundary>
          <Suspense fallback={<HypixelPanelSkeleton />}>
            <HypixelPanel uuid={l.mcUuid} name={typeof attrs.ign === "string" ? attrs.ign : null} canRefresh isAdmin={user.role === "admin"} />
          </Suspense>
        </HypixelPanelBoundary>

        <Card title="卖家填写">
          <DescList
            items={[
              ...fields.filter((f) => f.key !== "banNote" || attrs.hasBanRecord).map((f) => ({ label: f.label, value: formatAttr(f, attrs[f.key]) })),
              { label: "账号来源", value: SOURCE_LABEL[l.source] },
              { label: "能否提供交易 ID", value: l.hasTransactionId ? "能" : "不能" },
            ]}
          />
          {l.note && (
            <div className="mt-5 border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-zinc-300">
              <p className="mb-1 font-mono text-xs tracking-[0.1em] text-zinc-500">卖家补充说明</p>
              <p className="whitespace-pre-wrap">{l.note}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        {/* 价格与主操作：桌面端右栏；手机端隐藏，改用页面底部的固定栏 */}
        <div className="hard-shadow hidden border border-white/10 bg-card p-6 lg:block">
          <span className="block text-xs text-zinc-600">{FEE_MODE_LABEL[l.feeMode]} · {FEE_MODE_HINT[l.feeMode]}</span>
          <Price value={l.price} size="lg" className="mt-1" />
          <div className="mt-5">
            <StatGrid
              items={
                l.feeMode === "all_in"
                  ? [
                      { label: "买家实付", value: formatPrice(l.price) },
                      { label: "预估中介费", value: formatPrice(fee) },
                      { label: "卖家到手约", value: formatPrice(Math.max(0, l.price - fee)) },
                    ]
                  : [
                      { label: "账号标价", value: formatPrice(l.price) },
                      { label: "预估中介费", value: formatPrice(fee) },
                      { label: "买家实付约", value: formatPrice(l.price + fee) },
                    ]
              }
            />
            <p className="mt-2 text-xs text-zinc-600">预估，以中介最终确认为准。</p>
          </div>
          <div className="mt-6">
            <Cta {...cta} />
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">下单后，中介会通过 QQ 联系你。网站不收款，付款只在中介确认后进行。</p>
        </div>

        <Card title="要点">
          <ul className="space-y-3">
            {highlights.map((h) => (
              <li key={h.text} className="flex items-start gap-3 text-sm leading-6 text-zinc-300">
                <HighlightMark kind={h.kind} />
                {h.text}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="卖家">
          <div className="mb-4 flex items-center gap-3 border-b border-white/[0.08] pb-4">
            <PixelAvatar seed={l.seller.username} size={40} />
            <div>
              <p className="font-mono text-base font-bold text-white">{maskUsername(l.seller.username)}</p>
              <p className="text-xs text-zinc-500">用户名已打码，交易时由中介核对身份</p>
            </div>
          </div>
          <DescList
            items={[
              { label: "信用分", value: <span className="font-mono font-bold text-white">{l.seller.creditScore}</span> },
              { label: "成交次数", value: l.seller.dealCount },
              { label: "指定中介", value: l.preferredAgent ? l.preferredAgent.username : "未指定，下单时由买家选择或平台分派" },
            ]}
          />
        </Card>
      </div>

      {/* 手机端：价格与主操作固定在屏幕底部，滑到页面尽头时回到正常位置，不遮页脚 */}
      {hasCta && (
        <div data-testid="mobile-cta" className="sticky bottom-0 z-20 -mx-4 border-t border-white/10 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Price value={l.price} size="md" />
              <p className="truncate text-[11px] text-zinc-500">
                {FEE_MODE_LABEL[l.feeMode]} · 预估中介费 {formatPrice(fee)}
                {l.feeMode === "all_in" ? `，卖家到手约 ${formatPrice(Math.max(0, l.price - fee))}` : `，实付约 ${formatPrice(l.price + fee)}`}
              </p>
            </div>
            <Cta {...cta} compact />
          </div>
        </div>
      )}
    </div>
  );
}

type Highlight = { text: string; kind: "ok" | "neutral" | "warn" };

/** 要点前的 16px 方块：ok = 平台核验一致（页面里唯一的绿勾）；neutral = 卖家自述；warn = 否定项，琥珀提醒 */
function HighlightMark({ kind }: { kind: Highlight["kind"] }) {
  const base = "mt-1 flex size-4 shrink-0 items-center justify-center";
  if (kind === "ok") {
    return (
      <span className={cn(base, "bg-lime-300 text-primary-foreground")} aria-hidden="true">
        <Check className="size-3" />
      </span>
    );
  }
  if (kind === "warn") {
    return (
      <span className={cn(base, "bg-amber-300 text-on-amber")} aria-hidden="true">
        <TriangleAlert className="size-3" />
      </span>
    );
  }
  return (
    <span className={cn(base, "border border-white/15")} aria-hidden="true">
      <Minus className="size-3 text-zinc-500" />
    </span>
  );
}

/** 主操作按钮。桌面端在右栏价格卡里，手机端在底部固定栏里各渲染一次，compact 用短文案 */
function Cta({ id, isOwner, myOrderId, visible, compact = false }: { id: number; isOwner: boolean; myOrderId: number | null; visible: boolean; compact?: boolean }) {
  const size = compact ? "md" : "lg";
  const cls = compact ? "shrink-0" : "w-full";
  if (isOwner) {
    return (
      <LinkButton href={`/sell/${id}/edit`} variant="secondary" size={size} className={cls}>
        {compact ? "去编辑" : "这是你的账号，去编辑"}
      </LinkButton>
    );
  }
  if (myOrderId) {
    return (
      <LinkButton href={`/orders/${myOrderId}`} variant="secondary" size={size} className={cls}>
        {compact ? "查看意向单" : `你已在排队，查看意向单 #${myOrderId}`}
      </LinkButton>
    );
  }
  if (visible) {
    return (
      <LinkButton href={`/listings/${id}/buy`} size={size} className={cls}>
        我要买 <ArrowRight className="size-4" />
      </LinkButton>
    );
  }
  return null;
}
