import { describe, expect, it } from "vitest";
import { WANTED_OFFER_STATUS_CLASS, WANTED_STATUS_CLASS } from "../labels";
import { formatBudget, isOfferActionable, isWantedActive, renderWantedTitle, wantedConditionTags, wantedDaysLeft, wantedDisplayStatus } from "../wanted-shared";

describe("求购标题与条件标签", () => {
  it("全部条件都填时逐段拼接", () => {
    expect(renderWantedTitle({ ranks: ["MVP+", "MVP++"], minLevel: 100, capes: ["官方"], budgetMin: 3000, budgetMax: 5000 })).toBe("MVP+/MVP++ · 100 级以上 · 官方披风 · 预算 ¥3,000～¥5,000");
  });
  it("没填的条件显示为不限，只有上限时显示以内", () => {
    expect(renderWantedTitle({ ranks: [], minLevel: null, capes: [], budgetMin: null, budgetMax: 800 })).toBe("会员不限 · 等级不限 · 预算 ¥800 以内");
    expect(wantedConditionTags({ ranks: [], minLevel: 0, capes: [] })).toEqual(["会员不限", "等级不限"]);
    expect(formatBudget(null, 5000)).toBe("¥5,000 以内");
    expect(formatBudget(1000, 5000)).toBe("¥1,000～¥5,000");
  });
});

describe("求购展示状态", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const day = 86400_000;
  it("求购中且到期显示为已过期，其余照原状态", () => {
    expect(wantedDisplayStatus({ status: "open", expiresAt: new Date(now.getTime() + day) }, now)).toBe("open");
    expect(wantedDisplayStatus({ status: "open", expiresAt: now }, now)).toBe("expired");
    expect(wantedDisplayStatus({ status: "closed", expiresAt: new Date(now.getTime() - day) }, now)).toBe("closed");
    expect(isWantedActive({ status: "open", expiresAt: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isWantedActive({ status: "fulfilled", expiresAt: new Date(now.getTime() + day) }, now)).toBe(false);
  });
  it("剩余天数向上取整，过期为 0", () => {
    expect(wantedDaysLeft(new Date(now.getTime() + 1.2 * day), now)).toBe(2);
    expect(wantedDaysLeft(new Date(now.getTime() - day), now)).toBe(0);
  });
  it("只有待回应且账号在售的推荐能被采纳", () => {
    expect(isOfferActionable({ status: "pending", listingStatus: "on_sale" })).toBe(true);
    expect(isOfferActionable({ status: "pending", listingStatus: "in_trade" })).toBe(true);
    expect(isOfferActionable({ status: "pending", listingStatus: "sold" })).toBe(false);
    expect(isOfferActionable({ status: "accepted", listingStatus: "on_sale" })).toBe(false);
  });
});

describe("求购状态徽章遵守荧光绿规则", () => {
  it("徽章类名里没有 lime", () => {
    for (const [k, v] of Object.entries(WANTED_STATUS_CLASS)) expect(v, `WANTED_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    for (const [k, v] of Object.entries(WANTED_OFFER_STATUS_CLASS)) expect(v, `WANTED_OFFER_STATUS_CLASS.${k}`).not.toMatch(/lime/);
  });
});
