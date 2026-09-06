"use client";

import { useActionState } from "react";
import { changeUsername } from "@/actions/account";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function UsernameForm({ current, disabled }: { current: string; disabled?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(changeUsername, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="新用户名" error={state.errors?.username} hint="2～16 个字符，可用中英文、数字和下划线" required>
        <Input
          name="username"
          defaultValue={state.values?.username ?? current}
          autoComplete="username"
          required
          minLength={2}
          maxLength={16}
          disabled={disabled}
        />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="保存中…" disabled={disabled}>
        保存新用户名
      </SubmitButton>
    </form>
  );
}
