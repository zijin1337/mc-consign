import { z } from "zod";
import type { AttrField } from "@/db/schema";

export const usernameSchema = z
  .string()
  .trim()
  .min(2, "用户名至少 2 字")
  .max(16, "用户名最多 16 字")
  .regex(/^[\p{L}\p{N}_]+$/u, "用户名只能包含中英文、数字和下划线");

/** 用户名 30 天只能改一次 */
export const USERNAME_COOLDOWN_DAYS = 30;

/**
 * 距下次可改还剩几天。0 表示现在就能改，从没改过（null）也是 0。
 * 向上取整，避免不足一天的余量显示成 0 天却仍被拒。
 */
export function usernameCooldownDaysLeft(changedAt: Date | null, now: Date = new Date()): number {
  if (!changedAt) return 0;
  const left = USERNAME_COOLDOWN_DAYS - (now.getTime() - changedAt.getTime()) / 86_400_000;
  return left <= 0 ? 0 : Math.ceil(left);
}

export const passwordSchema = z.string().min(8, "密码至少 8 位").max(64, "密码最多 64 位");

export const qqSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{4,11}$/, "QQ 号必须是 5～12 位数字");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号必须是 11 位数字");

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "验证码必须是 6 位数字");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  qq: qqSchema,
  phone: phoneSchema,
  code: codeSchema,
  agree: z.literal("on", { error: "请先阅读并同意用户协议" }),
});

export const loginSchema = z.object({
  account: z.string().trim().min(1, "请填写用户名或 QQ 号"),
  password: z.string().min(1, "请填写密码"),
});

export const resetPasswordSchema = z.object({
  qq: qqSchema,
  code: codeSchema,
  password: passwordSchema,
});

export const listingBaseSchema = z.object({
  price: z.coerce.number().int("价格必须是整数").min(1, "价格至少 1 元").max(999_999, "价格不能超过 999,999 元"),
  feeMode: z.enum(["all_in", "exclusive"], { error: "请选择中介费方式" }),
  source: z.enum(["self_bought", "mfa", "second_hand"], { error: "请选择账号来源" }),
  hasTransactionId: z.enum(["true", "false"], { error: "请选择能否提供交易 ID" }).transform((v) => v === "true"),
  contact: z.string().trim().min(1, "请填写联系方式").max(100, "联系方式最多 100 字"),
  note: z.string().trim().max(200, "补充说明最多 200 字").optional().default(""),
  preferredAgentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().positive().nullable()),
});

export type ListingBaseInput = z.infer<typeof listingBaseSchema>;

/**
 * 从 FormData 读取游戏属性并按模板校验。返回 { attrs } 或 { errors }。
 * bool 字段来自 "true"/"false" 单选；multi_enum 来自多个同名 checkbox。
 */
export function parseAttrs(
  fields: AttrField[],
  form: FormData,
): { attrs: Record<string, unknown>; errors: Record<string, string> } {
  const attrs: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const thisYear = new Date().getFullYear();

  for (const f of fields) {
    const name = `attr_${f.key}`;
    if (f.type === "multi_enum") {
      const vals = form.getAll(name).map(String);
      const bad = vals.find((v) => !f.options?.includes(v));
      if (bad) errors[f.key] = `${f.label}的选项无效，请刷新后重选`;
      else attrs[f.key] = vals;
      continue;
    }
    const raw = form.get(name);
    const s = raw === null ? "" : String(raw).trim();
    if (!s) {
      if (f.required) errors[f.key] = `请填写${f.label}`;
      else attrs[f.key] = f.type === "bool" ? false : null;
      continue;
    }
    switch (f.type) {
      case "int": {
        const n = Number(s);
        if (!Number.isInteger(n) || n < 0 || n > 100_000) errors[f.key] = `${f.label}必须是 0～100000 的整数`;
        else attrs[f.key] = n;
        break;
      }
      case "enum":
        if (!f.options?.includes(s)) errors[f.key] = `${f.label}的选项无效，请刷新后重选`;
        else attrs[f.key] = s;
        break;
      case "text":
        if (s.length > 50) errors[f.key] = `${f.label}最多 50 字`;
        else if (f.pattern && !new RegExp(f.pattern, "u").test(s)) errors[f.key] = f.patternMessage ?? `${f.label}格式不正确`;
        else attrs[f.key] = s;
        break;
      case "year": {
        const n = Number(s);
        if (!Number.isInteger(n) || n < 2009 || n > thisYear) errors[f.key] = `${f.label}必须在 2009～${thisYear} 之间`;
        else attrs[f.key] = n;
        break;
      }
      case "bool":
        if (s !== "true" && s !== "false") errors[f.key] = `请选择${f.label}`;
        else attrs[f.key] = s === "true";
        break;
    }
  }
  return { attrs, errors };
}

/** 把 zod 错误压成 { 字段: 第一条消息 } */
export function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** 可留空的整数字段：空串 → null，其余必须是范围内整数 */
function optionalInt(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number({ error: `${label}必须是数字` }).int(`${label}必须是整数`).min(min, `${label}不能小于 ${min}`).max(max, `${label}不能超过 ${max}`).nullable());
}

/** 求购单表单。ranks / capes 多选在 action 里按游戏模板校验，不在这里 */
export const wantedSchema = z
  .object({
    minLevel: optionalInt("最低等级", 0, 100_000),
    budgetMin: optionalInt("预算下限", 1, 999_999),
    budgetMax: z.coerce.number({ error: "请填写预算上限" }).int("预算上限必须是整数").min(1, "预算上限至少 1 元").max(999_999, "预算上限不能超过 999,999 元"),
    requirements: z.string().trim().max(300, "其他要求最多 300 字").optional().default(""),
    preferredAgentId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v) : null))
      .pipe(z.number().int().positive().nullable()),
    /** 有效期（天）。编辑时不改有效期，允许为空；发布时 action 要求必填 */
    days: optionalInt("有效期", 7, 90),
  })
  .refine((d) => d.budgetMin === null || d.budgetMin <= d.budgetMax, { path: ["budgetMin"], message: "预算下限不能高于上限" });

export type WantedInput = z.infer<typeof wantedSchema>;
