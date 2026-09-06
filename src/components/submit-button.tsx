"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";
import type { ComponentProps, MouseEvent } from "react";

/**
 * 表单提交按钮：提交中自动禁用并换文案。
 * - confirm：点击先弹确认框，取消则不提交，用于取消意向单、下架、删除、封禁这类不可逆操作。
 * - requireField：提交前要求表单里某个字段非空（例如拒绝审核必须填原因），用浏览器原生校验气泡提示。
 * - 同一表单里有多个提交按钮（通过 / 拒绝）时，只有被点的那个显示「处理中」，其余只是禁用。
 */
export function SubmitButton({
  children,
  pendingText = "提交中…",
  confirm,
  requireField,
  requireMessage,
  onClick,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string; confirm?: string; requireField?: string; requireMessage?: string }) {
  const { pending, data } = useFormStatus();
  const mine = props.name === undefined || props.value === undefined || data?.get(props.name) === String(props.value);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (requireField) {
      const el = e.currentTarget.form?.elements.namedItem(requireField);
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) && !el.value.trim()) {
        e.preventDefault();
        // 只借浏览器的校验气泡提示一下，随手清掉，否则同一表单的其他提交按钮（如「通过」）会被这个无效状态拦住
        el.setCustomValidity(requireMessage ?? "请先填写这一项");
        el.reportValidity();
        el.setCustomValidity("");
        el.focus();
        return;
      }
    }
    if (confirm && !window.confirm(confirm)) e.preventDefault();
  }

  return (
    <Button type="submit" {...props} disabled={pending || disabled} onClick={handleClick} aria-busy={pending || undefined}>
      {pending && mine ? pendingText : children}
    </Button>
  );
}
