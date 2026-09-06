"use client";

import { useActionState, useCallback, useState } from "react";
import { createListing, updateListing } from "@/actions/listings";
import type { FormState } from "@/actions/types";
import type { AttrField } from "@/db/schema";
import { attrDefaults } from "@/lib/attrs";
import { imageUrl } from "@/lib/image-url";
import { FEE_MODE_HINT, FEE_MODE_LABEL, SOURCE_LABEL } from "@/lib/labels";
import { CoverBadge } from "./cover-badge";
import { HypixelLookupButton } from "./hypixel/lookup-button";
import { ImageUploader, type UploadState } from "./image-uploader";
import { SubmitButton } from "./submit-button";
import { Alert, Card, Field, Input, RadioGroup, Select, Textarea } from "./ui";

export interface ListingFormListing {
  id: number;
  price: number;
  feeMode: "all_in" | "exclusive";
  source: "self_bought" | "mfa" | "second_hand";
  hasTransactionId: boolean;
  contact: string;
  note: string | null;
  preferredAgentId: number | null;
  attrs: Record<string, unknown>;
  images: Array<{ id: number; path: string }>;
}

export function ListingForm({
  mode,
  fields,
  agents,
  listing,
  defaultContact,
  action: customAction,
  submitText,
  footnote,
  hypixelEnabled = false,
}: {
  mode: "create" | "edit";
  fields: AttrField[];
  agents: Array<{ id: number; username: string; agentIntro: string | null }>;
  listing?: ListingFormListing;
  defaultContact?: string;
  /** 超管编辑时传入自己的 action */
  action?: (prev: FormState, form: FormData) => Promise<FormState>;
  submitText?: string;
  footnote?: string;
  /** 配了 Hypixel API 时在正版 ID 旁显示「从 Hypixel 拉取」 */
  hypixelEnabled?: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(customAction ?? (mode === "create" ? createListing : updateListing), {});
  const [upload, setUpload] = useState<UploadState>({ uploading: 0, done: 0 });
  const [imagesError, setImagesError] = useState<string | null>(null);
  // 稳定引用，避免上传器的 effect 每次渲染都回调
  const onUploadChange = useCallback((s: UploadState) => {
    setUpload((prev) => (prev.uploading === s.uploading && prev.done === s.done ? prev : s));
    if (s.done > 0) setImagesError(null);
  }, []);

  // 回填优先级：本次提交的值 > 已有商品 > 空
  const initial: Record<string, string> = listing
    ? {
        price: String(listing.price),
        feeMode: listing.feeMode,
        source: listing.source,
        hasTransactionId: listing.hasTransactionId ? "true" : "false",
        contact: listing.contact,
        note: listing.note ?? "",
        preferredAgentId: listing.preferredAgentId ? String(listing.preferredAgentId) : "",
      }
    : { contact: defaultContact ?? "" };
  const attrInit = attrDefaults(fields, listing?.attrs);
  for (const [k, v] of Object.entries(attrInit)) initial[`attr_${k}`] = Array.isArray(v) ? v.join(",") : v;
  const v = { ...initial, ...(state.values ?? {}) };
  const err = state.errors ?? {};
  const existingImages = listing?.images ?? [];

  return (
    <form action={action} className="space-y-5">
      {listing && <input type="hidden" name="id" value={listing.id} />}

      <Card title="账号属性">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const name = `attr_${f.key}`;
            const val = v[name] ?? "";
            const common = { label: f.label, error: err[name], hint: f.hint, required: f.required };
            switch (f.type) {
              case "int":
              case "year":
                return (
                  <Field key={f.key} {...common}>
                    <Input name={name} type="number" inputMode="numeric" defaultValue={val} min={f.type === "year" ? 2009 : 0} />
                  </Field>
                );
              case "text":
                return (
                  <Field key={f.key} {...common}>
                    {f.key === "ign" && hypixelEnabled ? (
                      <div className="flex items-start gap-2">
                        <Input name={name} defaultValue={val} maxLength={50} className="min-w-0 flex-1" />
                        <HypixelLookupButton />
                      </div>
                    ) : (
                      <Input name={name} defaultValue={val} maxLength={50} />
                    )}
                  </Field>
                );
              case "enum":
                return (
                  <Field key={f.key} {...common}>
                    <Select name={name} defaultValue={val}>
                      <option value="">请选择</option>
                      {f.options?.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </Select>
                  </Field>
                );
              case "bool":
                return (
                  <Field key={f.key} {...common} group>
                    <RadioGroup
                      name={name}
                      defaultValue={val}
                      options={[
                        { value: "true", label: f.boolLabels?.[0] ?? "是" },
                        { value: "false", label: f.boolLabels?.[1] ?? "否" },
                      ]}
                    />
                  </Field>
                );
              case "multi_enum": {
                const selected = new Set(val ? val.split(",") : []);
                return (
                  <Field key={f.key} {...common} group>
                    <div className="flex flex-wrap gap-2">
                      {f.options?.map((o) => (
                        <label key={o} className="flex cursor-pointer items-center gap-2 rounded-none border border-white/15 bg-card px-3 py-2 text-sm has-[:checked]:border-lime-300/60 has-[:checked]:bg-lime-300/[0.08]">
                          <input type="checkbox" name={name} value={o} defaultChecked={selected.has(o)} />
                          {o}
                        </label>
                      ))}
                      <span className="self-center text-xs text-zinc-500">都不选表示无</span>
                    </div>
                  </Field>
                );
              }
            }
          })}
        </div>
      </Card>

      <Card title="交易信息">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="价格（元）" error={err.price} required>
            <Input name="price" type="number" inputMode="numeric" min={1} defaultValue={v.price} />
          </Field>
          <Field label="账号来源" error={err.source} required>
            <Select name="source" defaultValue={v.source ?? ""}>
              <option value="">请选择</option>
              {Object.entries(SOURCE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="中介费方式" error={err.feeMode} required group>
            <RadioGroup
              name="feeMode"
              defaultValue={v.feeMode}
              options={(["all_in", "exclusive"] as const).map((k) => ({ value: k, label: FEE_MODE_LABEL[k], hint: FEE_MODE_HINT[k] }))}
            />
          </Field>
          <Field label="能否提供交易 ID" error={err.hasTransactionId} required group>
            <RadioGroup name="hasTransactionId" defaultValue={v.hasTransactionId} options={[{ value: "true", label: "能" }, { value: "false", label: "不能" }]} />
          </Field>
          <Field label="联系方式" error={err.contact} hint="QQ 或微信。只有跟进你意向单的中介和平台能看到，买家看不到" required>
            <Input name="contact" defaultValue={v.contact} maxLength={100} />
          </Field>
          <Field label="指定中介" error={err.preferredAgentId} hint="指定后这个账号的所有意向单都由这位中介处理">
            <Select name="preferredAgentId" defaultValue={v.preferredAgentId ?? ""}>
              <option value="">不指定，由买家选择或平台分派</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.username}
                  {a.agentIntro ? ` · ${a.agentIntro}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="补充说明" error={err.note} hint="最多 200 字，不要写联系方式，不得出现违禁词" className="sm:col-span-2">
            <Textarea name="note" defaultValue={v.note} maxLength={200} />
          </Field>
        </div>
      </Card>

      <Card title="游戏截图">
        {existingImages.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-sm text-zinc-400">已有截图，第一张是封面。勾选「删除」的截图会在保存后移除，其余顺序前移。</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {existingImages.map((img, i) => (
                <label key={img.id} className="relative block cursor-pointer overflow-hidden rounded-none border border-white/10 has-[:checked]:border-rose-400/60 has-[:checked]:opacity-60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl(img.path)} alt="" className="aspect-[16/10] w-full object-cover" />
                  {i === 0 && <CoverBadge />}
                  <span className="absolute right-1 top-1 flex items-center gap-1 rounded-none bg-background/85 px-1.5 py-0.5 text-xs text-zinc-200">
                    {/* 删除是危险动作：选中填玫红，压过 base 层的荧光绿 */}
                    <input type="checkbox" name="removeImage" value={img.id} className="checked:border-rose-400 checked:bg-rose-400" />
                    删除
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <Field
          label={listing ? "新增截图" : "上传截图"}
          error={imagesError ?? err.images}
          hint="1～9 张，jpg / png / webp，单张 5MB 以内。选中即上传，会压缩并加水印，原图不保留。"
          required={!listing}
          group
        >
          <ImageUploader existingCount={existingImages.length} onChange={onUploadChange} />
        </Field>
      </Card>

      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          pendingText="提交中…"
          disabled={upload.uploading > 0}
          onClick={(e) => {
            // 新建时没有一张上传成功的截图，不用跑到服务器再报错
            if (mode === "create" && upload.done === 0) {
              e.preventDefault();
              setImagesError("请至少上传 1 张游戏截图");
            }
          }}
        >
          {upload.uploading > 0 ? `等待 ${upload.uploading} 张截图上传完成…` : submitText ?? (mode === "create" ? "提交审核" : "保存修改")}
        </SubmitButton>
        <span className="text-xs text-zinc-500">{footnote ?? (mode === "create" ? "提交后进入审核，通过后才会在账号市场展示。" : "保存后会重新审核，通过后才会展示。")}</span>
      </div>
    </form>
  );
}
