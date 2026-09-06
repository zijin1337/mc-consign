"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { sendCode } from "@/actions/auth";
import { Button, cn } from "./ui";

/**
 * 「发送验证码」按钮。读取同一表单里 name=qq 的输入框，60 秒倒计时。
 */
export function SendCodeButton({ purpose, qqInputName = "qq" }: { purpose: "register" | "reset_password"; qqInputName?: string }) {
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    const qq = (form?.elements.namedItem(qqInputName) as HTMLInputElement | null)?.value ?? "";
    start(async () => {
      const r = await sendCode(purpose, qq);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setLeft(60);
    });
  }

  return (
    <div className="flex flex-col">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending || left > 0}>
        {pending ? "发送中…" : left > 0 ? `${left} 秒后可重发` : "发送验证码"}
      </Button>
      {/* 结果提示常驻 role=status，读屏能播报；文字走中性 / 玫红，只有成功的勾是绿的 */}
      <span role="status" className={cn("flex items-center gap-1 text-xs", msg && "mt-1", msg && (msg.ok ? "text-zinc-200" : "text-rose-300"))}>
        {msg && (msg.ok ? <Check className="size-3.5 shrink-0 text-lime-300" aria-hidden="true" /> : <X className="size-3.5 shrink-0" aria-hidden="true" />)}
        {msg?.text}
      </span>
    </div>
  );
}
