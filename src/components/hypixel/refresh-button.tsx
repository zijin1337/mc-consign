"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshPlayer } from "@/actions/hypixel";
import { cn, focusRing } from "@/components/ui";

export function RefreshButton({ uuid }: { uuid: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-zinc-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshPlayer(uuid);
            setMsg(r.message);
            if (r.ok) router.refresh();
          })
        }
        className={cn("inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-white disabled:text-zinc-600", focusRing)}
        aria-label="刷新 Hypixel 数据"
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
        刷新
      </button>
    </span>
  );
}
