"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { createOrder } from "@/actions/orders";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Select, Textarea } from "@/components/ui";

export function BuyForm({
  listingId,
  agents,
  preferredAgent,
  wantedId = null,
}: {
  listingId: number;
  agents: Array<{ id: number; username: string; agentIntro: string | null }>;
  preferredAgent: { id: number; username: string } | null;
  /** 从求购详情「去下单」进来时带的求购单 id（页面已校验是本人且仍有效），下单后意向单会挂到该求购单上 */
  wantedId?: number | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(createOrder, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="listingId" value={listingId} />
      {wantedId && (
        <>
          <input type="hidden" name="wanted" value={wantedId} />
          <Alert kind="info">
            本单来自你的求购{" "}
            <Link className="link" href={`/wanted/${wantedId}`}>
              #{wantedId}
            </Link>
            ，下单后推荐人会收到通知。
          </Alert>
        </>
      )}
      {preferredAgent ? (
        <Alert kind="info">
          卖家已指定中介 <strong className="text-white">{preferredAgent.username}</strong>，本单由这位中介跟进。
        </Alert>
      ) : (
        <Field label="选择中介" error={state.errors?.agentId} hint="不选则由平台分派。中介会通过 QQ 联系你和卖家，全程跟进。">
          <Select name="agentId" defaultValue={v.agentId ?? ""}>
            <option value="">平台分派</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username}
                {a.agentIntro ? ` · ${a.agentIntro}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="给中介的留言" error={state.errors?.message} hint="可选，200 字内。例如期望价格、方便联系的时间。不要写密码或验证码。">
        <Textarea name="message" defaultValue={v.message} maxLength={200} />
      </Field>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <SubmitButton size="lg" className="w-full" pendingText="提交中…">
        提交意向单 <ArrowRight className="size-4" />
      </SubmitButton>
    </form>
  );
}
