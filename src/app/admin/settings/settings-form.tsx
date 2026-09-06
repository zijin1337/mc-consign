"use client";

import { useActionState } from "react";
import { updateSettings } from "@/actions/admin";
import type { FormState } from "@/actions/types";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SETTING_LABELS, type Settings } from "@/lib/settings-shared";

const NUMERIC: Array<{ key: keyof Settings; hint: string }> = [
  { key: "warranty_days", hint: "成交后多少天内可以申请售后" },
  { key: "max_active_listings", hint: "待审核、在售、交易中的账号合计不超过此数" },
  { key: "min_credit_to_list", hint: "信用分低于此值不能发布账号" },
  { key: "max_open_orders", hint: "待分派、待联系、交易中的意向单合计不超过此数" },
  { key: "no_show_limit", hint: "累计爽约达到此次数后限制下单" },
  { key: "no_show_lock_days", hint: "达到次数后多少天内不能下单" },
  { key: "credit_penalty_aftersale", hint: "售后判定卖家责任时扣的信用分" },
  { key: "credit_penalty_no_show", hint: "买家每次爽约扣的信用分" },
  { key: "wanted_max_active", hint: "求购中的求购单不超过此数" },
  { key: "wanted_default_days", hint: "新发布的求购单展示天数，续期也按此天数" },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<FormState, FormData>(updateSettings, {});
  const err = state.errors ?? {};
  const rows = [...settings.fee_tiers, ...Array(Math.max(0, 8 - settings.fee_tiers.length)).fill(null)] as Array<Settings["fee_tiers"][number] | null>;

  return (
    <form action={action} className="space-y-5">
      <Card title="中介费阶梯">
        <p className="mb-3 text-sm text-zinc-400">
          按成交金额落入的区间整体计算，不累进。固定档填元，比例档填百分数，结果向上取整到元。最后一档上限留空表示无上限。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500">
                <th scope="col" className="px-2 py-1">档</th>
                <th scope="col" className="px-2 py-1">金额从（元）</th>
                <th scope="col" className="px-2 py-1">到（元）</th>
                <th scope="col" className="px-2 py-1">方式</th>
                <th scope="col" className="px-2 py-1">数值</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-zinc-600">{i + 1}</td>
                  <td className="px-2 py-1"><Input name={`tier_min_${i}`} type="number" defaultValue={t?.min ?? ""} className="w-28" /></td>
                  <td className="px-2 py-1"><Input name={`tier_max_${i}`} type="number" defaultValue={t?.max ?? ""} placeholder="留空为无上限" className="w-32" /></td>
                  <td className="px-2 py-1">
                    <Select name={`tier_type_${i}`} defaultValue={t?.type ?? "fixed"} className="w-28">
                      <option value="fixed">固定（元）</option>
                      <option value="percent">比例（%）</option>
                    </Select>
                  </td>
                  <td className="px-2 py-1"><Input name={`tier_value_${i}`} type="number" defaultValue={t?.value ?? ""} className="w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err.fee_tiers && <p className="mt-2 text-sm text-rose-300">{err.fee_tiers}</p>}
      </Card>

      <Card title="交易与信用规则">
        <div className="grid gap-4 sm:grid-cols-2">
          {NUMERIC.map(({ key, hint }) => (
            <Field key={key} label={SETTING_LABELS[key]} hint={hint} error={err[key]}>
              <Input name={key} type="number" min={0} defaultValue={String(settings[key])} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="展示">
        <label className="flex min-h-6 items-center gap-2 text-sm">
          <input type="checkbox" name="show_sold_price" defaultChecked={settings.show_sold_price} />
          {SETTING_LABELS.show_sold_price}
        </label>
        <Field label={SETTING_LABELS.announcement} hint="显示在首页顶部，留空不显示，300 字内" className="mt-4">
          <Textarea name="announcement" defaultValue={settings.announcement} maxLength={300} />
        </Field>
      </Card>

      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <SubmitButton>保存配置</SubmitButton>
    </form>
  );
}
