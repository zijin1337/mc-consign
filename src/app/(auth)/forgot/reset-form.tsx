"use client";

import { useActionState } from "react";
import { resetPassword } from "@/actions/auth";
import type { FormState } from "@/actions/types";
import { SendCodeButton } from "@/components/send-code-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="QQ 号" error={state.errors?.qq} required>
        <div className="flex gap-2">
          <Input name="qq" inputMode="numeric" defaultValue={state.values?.qq} required className="flex-1" />
          <SendCodeButton purpose="reset_password" />
        </div>
      </Field>
      <Field label="邮箱验证码" error={state.errors?.code} required>
        <Input name="code" inputMode="numeric" maxLength={6} required />
      </Field>
      <Field label="新密码" error={state.errors?.password} hint="至少 8 位" required>
        <Input type="password" name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="重置中…">重置密码</SubmitButton>
    </form>
  );
}
