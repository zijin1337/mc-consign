import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ApiSnapshot } from "../hypixel/types";
import { toMarketCard, type MarketCardRaw } from "../market-shared";

/** 与 games/mc.ts 里 publicInList: true 的键一致 */
const PUBLIC_KEYS: ReadonlySet<string> = new Set(["level", "rank", "ign", "capes"]);
const now = new Date("2026-09-06T12:00:00Z");
const day = 86_400_000;
const UUID = "069a79f444e94726a5befca90e38aaf5";

const snap: ApiSnapshot = { uuid: UUID, name: "Notch", level: 120, rank: "MVP+", rankRaw: "MVP_PLUS", fetchedAt: now.getTime() };

function raw(over: Partial<MarketCardRaw> = {}): MarketCardRaw {
  return {
    id: 7,
    price: 4800,
    feeMode: "all_in",
    status: "on_sale",
    pinnedUntil: null,
    // 后四个是 publicInList: false 的私密属性，任何身份都不该看到
    attrs: { level: 120, rank: "MVP+", ign: "Notch", capes: ["官方", "OF"], canRebindEmail: true, hasBanRecord: true, banNote: "曾因作弊封 3 天", regYear: 2013 },
    apiSnapshot: snap,
    approvedAt: new Date(now.getTime() - day),
    mcUuid: UUID,
    cover: "uploads/2026/09/screenshot.jpg",
    sellerCredit: 98,
    ...over,
  };
}

