import type { AttrField } from "@/db/schema";

/** 第一版唯一的游戏模板：Minecraft / Hypixel。见大纲 3.2 */
export const MC_GAME_CODE = "mc";
export const MC_GAME_NAME = "Minecraft";

export const MC_RANKS = ["无", "VIP", "VIP+", "MVP", "MVP+", "MVP++"] as const;
export const MC_CAPES = ["官方", "OF"] as const;

export const MC_ATTR_SCHEMA: AttrField[] = [
  { key: "level", label: "Hypixel 等级", type: "int", required: true, publicInList: true },
  { key: "rank", label: "会员类型", type: "enum", options: [...MC_RANKS], required: true, publicInList: true },
  {
    key: "ign",
    label: "正版 ID",
    type: "text",
    required: true,
    publicInList: true,
    hint: "游戏内名称，买家可到战绩站核对",
    pattern: "^[A-Za-z0-9_]{1,16}$",
    patternMessage: "正版 ID 必须是 1～16 位字母、数字或下划线",
  },
  { key: "capes", label: "披风", type: "multi_enum", options: [...MC_CAPES], required: false, publicInList: true },
  { key: "canRebindEmail", label: "能否换绑邮箱", type: "bool", required: true, publicInList: false, boolLabels: ["能", "不能"] },
  { key: "hasBanRecord", label: "Hypixel 封禁记录", type: "bool", required: true, publicInList: false, boolLabels: ["有", "无"] },
  { key: "banNote", label: "封禁说明", type: "text", required: false, publicInList: false, hint: "有封禁记录时填写" },
  { key: "regYear", label: "注册年份", type: "year", required: false, publicInList: false },
];

/** 标题模板，占位符对应 attrs 里的 key */
export const MC_TITLE_TEMPLATE = "{rank} · {level} 级 · {ign}";

export function renderTitle(template: string, attrs: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = attrs[key];
    if (v === undefined || v === null || v === "") return "";
    return Array.isArray(v) ? v.join("/") : String(v);
  });
}
