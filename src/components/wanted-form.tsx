"use client";

import { useActionState } from "react";
import type { FormState } from "@/actions/types";
import { createWanted, updateWanted } from "@/actions/wanted";
import { CONTACT_LEAK_HINT } from "@/lib/contact-leak";
import { MC_CAPES, MC_RANKS } from "@/lib/games/mc";
import { WANTED_DAYS_OPTIONS, WANTED_REQUIREMENTS_MAX } from "@/lib/wanted-shared";
import { SubmitButton } from "./submit-button";
import { Alert, Card, Field, Input, Select, Textarea } from "./ui";

export interface WantedFormRequest {
  id: number;
  ranks: string[];
  minLevel: number | null;
  capes: string[];
  budgetMin: number | null;
  budgetMax: number;
  requirements: string | null;
  preferredAgentId: number | null;
}

/** 多选芯片：与 listing-form 的 multi_enum 同一写法，选中态是荧光绿边框 + 极淡底（表单选中态属 A 类用色） */
const chipClass =
  "flex cursor-pointer items-center gap-2 rounded-none border border-white/15 bg-card px-3 py-2 text-sm text-zinc-200 has-[:checked]:border-lime-300/60 has-[:checked]:bg-lime-300/[0.08] has-[:checked]:text-white";

/**
 * 发布 / 编辑求购。字段名（ranks / minLevel / capes / budgetMin / budgetMax / requirements / preferredAgentId / days）
 * 与 actions/wanted.ts 的解析一一对应，也是 e2e 契约。编辑模式不渲染 days（编辑不改有效期）。
 */
export function WantedForm({
  mode,
  agents,
  request,
  defaultDays = 30,
}: {
  mode: "create" | "edit";
  agents: Array<{ id: number; username: string; agentIntro: string | null }>;
  request?: WantedFormRequest;
  /** 发布时有效期的默认选项，来自系统配置 wanted_default_days */
  defaultDays?: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(mode === "create" ? createWanted : updateWanted, {});
  const isCreate = mode === "create";

  // 回填优先级：本次提交的值 > 求购单现值 > 默认值
  const initial: Record<string, string> = request
    ? {
        ranks: request.ranks.join(","),
        minLevel: request.minLevel ? String(request.minLevel) : "",
        capes: request.capes.join(","),
        budgetMin: request.budgetMin ? String(request.budgetMin) : "",
        budgetMax: String(request.budgetMax),
        requirements: request.requirements ?? "",
        preferredAgentId: request.preferredAgentId ? String(request.preferredAgentId) : "",
      }
    : { days: String(defaultDays) };
  const v = { ...initial, ...(state.values ?? {}) };
  const err = state.errors ?? {};
  const ranks = new Set(v.ranks ? v.ranks.split(",") : []);
  const capes = new Set(v.capes ? v.capes.split(",") : []);

  return (
    <form action={action} className="space-y-5">
      {request && <input type="hidden" name="id" value={request.id} />}

      <Card title="想要的账号">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="会员类型" error={err.ranks} hint="可多选，不选即不限" group className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {MC_RANKS.map((r) => (
                <label key={r} className={chipClass}>
                  <input type="checkbox" name="ranks" value={r} defaultChecked={ranks.has(r)} />
                  {r === "无" ? "无会员" : r}
                </label>
              ))}
            </div>
          </Field>
          <Field label="最低等级" error={err.minLevel} hint="Hypixel 等级，不填即不限">
            <Input name="minLevel" type="number" inputMode="numeric" min={0} defaultValue={v.minLevel} placeholder="例如 100" />
          </Field>
          <Field label="披风" error={err.capes} hint="不选即不限" group>
            <div className="flex flex-wrap gap-2">
              {MC_CAPES.map((c) => (
                <label key={c} className={chipClass}>
                  <input type="checkbox" name="capes" value={c} defaultChecked={capes.has(c)} />
                  {c}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <Card title="预算与有效期">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="预算下限（元）" error={err.budgetMin} hint="可不填，只填上限表示「不超过这个价」">
            <Input name="budgetMin" type="number" inputMode="numeric" min={1} defaultValue={v.budgetMin} />
          </Field>
          <Field label="预算上限（元）" error={err.budgetMax} required>
            <Input name="budgetMax" type="number" inputMode="numeric" min={1} required defaultValue={v.budgetMax} />
          </Field>
          {isCreate && (
            <Field label="有效期" error={err.days} hint="到期后不再公开展示，剩 7 天内可续期" required>
              <Select name="days" defaultValue={v.days}>
                {WANTED_DAYS_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} 天
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card title="其他要求与中介">
        <div className="grid gap-4">
          <Field label="其他要求" error={err.requirements} hint={`可选，${WANTED_REQUIREMENTS_MAX} 字内，公开可见。${CONTACT_LEAK_HINT}`}>
            <Textarea name="requirements" defaultValue={v.requirements} maxLength={WANTED_REQUIREMENTS_MAX} placeholder="例如：注册时间早、无封禁记录、能换绑邮箱" />
          </Field>
          <Field label="指定中介" error={err.preferredAgentId} hint="可选。指定后这位中介会收到通知并优先跟进">
            <Select name="preferredAgentId" defaultValue={v.preferredAgentId ?? ""}>
              <option value="">不指定，下单时再选或由平台分派</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username}
                  {a.agentIntro ? ` · ${a.agentIntro}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {state.message && <Alert kind="error">{state.message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText={isCreate ? "发布中…" : "保存中…"}>{isCreate ? "发布求购" : "保存修改"}</SubmitButton>
        <span className="text-xs text-zinc-500">{isCreate ? "发布即公开，不经审核；有违规内容平台会下架。" : "编辑不改变有效期。"}</span>
      </div>
    </form>
  );
}
