"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/actions/types";
import { offerListing } from "@/actions/wanted";
import { CONTACT_LEAK_HINT } from "@/lib/contact-leak";
import { formatPrice } from "@/lib/labels";
import { WANTED_MESSAGE_MAX } from "@/lib/wanted-shared";
import { SubmitButton } from "./submit-button";
import { Alert, Field, Select, Textarea } from "./ui";

/**
 * 把账号推荐给求购买家。
 * 组件一直挂载：推荐成功后页面 revalidate，可推荐的账号可能就此清空，靠这里保留的 state 把「已推荐给买家」提示留在屏上。
 * `[data-testid="offer-form"]`、select[name="listingId"]、textarea[name="message"]、按钮「推荐给买家」是 e2e 契约。
 */
export function OfferForm({
  requestId,
  listings,
  isStaff,
}: {
  requestId: number;
  /** 当前用户此刻还能推荐的账号（已推荐过的不在里面） */
  listings: Array<{ id: number; title: string; price: number }>;
  /** 中介 / 超管：没有账号时的提示不引导去发布账号 */
  isStaff: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(offerListing, {});
  const v = state.values ?? {};
  const err = state.errors ?? {};

  return (
    <div data-testid="offer-form" className="space-y-4">
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      {listings.length === 0 ? (
        state.ok ? (
          <p className="text-xs leading-5 text-zinc-500">你暂时没有其他可以推荐的账号。</p>
        ) : (
          <Alert kind="info">
            {isStaff ? (
              "市场上没有可以推荐给这位买家的在售账号。"
            ) : (
              <>
                你没有在售的账号可以推荐。
                <Link href="/sell/new" className="link">
                  去发布账号
                </Link>
              </>
            )}
          </Alert>
        )
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="requestId" value={requestId} />
          <Field label="推荐的账号" error={err.listingId} required>
            <Select name="listingId" defaultValue={v.listingId ?? ""} required>
              <option value="">请选择</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title} · {formatPrice(l.price)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="给买家的留言" error={err.message} hint={`可选，${WANTED_MESSAGE_MAX} 字内。${CONTACT_LEAK_HINT}`}>
            <Textarea name="message" defaultValue={v.message} maxLength={WANTED_MESSAGE_MAX} placeholder="例如：账号符合你的全部要求，价格可以再谈" />
          </Field>
          {state.message && !state.ok && <Alert kind="error">{state.message}</Alert>}
          <SubmitButton className="w-full" pendingText="推荐中…">
            推荐给买家
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
