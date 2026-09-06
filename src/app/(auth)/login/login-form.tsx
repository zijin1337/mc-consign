"use client";

import { useActionState } from "react";
import { login } from "@/actions/auth";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="用户名或 QQ 号" error={state.errors?.account} required>
        <Input name="account" defaultValue={state.values?.account} autoComplete="username" required />
      </Field>
      <Field label="密码" error={state.errors?.password} required>
        <Input type="password" name="password" autoComplete="current-password" required />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="登录中…">登录</SubmitButton>
    </form>
  );
}
