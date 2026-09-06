import Link from "next/link";
import { parseId } from "@/lib/ids";
import { Check, ShieldAlert, X } from "lucide-react";
import { notFound } from "next/navigation";
import { assignOrder, cancelOrder, resolveAftersale, saveAgentNote, startOrder, withdrawOrder } from "@/actions/orders";
import { Price } from "@/components/price";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, DescList, Eyebrow, LinkButton, Select, StatGrid, Textarea, cn, focusRing } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { idDetail } from "@/lib/eyebrow";
import { calcFee } from "@/lib/fee";
import { imageUrl } from "@/lib/image-url";
import {
  AFTERSALE_RESULT_LABEL,
  AFTERSALE_STATUS_CLASS,
  AFTERSALE_STATUS_LABEL,
  AGENT_CANCEL_REASONS,
  CANCEL_REASON_LABEL,
  FEE_MODE_LABEL,
  LISTING_STATUS_CLASS,
  LISTING_STATUS_LABEL,
  ORDER_STATUS_CLASS,
  ORDER_STATUS_LABEL,
  formatDateTime,
  formatPrice,
} from "@/lib/labels";
import { maskUsername } from "@/lib/mask";
import { OPEN_ORDER_STATUSES, getOrder, isoDate, listAssignableAgents, orderPerms } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { AftersaleForm } from "./aftersale-form";
import { CompleteForm } from "./complete-form";

