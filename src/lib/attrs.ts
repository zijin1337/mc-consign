import type { AttrField } from "@/db/schema";

/** 游戏属性的显示文案，前后端共用 */
export function formatAttr(f: AttrField, v: unknown): string {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
    return f.type === "multi_enum" ? "无" : "-";
  }
  switch (f.type) {
    case "bool":
      return v ? (f.boolLabels?.[0] ?? "是") : (f.boolLabels?.[1] ?? "否");
    case "multi_enum":
      return (v as string[]).join("、");
    default:
      return String(v);
  }
}

/** 把 attrs 转成表单可用的字符串默认值 */
export function attrDefaults(fields: AttrField[], attrs: Record<string, unknown> | undefined): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!attrs) return out;
  for (const f of fields) {
    const v = attrs[f.key];
    if (v === null || v === undefined) continue;
    if (f.type === "multi_enum") out[f.key] = Array.isArray(v) ? (v as string[]) : [];
    else if (f.type === "bool") out[f.key] = v ? "true" : "false";
    else out[f.key] = String(v);
  }
  return out;
}
