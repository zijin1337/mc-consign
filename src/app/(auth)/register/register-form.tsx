"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/actions/auth";
import type { FormState } from "@/actions/types";
import { SendCodeButton } from "@/components/send-code-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(register, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="用户名" error={state.errors?.username} hint="2～16 个字符，中英文、数字或下划线。公开页面会部分打码显示" required>
        <Input name="username" defaultValue={v.username} autoComplete="username" required />
      </Field>
      <Field label="密码" error={state.errors?.password} hint="至少 8 位" required>
        <Input type="password" name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="QQ 号" error={state.errors?.qq} hint="验证码会发到对应的 QQ 邮箱。一个 QQ 号只能注册一个账号" required>
        <div className="flex gap-2">
          <Input name="qq" inputMode="numeric" defaultValue={v.qq} required className="flex-1" />
          <SendCodeButton purpose="register" />
        </div>
      </Field>
      <Field label="邮箱验证码" error={state.errors?.code} required>
        <Input name="code" inputMode="numeric" maxLength={6} required placeholder="6 位数字" />
      </Field>
      <Field label="手机号" error={state.errors?.phone} hint="用于身份核对，暂不发送短信" required>
        <Input name="phone" inputMode="tel" defaultValue={v.phone} required />
      </Field>
      <label className="flex min-h-6 items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="agree" />
        <span>
          我已阅读并同意
          <Link href="/terms" target="_blank" className="link">《用户协议与免责声明》</Link>
          ，知悉账号交易的风险。
        </span>
      </label>
      {state.errors?.agree && <p className="text-xs text-rose-300">{state.errors.agree}</p>}
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton className="w-full" pendingText="注册中…">注册</SubmitButton>
    </form>
  );
}
