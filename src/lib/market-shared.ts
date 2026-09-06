/**
 * 首页 / 置顶栏账号卡的数据收窄与首层筛选常量。前后端与单元测试共用，不能引 server-only 模块，也不能引数据库。
 *
 * 规则：游客只看氛围与概览（价格、会员类型、有无披风、信用分），登录后才看完整资料（正版 ID、等级、披风种类、UUID、核对标）。
 * 收窄在服务端做（listings.ts 调 toMarketCard），游客拿到的对象里根本没有能识别账号的字段，不是前端藏起来。
 */
import { compareSnapshot } from "./hypixel/compare";
import type { ApiSnapshot } from "./hypixel/types";
import { isPinActive } from "./pin";

export type MarketViewer = "guest" | "member";

/** 首页 / 置顶栏账号卡的数据。游客与登录用户共用一个类型，游客的私密字段一律 null / [] / false */
export interface MarketCard {
  id: number;
  price: number;
  feeMode: "all_in" | "exclusive";
  status: "on_sale" | "in_trade";
  pinned: boolean;
  sellerCredit: number;
  approvedAt: Date | null;
  /** 会员类型，公开；无会员为 "无" */
  rank: string;
  /** 是否有披风（只说有无，不说种类），公开 */
  hasCape: boolean;
  /** 以下只在 member 时有值 */
  ign: string | null;
  level: number | null;
  capes: string[];
  mcUuid: string | null;
  /** 卖家上传的第一张截图，只给登录用户 */
  cover: string | null;
  /** 卖家填写与 Hypixel 官方快照核对一致（compareSnapshot(...).status === "match"） */
  verified: boolean;
}

/** toMarketCard 的输入：列表查询的原始行 */
export interface MarketCardRaw {
  id: number;
  price: number;
  feeMode: "all_in" | "exclusive";
  status: string;
  pinnedUntil: Date | null;
  attrs: Record<string, unknown>;
  apiSnapshot: unknown;
  approvedAt: Date | null;
  mcUuid: string | null;
  cover: string | null;
  sellerCredit: number;
}

/** 原始行 → 卡片数据。attrs 只读 publicKeys 里的键；viewer 为 guest 时抹掉私密字段 */
export function toMarketCard(raw: MarketCardRaw, viewer: MarketViewer, publicKeys: ReadonlySet<string>, now: Date = new Date()): MarketCard {
  // 公开列表只带模板里标了 publicInList 的属性，以后新增非公开属性不会顺着 attrs 整包漏出去
  const attrs = Object.fromEntries(Object.entries(raw.attrs).filter(([k]) => publicKeys.has(k)));
  const member = viewer === "member";
  const rank = typeof attrs.rank === "string" && attrs.rank.trim() !== "" ? attrs.rank : "无";
  // 披风种类只保留字符串项，有无与种类都从这一份算，不会出现「有披风但列表为空」
  const capes = Array.isArray(attrs.capes) ? attrs.capes.filter((c): c is string => typeof c === "string") : [];
  const level = typeof attrs.level === "number" && Number.isFinite(attrs.level) ? attrs.level : null;
  const snap = raw.apiSnapshot && typeof raw.apiSnapshot === "object" ? (raw.apiSnapshot as ApiSnapshot) : null;
  return {
    id: raw.id,
    price: raw.price,
    feeMode: raw.feeMode,
    // 调用方已按 on_sale / in_trade 过滤，这里只做类型断言
    status: raw.status as MarketCard["status"],
    pinned: isPinActive(raw.pinnedUntil, now),
    sellerCredit: raw.sellerCredit,
    approvedAt: raw.approvedAt,
    rank,
    hasCape: capes.length > 0,
    ign: member && typeof attrs.ign === "string" ? attrs.ign : null,
    level: member ? level : null,
    capes: member ? capes : [],
    mcUuid: member ? raw.mcUuid : null,
    cover: member ? raw.cover : null,
    verified: member && compareSnapshot(attrs, snap).status === "match",
  };
}
