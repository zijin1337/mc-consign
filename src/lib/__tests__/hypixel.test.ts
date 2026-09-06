import { describe, expect, it } from "vitest";
import { compareSnapshot } from "../hypixel/compare";
import { accountAge, deriveRank, fmtCoins, rankToMcRank, relativeTime } from "../hypixel/labels";
import { bedwarsLevel, bedwarsPrestige, catacombsLevel, networkExpForLevel, networkLevel, networkProgress, skillLevel, skywarsLevel, slayerLevel } from "../hypixel/levels";
import { mockGuild, mockPlayer, mockProfiles, mockUuid } from "../hypixel/mock";
import { normalizePlayer, normalizeSkyblock } from "../hypixel/normalize";

describe("网络等级", () => {
  it("0 经验是 1 级，10000 经验是 2 级", () => {
    expect(networkLevel(0)).toBe(1);
    expect(networkLevel(10000)).toBeCloseTo(2, 6);
    expect(networkExpForLevel(1)).toBe(0);
    expect(networkExpForLevel(2)).toBe(10000);
  });
  it("进度按当前级区间算", () => {
    const p = networkProgress(5000);
    expect(p.level).toBe(1);
    expect(p.current).toBe(5000);
    expect(p.needed).toBe(10000);
    expect(p.progress).toBeCloseTo(0.5, 6);
  });
});

describe("起床战争星级", () => {
  it("每 487000 经验一个声望，前四级便宜", () => {
    expect(bedwarsLevel(0)).toBe(0);
    expect(bedwarsLevel(500)).toBe(1);
    expect(bedwarsLevel(1500)).toBe(2);
    expect(bedwarsLevel(3500)).toBe(3);
    expect(bedwarsLevel(7000)).toBe(4);
    expect(bedwarsLevel(12000)).toBe(5);
    expect(bedwarsLevel(487000)).toBe(100);
    expect(bedwarsLevel(487000 + 500)).toBe(101);
  });
  it("声望颜色与符号", () => {
    expect(bedwarsPrestige(50)).toEqual({ color: "#AAAAAA", rainbow: false, symbol: "✫" });
    expect(bedwarsPrestige(250).color).toBe("#FFAA00");
    expect(bedwarsPrestige(1000)).toEqual({ color: null, rainbow: true, symbol: "✫" });
    expect(bedwarsPrestige(1100).symbol).toBe("✪");
  });
});

describe("空岛战争等级", () => {
  it("表内查，15000 起每万一级", () => {
    expect(skywarsLevel(0)).toBe(1);
    expect(skywarsLevel(20)).toBe(2);
    expect(skywarsLevel(15000)).toBe(12);
    expect(skywarsLevel(25000)).toBe(13);
  });
});

describe("SkyBlock 技能 / 地牢 / 猎手", () => {
  it("技能按累计表，含进度与上限", () => {
    expect(skillLevel(0).level).toBe(0);
    expect(skillLevel(50).level).toBe(1);
    expect(skillLevel(100).exact).toBeCloseTo(1.4, 6);
    expect(skillLevel(394700, 50).level).toBe(50);
    expect(skillLevel(9_999_999, 50).exact).toBe(50);
    expect(skillLevel(882200, 60).level).toBe(60);
  });
  it("地牢与猎手", () => {
    expect(catacombsLevel(50).level).toBe(1);
    expect(catacombsLevel(569809640).level).toBe(50);
    expect(slayerLevel("zombie", 3)).toBe(0);
    expect(slayerLevel("zombie", 5)).toBe(1);
    expect(slayerLevel("zombie", 1_000_000)).toBe(9);
    expect(slayerLevel("vampire", 2400)).toBe(5);
    expect(slayerLevel("unknown", 99)).toBe(0);
  });
});

