"use client";

import { useActionState } from "react";
import { openAftersale } from "@/actions/orders";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Textarea } from "@/components/ui";

export function AftersaleForm({ orderId }: { orderId: number }) {
  const [state, action] = useActionState<FormState, FormData>(openAftersale, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={orderId} />
      <Field label="问题描述" error={state.errors?.description} hint="说明发生了什么，例如账号被找回、信息与描述不符。10～500 字" required>
        <Textarea name="description" defaultValue={state.values?.description} maxLength={500} />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton variant="secondary" pendingText="提交中…">申请售后</SubmitButton>
    </form>
  );
}