describe("toMarketCard 按访问者身份收窄", () => {
  it("游客只拿概览：抹掉正版 ID / 等级 / 披风种类 / UUID / 核对标，保留价格、会员、有无披风、信用分", () => {
    const c = toMarketCard(raw(), "guest", PUBLIC_KEYS, now);
    // toStrictEqual 同时保证没有多余字段（attrs / title / apiSnapshot 都不能整包带出）
    expect(c).toStrictEqual({
      id: 7,
      price: 4800,
      feeMode: "all_in",
      status: "on_sale",
      pinned: false,
      sellerCredit: 98,
      approvedAt: new Date(now.getTime() - day),
      rank: "MVP+",
      hasCape: true,
      ign: null,
      level: null,
      capes: [],
      mcUuid: null,
      cover: null,
      verified: false,
    });
  });

  it("游客拿到的对象序列化后没有任何能识别账号的字符串", () => {
    const json = JSON.stringify(toMarketCard(raw(), "guest", PUBLIC_KEYS, now));
    for (const secret of ["Notch", UUID, "官方", "OF", "120", "screenshot"]) expect(json, secret).not.toContain(secret);
  });

  it("登录用户拿完整资料，快照一致时打核对标", () => {
    const c = toMarketCard(raw(), "member", PUBLIC_KEYS, now);
    expect(c).toStrictEqual({
      id: 7,
      price: 4800,
      feeMode: "all_in",
      status: "on_sale",
      pinned: false,
      sellerCredit: 98,
      approvedAt: new Date(now.getTime() - day),
      rank: "MVP+",
      hasCape: true,
      ign: "Notch",
      level: 120,
      capes: ["官方", "OF"],
      mcUuid: UUID,
      cover: "uploads/2026/09/screenshot.jpg",
      verified: true,
    });
  });

  it("核对标随快照一致与否变化：等级或会员对不上、没快照、特殊身份、快照是乱值都不打", () => {
    const member = (over: Partial<MarketCardRaw>) => toMarketCard(raw(over), "member", PUBLIC_KEYS, now).verified;
    expect(member({})).toBe(true);
    // 等级差 1 以内算一致
    expect(member({ attrs: { ...raw().attrs, level: 121 } })).toBe(true);
    expect(member({ attrs: { ...raw().attrs, level: 90 } })).toBe(false);
    expect(member({ apiSnapshot: { ...snap, rank: "VIP" } })).toBe(false);
    expect(member({ apiSnapshot: null })).toBe(false);
    expect(member({ apiSnapshot: undefined })).toBe(false);
    expect(member({ apiSnapshot: { ...snap, rank: null, rankRaw: "YOUTUBER" } })).toBe(false);
    expect(member({ apiSnapshot: "not-an-object" })).toBe(false);
    expect(member({ apiSnapshot: 42 })).toBe(false);
  });

  it("publicKeys 之外的属性不会进任何字段，登录用户也一样", () => {
    for (const viewer of ["guest", "member"] as const) {
      const json = JSON.stringify(toMarketCard(raw(), viewer, PUBLIC_KEYS, now));
      for (const secret of ["canRebindEmail", "hasBanRecord", "banNote", "作弊", "regYear", "2013"]) expect(json, `${viewer}: ${secret}`).not.toContain(secret);
    }
  });

  it("publicKeys 说了算：把 ign / capes 从公开键里拿掉，登录用户也拿不到，有无披风也跟着变成没有", () => {
    const c = toMarketCard(raw(), "member", new Set(["level", "rank"]), now);
    expect(c.ign).toBeNull();
    expect(c.capes).toEqual([]);
    expect(c.hasCape).toBe(false);
    expect(c.level).toBe(120);
    expect(c.rank).toBe("MVP+");
  });

  it("会员类型缺失、非字符串、空白串都算「无」", () => {
    const noRank = Object.fromEntries(Object.entries(raw().attrs).filter(([k]) => k !== "rank"));
    expect(toMarketCard(raw({ attrs: noRank }), "guest", PUBLIC_KEYS, now).rank).toBe("无");
    expect(toMarketCard(raw({ attrs: { ...raw().attrs, rank: 3 } }), "guest", PUBLIC_KEYS, now).rank).toBe("无");
    expect(toMarketCard(raw({ attrs: { ...raw().attrs, rank: "  " } }), "member", PUBLIC_KEYS, now).rank).toBe("无");
    expect(toMarketCard(raw({ attrs: { ...raw().attrs, rank: "无" } }), "member", PUBLIC_KEYS, now).rank).toBe("无");
  });

  it("有无披风只看非空字符串数组：空数组、缺失、非数组、全是乱值都算没有", () => {
    const hasCape = (capes: unknown) => toMarketCard(raw({ attrs: { ...raw().attrs, capes } }), "guest", PUBLIC_KEYS, now).hasCape;
    expect(hasCape([])).toBe(false);
    expect(hasCape(undefined)).toBe(false);
    expect(hasCape("官方")).toBe(false);
    expect(hasCape([1, 2])).toBe(false);
    expect(hasCape(["OF"])).toBe(true);
    // 登录用户的披风列表只保留字符串项，与有无披风来自同一份数据
    const mixed = toMarketCard(raw({ attrs: { ...raw().attrs, capes: ["官方", 7, null] } }), "member", PUBLIC_KEYS, now);
    expect(mixed.capes).toEqual(["官方"]);
    expect(mixed.hasCape).toBe(true);
  });

  it("登录用户的等级、正版 ID 只认正确类型，乱值当没填", () => {
    const level = (v: unknown) => toMarketCard(raw({ attrs: { ...raw().attrs, level: v } }), "member", PUBLIC_KEYS, now).level;
    expect(level(120)).toBe(120);
    expect(level("abc")).toBeNull();
    expect(level(NaN)).toBeNull();
    expect(level(undefined)).toBeNull();
    expect(toMarketCard(raw({ attrs: { ...raw().attrs, ign: 123 } }), "member", PUBLIC_KEYS, now).ign).toBeNull();
    expect(toMarketCard(raw({ mcUuid: null }), "member", PUBLIC_KEYS, now).mcUuid).toBeNull();
    expect(toMarketCard(raw({ cover: null }), "member", PUBLIC_KEYS, now).cover).toBeNull();
  });

  it("置顶按传入的 now 判断，游客也能看到置顶与交易中状态", () => {
    const future = new Date(now.getTime() + day);
    const past = new Date(now.getTime() - 1);
    expect(toMarketCard(raw({ pinnedUntil: future }), "guest", PUBLIC_KEYS, now).pinned).toBe(true);
    expect(toMarketCard(raw({ pinnedUntil: past }), "guest", PUBLIC_KEYS, now).pinned).toBe(false);
    expect(toMarketCard(raw({ pinnedUntil: future }), "member", PUBLIC_KEYS, now).pinned).toBe(true);
    expect(toMarketCard(raw({ status: "in_trade", feeMode: "exclusive" }), "guest", PUBLIC_KEYS, now)).toMatchObject({ status: "in_trade", feeMode: "exclusive" });
  });
});

describe("market-shared 是前后端共用模块", () => {
  it("源码不引 server-only、数据库、Drizzle 或 listings.ts", () => {
    const src = readFileSync(join(__dirname, "..", "market-shared.ts"), "utf8");
    // 只看 import 语句，注释里提到这些词不算
    expect(src).not.toMatch(/import\s+["']server-only["']/);
    expect(src).not.toMatch(/from\s+["'][^"']*(@\/db|\.\.\/db|drizzle)/);
    expect(src).not.toMatch(/from\s+["']\.\/listings["']/);
  });
});
