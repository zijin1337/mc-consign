"use client";

import { useActionState } from "react";
import { completeOrder } from "@/actions/orders";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function CompleteForm({ orderId, defaultPrice, feeHint }: { orderId: number; defaultPrice: number; feeHint: string }) {
  const [state, action] = useActionState<FormState, FormData>(completeOrder, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={orderId} />
      <Field label="成交金额（元）" error={state.errors?.finalPrice} hint="买卖双方最终约定的账号价格，不含中介费。信用分按此金额每 10 元加 1 分" required>
        <Input name="finalPrice" type="number" inputMode="numeric" min={1} defaultValue={v.finalPrice ?? String(defaultPrice)} />
      </Field>
      <Field label="实收中介费（元）" error={state.errors?.feeActual} hint={`留空按阶梯自动计算。${feeHint}`}>
        <Input name="feeActual" type="number" inputMode="numeric" min={0} defaultValue={v.feeActual} placeholder="留空自动计算" />
      </Field>
      <Field label="中介费差异原因" error={state.errors?.feeOverrideReason} hint="实收与按阶梯计算的金额不一致时必填">
        <Input name="feeOverrideReason" defaultValue={v.feeOverrideReason} maxLength={200} />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="结算中…" confirm="成交金额、中介费和双方信用分结算后不可撤销，同一账号其他排队中的意向单会一并关闭。确认交易已完成？">
        确认完成，结算信用分
      </SubmitButton>
      <p className="text-xs leading-5 text-zinc-500">完成后账号进入成交记录，双方加信用分，同一账号其他排队中的意向单自动关闭，质保期开始计算。此操作不可撤销。</p>
    </form>
  );
}