export const metadata = { title: "意向单" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = parseId(idStr);
  if (!id) notFound();
  const user = await requireUser(`/orders/${id}`);
  const o = await getOrder(id);
  if (!o) notFound();
  const p = orderPerms(o, user);
  if (!p.canView) notFound();
  const settings = await getSettings();
  if (p.canAct) await audit(user.id, "view_contact", "order", id);

  const isOpen = (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status);
  const agentsForAssign = p.isAdmin && isOpen ? await listAssignableAgents() : [];
  const cover = o.listing.images[0]?.path;
  const today = isoDate(new Date());
  const inWarranty = o.status === "completed" && !!o.warrantyUntil && o.warrantyUntil >= today;
  const openAftersale = o.aftersales.find((a) => a.status === "open");
  const feePreview = calcFee(o.listing.price, settings.fee_tiers);

  const flash = sp.created
    ? { kind: "success" as const, text: o.agentId ? `意向单已提交。中介 ${o.agent?.username ?? ""} 会通过 QQ 联系你，请留意好友申请。` : "意向单已提交，平台安排中介后会通知你。" }
    : sp.done
      ? { kind: "success" as const, text: "交易已完成，信用分已结算。" }
      : sp.aftersale
        ? { kind: "success" as const, text: "售后申请已提交，中介处理后会通知你。" }
        : sp.error === "already_in_trade"
          ? { kind: "error" as const, text: "该账号已有另一笔进行中的交易，等它完成或取消后再开始。" }
          : sp.error === "listing_unavailable"
            ? { kind: "error" as const, text: "该账号当前不在售，无法开始交易。" }
            : sp.error === "state_changed" || sp.error === "aftersale_closed"
              ? { kind: "error" as const, text: "这张意向单的状态刚刚变了，页面已刷新，请确认后再操作。" }
              : sp.error === "forbidden"
                ? { kind: "error" as const, text: "这张意向单不由你处理，或你本人就是买卖方之一。" }
                : sp.error === "buyer_banned"
                  ? { kind: "error" as const, text: "买家已被封禁，不能开始交易。" }
                  : null;

  const steps = [
    { label: "提交意向单", at: o.createdAt, done: true },
    { label: "分派中介", at: o.assignedAt, done: !!o.agentId },
    { label: "开始交易", at: o.startedAt, done: !!o.startedAt },
    o.status === "cancelled" ? { label: "已取消", at: o.cancelledAt, done: true, bad: true } : { label: "完成交易", at: o.completedAt, done: o.status === "completed" },
  ];

  const buyerName = p.canAct || p.isBuyer ? o.buyer.username : maskUsername(o.buyer.username);
  const sellerName = p.canAct || p.isSeller ? o.seller.username : maskUsername(o.seller.username);

  const statusText: Record<typeof o.status, string> = {
    pending_assign: "平台正在安排中介，安排后会通知双方。",
    pending_contact: `中介 ${o.agent?.username ?? ""} 会通过 QQ 联系买卖双方，请留意好友申请。`,
    in_progress: "交易进行中。网站不收款，付款只在中介确认后进行。任何人索要你的账号密码或邮箱验证码，或让你付款到中介以外的账户，都是诈骗。",
    completed: `交易已完成。质保至 ${o.warrantyUntil ?? "-"}，质保期内买家可在本页申请售后。`,
    cancelled: `已取消。原因：${o.cancelReason ? CANCEL_REASON_LABEL[o.cancelReason] : "-"}${o.cancelNote ? `，${o.cancelNote}` : ""}`,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Eyebrow section="ORDERS" detail={idDetail(o.id, 5)} />
            <Badge className={ORDER_STATUS_CLASS[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{o.listing.title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{statusText[o.status]}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/listings/${o.listingId}`} variant="secondary">账号详情</LinkButton>
          <LinkButton href={p.canAct && !p.isBuyer && !p.isSeller ? "/agent" : "/orders"} variant="secondary">返回列表</LinkButton>
        </div>
      </div>
      {flash && <Alert kind={flash.kind}>{flash.text}</Alert>}

      <ol className="grid grid-cols-2 gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3 bg-card p-4">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center font-mono text-xs font-bold",
                "bad" in s && s.bad ? "bg-rose-400 text-on-rose" : s.done ? "bg-white text-black" : "border border-white/15 text-zinc-500",
              )}
            >
              {"bad" in s && s.bad ? <X className="size-3.5" /> : s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span>
              <span className={cn("block text-sm font-semibold", s.done ? "text-white" : "text-zinc-500")}>{s.label}</span>
              <span className="block text-xs text-zinc-500">{s.at ? formatDateTime(s.at) : "—"}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Card title="账号">
            <div className="flex gap-4">
              <Link
                href={`/listings/${o.listingId}`}
                aria-label="查看账号详情"
                className={cn("h-24 w-40 shrink-0 overflow-hidden border border-white/10 bg-white/[0.04] transition-colors hover:border-white/40", focusRing)}
              >
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(cover)} alt="" className="h-full w-full object-cover" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/listings/${o.listingId}`} className="link-quiet block truncate text-lg font-bold">{o.listing.title}</Link>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Price value={o.listing.price} size="sm" />
                  <span className="text-zinc-500">{FEE_MODE_LABEL[o.listing.feeMode]}</span>
                  <Badge className={LISTING_STATUS_CLASS[o.listing.status]}>{LISTING_STATUS_LABEL[o.listing.status]}</Badge>
                </div>
                {o.wantedRequestId && (
                  <p className="mt-2 text-sm text-zinc-400">
                    来自求购{" "}
                    <Link href={`/wanted/${o.wantedRequestId}`} className="link">
                      #{o.wantedRequestId}
                    </Link>
                  </p>
                )}
                {o.buyerMessage && (
                  <p className="mt-3 border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
                    <span className="mr-2 font-mono text-xs text-zinc-500">买家留言</span>
                    {o.buyerMessage}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {o.status === "completed" && (
            <Card title="成交信息">
              <StatGrid
                items={[
                  { label: "成交金额", value: formatPrice(o.finalPrice ?? 0) },
                  { label: "实收中介费", value: formatPrice(o.feeActual ?? 0) },
                  { label: "质保至", value: o.warrantyUntil ?? "-" },
                ]}
              />
              {p.canAct && o.feeCalculated !== o.feeActual && (
                <p className="mt-3 text-xs text-zinc-500">
                  按阶梯应收 {formatPrice(o.feeCalculated ?? 0)}，实收 {formatPrice(o.feeActual ?? 0)}。原因：{o.feeOverrideReason}
                </p>
              )}
            </Card>
          )}

          {(o.status === "completed" || o.aftersales.length > 0) && (
            <Card title="售后">
              {o.aftersales.length === 0 && <p className="text-sm text-zinc-500">暂无售后记录。</p>}
              <ul className="space-y-4">
                {o.aftersales.map((a) => (
                  <li key={a.id} className="border border-white/10 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <Badge className={AFTERSALE_STATUS_CLASS[a.status]}>
                        {AFTERSALE_STATUS_LABEL[a.status]}
                      </Badge>
                      <span>{formatDateTime(a.createdAt)} 提交</span>
                      {a.closedAt && <span>· {formatDateTime(a.closedAt)} 处理</span>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{a.description}</p>
                    {a.status !== "open" && (
                      <p className="mt-2 text-sm text-zinc-400">
                        结果：{a.result ? AFTERSALE_RESULT_LABEL[a.result] : "-"}
                        {a.resultNote ? `，${a.resultNote}` : ""}
                        {a.sellerAtFault ? "。判定卖家责任" : ""}
                      </p>
                    )}
                    {a.status === "open" && p.canAct && (
                      <form action={resolveAftersale} className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <input type="hidden" name="id" value={a.id} />
                        <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                          <Select name="result" defaultValue="negotiated">
                            <option value="refund">退款</option>
                            <option value="negotiated">协商解决</option>
                            <option value="rejected">驳回</option>
                          </Select>
                          <Textarea name="note" placeholder="处理说明，买卖双方可见" className="min-h-11" maxLength={500} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex min-h-6 items-center gap-2 text-sm text-zinc-300">
                            <input type="checkbox" name="sellerAtFault" />
                            判定卖家责任，卖家信用分扣 {settings.credit_penalty_aftersale} 分
                          </label>
                          <SubmitButton variant="secondary" size="sm" pendingText="提交中…" confirm="处理结果会通知买卖双方；勾选了卖家责任会立即扣卖家信用分，不可撤销。确定提交？">
                            提交处理结果
                          </SubmitButton>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {p.isBuyer && inWarranty && !openAftersale && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <AftersaleForm orderId={o.id} />
                </div>
              )}
              {p.isBuyer && o.status === "completed" && !inWarranty && <p className="mt-3 text-xs text-zinc-500">已过质保期（{o.warrantyUntil}），不能再申请售后。</p>}
            </Card>
          )}

          {p.canAct && (
            <Card title="中介备注">
              <form action={saveAgentNote} className="space-y-2">
                <input type="hidden" name="id" value={o.id} />
                <Textarea name="note" defaultValue={o.agentNote ?? ""} placeholder="只有中介和超管可见，例如验号情况、约定的交付时间" maxLength={1000} />
                <SubmitButton variant="secondary" size="sm" pendingText="保存中…">保存备注</SubmitButton>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card title="参与方">
            <DescList
              items={[
                { label: "买家", value: `${buyerName} · 信用 ${o.buyer.creditScore} · 成交 ${o.buyer.dealCount} 次` },
                { label: "卖家", value: `${sellerName} · 信用 ${o.seller.creditScore} · 成交 ${o.seller.dealCount} 次` },
                { label: "中介", value: o.agent ? o.agent.username : <span className="text-amber-300">待分派</span> },
                { label: "提交时间", value: formatDateTime(o.createdAt) },
              ]}
            />
            {p.canAct && (
              <div className="mt-4 border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm">
                <p className="mb-2 flex items-center gap-2 font-mono text-xs tracking-[0.1em] text-amber-300">
                  <ShieldAlert className="size-4" />
                  联系方式 · 仅中介与超管可见，本次查看已记录
                </p>
                <DescList
                  items={[
                    { label: "买家 QQ", value: <span className="font-mono">{o.buyer.qq}</span> },
                    { label: "买家爽约次数", value: o.buyer.noShowCount },
                    { label: "卖家 QQ", value: <span className="font-mono">{o.seller.qq}</span> },
                    { label: "卖家填写的联系方式", value: <span className="font-mono">{o.listing.contact}</span> },
                  ]}
                />
              </div>
            )}
          </Card>

          {(p.canAct || p.isBuyer) && isOpen && (
            <Card title="操作">
              <div className="space-y-5">
                {p.canAct && o.status === "pending_contact" && (
                  <form action={startOrder} className="space-y-2">
                    <input type="hidden" name="id" value={o.id} />
                    <SubmitButton className="w-full" size="lg" pendingText="处理中…">开始交易</SubmitButton>
                    <p className="text-xs leading-5 text-zinc-500">联系双方确认要交易后再点。账号会标为「交易中」，其他排队的买家会收到等待提示。</p>
                  </form>
                )}
                {p.canAct && o.status === "pending_assign" && !p.isAdmin && <Alert kind="info">这张意向单还没有分派中介，等超管分派后再处理。</Alert>}
                {p.canAct && o.status === "in_progress" && (
                  <div className="border border-white/10 p-4">
                    <p className="mb-3 text-sm font-semibold text-white">完成交易</p>
                    <CompleteForm orderId={o.id} defaultPrice={o.listing.price} feeHint={`按标价 ${formatPrice(o.listing.price)} 预估中介费 ${formatPrice(feePreview)}`} />
                  </div>
                )}
                {p.canAct && (
                  <form action={cancelOrder} className="space-y-2 border-t border-white/10 pt-4">
                    <input type="hidden" name="id" value={o.id} />
                    <p className="text-sm font-semibold text-white">取消意向单</p>
                    <Select name="reason" defaultValue="price_disagree" aria-label="取消原因">
                      {AGENT_CANCEL_REASONS.map((k) => (
                        <option key={k} value={k}>
                          {CANCEL_REASON_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                    <Textarea name="note" placeholder="补充说明，买卖双方可见" className="min-h-16" maxLength={300} />
                    <SubmitButton
                      variant="danger"
                      className="w-full"
                      pendingText="取消中…"
                      confirm={`取消后不可恢复。原因选「买家放弃或失联」时，买家会记一次爽约并扣 ${settings.credit_penalty_no_show} 分。确定取消？`}
                    >
                      取消意向单
                    </SubmitButton>
                    <p className="text-xs leading-5 text-zinc-500">
                      选「买家放弃或失联」会给买家记一次爽约并扣 {settings.credit_penalty_no_show} 分，累计 {settings.no_show_limit} 次将限制下单 {settings.no_show_lock_days} 天。交易中取消后账号恢复在售，并通知下一位买家。
                    </p>
                  </form>
                )}
                {p.isAdmin && agentsForAssign.length > 0 && (
                  <form action={assignOrder} className="space-y-2 border-t border-white/10 pt-4">
                    <input type="hidden" name="id" value={o.id} />
                    <p className="text-sm font-semibold text-white">{o.agentId ? "改派中介" : "分派中介"}</p>
                    <div className="flex gap-2">
                      <Select name="agentId" defaultValue="" className="flex-1">
                        <option value="">选择中介</option>
                        {agentsForAssign
                          .filter((a) => a.id !== o.buyerId && a.id !== o.sellerId && a.id !== o.agentId)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.username}
                              {a.role === "admin" ? "（超管）" : ""}
                              {a.agentAccepting ? "" : "（停止接单）"}
                            </option>
                          ))}
                      </Select>
                      <SubmitButton variant="secondary" pendingText="分派中…">确定</SubmitButton>
                    </div>
                  </form>
                )}
                {p.isBuyer && (o.status === "pending_assign" || o.status === "pending_contact") && (
                  <form action={withdrawOrder} className={cn("space-y-2", p.canAct && "border-t border-white/10 pt-4")}>
                    <input type="hidden" name="id" value={o.id} />
                    <SubmitButton variant="ghost" className="w-full" pendingText="撤回中…" confirm="撤回后如果还想买，需要重新排队。确定撤回？">
                      撤回意向单
                    </SubmitButton>
                    <p className="text-xs text-zinc-500">中介联系你之前撤回不计爽约。开始交易后要取消，请联系中介。</p>
                  </form>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