describe("会员推导", () => {
  it("特殊身份 > MVP++ > 购买会员", () => {
    expect(deriveRank({})).toBe("NONE");
    expect(deriveRank({ rank: "NORMAL", newPackageRank: "VIP" })).toBe("VIP");
    expect(deriveRank({ newPackageRank: "MVP_PLUS", monthlyPackageRank: "SUPERSTAR" })).toBe("MVP_PLUS_PLUS");
    expect(deriveRank({ rank: "YOUTUBER", newPackageRank: "MVP_PLUS" })).toBe("YOUTUBER");
    expect(deriveRank({ packageRank: "MVP" })).toBe("MVP");
  });
  it("映射到平台会员类型", () => {
    expect(rankToMcRank("MVP_PLUS")).toBe("MVP+");
    expect(rankToMcRank("MVP_PLUS_PLUS")).toBe("MVP++");
    expect(rankToMcRank("NONE")).toBe("无");
    expect(rankToMcRank("YOUTUBER")).toBeNull();
  });
});

describe("格式化", () => {
  const now = Date.UTC(2026, 8, 5, 12);
  it("账号年龄", () => {
    expect(accountAge(now - 20 * 86_400_000, now)).toBe("20 天");
    expect(accountAge(now - 400 * 86_400_000, now)).toBe("1 年 1 个月");
    expect(accountAge(null, now)).toBe("-");
  });
  it("相对时间与金币缩写", () => {
    expect(relativeTime(now - 30_000, now)).toBe("刚刚");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 天前");
    expect(fmtCoins(1_234_567)).toBe("1.23M");
    expect(fmtCoins(999)).toBe("999");
  });
});

describe("快照核对", () => {
  const snap = { uuid: "u", name: "X", level: 120, rank: "MVP+", rankRaw: "MVP+", fetchedAt: 0 };
  it("等级差 1 以内且会员相同为一致", () => {
    expect(compareSnapshot({ level: 121, rank: "MVP+" }, snap).status).toBe("match");
    expect(compareSnapshot({ level: 110, rank: "MVP+" }, snap).status).toBe("mismatch");
    expect(compareSnapshot({ level: 120, rank: "VIP" }, snap).status).toBe("mismatch");
    expect(compareSnapshot({ level: 120, rank: "VIP" }, null).status).toBe("none");
  });
  it("特殊身份不比对会员，只算部分核对，不打「一致」标", () => {
    expect(compareSnapshot({ level: 120, rank: "MVP+" }, { ...snap, rank: null, rankRaw: "YOUTUBE" }).status).toBe("partial");
    expect(compareSnapshot({ level: 90, rank: "MVP+" }, { ...snap, rank: null, rankRaw: "YOUTUBE" }).status).toBe("mismatch");
  });
});

describe("归一化能吃下模拟数据", () => {
  const uuid = mockUuid("Notch");
  it("伪 uuid 稳定且 32 位十六进制", () => {
    expect(uuid).toMatch(/^[0-9a-f]{32}$/);
    expect(mockUuid("notch")).toBe(uuid);
    expect(mockUuid("Dream")).not.toBe(uuid);
  });
  it("player 归一化字段齐全", () => {
    const s = normalizePlayer(mockPlayer(uuid, "Notch"), mockGuild(uuid));
    expect(s.uuid).toBe(uuid);
    expect(s.name).toBe("Notch");
    expect(s.networkExp).toBeGreaterThan(0);
    expect(s.games.map((g) => g.key)).toContain("Bedwars");
    expect(s.games.find((g) => g.key === "Bedwars")?.stats.find((st) => st.label === "FKDR")?.value).toMatch(/^\d+\.\d{2}$/);
    expect(s.questsCompleted).toBeGreaterThan(0);
  });
  it("skyblock 归一化", () => {
    const sb = normalizeSkyblock(mockProfiles(uuid), uuid)!;
    expect(sb).not.toBeNull();
    expect(sb.skills).toHaveLength(8);
    expect(sb.skillAverage).toBeGreaterThan(0);
    expect(sb.catacombs?.level).toBeGreaterThanOrEqual(0);
    expect(sb.purse).not.toBeNull();
  });
  it("空数据不崩", () => {
    const s = normalizePlayer({ uuid }, null);
    expect(s.games).toEqual([]);
    expect(s.rank).toBe("NONE");
    expect(normalizeSkyblock([], uuid)).toBeNull();
    expect(normalizeSkyblock(null, uuid)).toBeNull();
  });
});
