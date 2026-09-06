"use client";

import { Check, Download, X } from "lucide-react";
import { useState, useTransition } from "react";
import { lookupPlayer } from "@/actions/hypixel";
import { Button, cn } from "@/components/ui";

/**
 * 上架表单里「从 Hypixel 拉取」：读同一表单的 attr_ign，把等级、会员填进 attr_level / attr_rank，并把 ID 大小写改成官方写法。
 */
export function HypixelLookupButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (!form) return;
    const ignInput = form.elements.namedItem("attr_ign") as HTMLInputElement | null;
    const ign = ignInput?.value.trim() ?? "";
    if (!ign) {
      setMsg({ ok: false, text: "请先填写正版 ID" });
      return;
    }
    start(async () => {
      const r = await lookupPlayer(ign);
      if (!r.ok) {
        setMsg({ ok: false, text: r.message });
        return;
      }
      if (ignInput) ignInput.value = r.name;
      const level = form.elements.namedItem("attr_level") as HTMLInputElement | null;
      if (level) level.value = String(r.level);
      const rank = form.elements.namedItem("attr_rank") as HTMLSelectElement | null;
      let rankNote = "";
      if (rank && r.rank && Array.from(rank.options).some((o) => o.value === r.rank)) rank.value = r.rank;
      else if (rank && !r.rank) rankNote = `，${r.rankDisplay} 没有对应的会员类型，请手动选择`;
      setMsg({ ok: true, text: `已填入：${r.rankDisplay} · ${r.level} 级${rankNote}` });
    });
  }

  return (
    <div className="flex flex-col items-start">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending} className="h-11 whitespace-nowrap">
        <Download className="size-4" />
        {pending ? "拉取中…" : "从 Hypixel 拉取"}
      </Button>
      {/* 常驻的 live region：结果一出现读屏就念；成功 / 失败靠图标 + 颜色双重区分，空着时不占位 */}
      <span role="status" className={cn("mt-1 inline-flex items-center gap-1 text-xs empty:mt-0", msg && (msg.ok ? "text-zinc-200" : "text-rose-300"))}>
        {msg ? (
          <>
            {msg.ok ? <Check className="size-3.5 shrink-0 text-lime-300" aria-hidden="true" /> : <X className="size-3.5 shrink-0" aria-hidden="true" />}
            <span>{msg.text}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
