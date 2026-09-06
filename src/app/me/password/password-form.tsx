"use client";

import { useActionState } from "react";
import { changePassword } from "@/actions/account";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="当前密码" error={state.errors?.current} required>
        <Input type="password" name="current" autoComplete="current-password" required />
      </Field>
      <Field label="新密码" error={state.errors?.password} hint="8～64 位，建议字母、数字、符号混用" required>
        <Input type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={64} />
      </Field>
      <Field label="再输一次新密码" error={state.errors?.confirm} required>
        <Input type="password" name="confirm" autoComplete="new-password" required minLength={8} maxLength={64} />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="保存中…">保存新密码</SubmitButton>
    </form>
  );
}
