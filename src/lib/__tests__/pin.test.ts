import { describe, expect, it } from "vitest";
import { extendPin, formatRemaining, isPinActive } from "../pin";

const NOW = new Date("2026-09-05T12:00:00+08:00");
const H = 3_600_000;
const D = 24 * H;

describe("isPinActive", () => {
  it("空值与过期都不算置顶", () => {
    expect(isPinActive(null, NOW)).toBe(false);
    expect(isPinActive(new Date(NOW.getTime() - 1), NOW)).toBe(false);
  });
  it("未来时间算置顶，字符串也行", () => {
    expect(isPinActive(new Date(NOW.getTime() + 1), NOW)).toBe(true);
    expect(isPinActive(new Date(NOW.getTime() + D).toISOString(), NOW)).toBe(true);
  });
});

describe("extendPin", () => {
  it("未置顶时从现在开始算", () => {
    expect(extendPin(null, 7, "days", NOW)?.getTime()).toBe(NOW.getTime() + 7 * D);
    expect(extendPin(null, 6, "hours", NOW)?.getTime()).toBe(NOW.getTime() + 6 * H);
  });
  it("已过期的旧置顶不叠加，从现在开始", () => {
    const expired = new Date(NOW.getTime() - 5 * D);
    expect(extendPin(expired, 1, "days", NOW)?.getTime()).toBe(NOW.getTime() + D);
  });
  it("置顶中则从当前截止时间往后延", () => {
    const cur = new Date(NOW.getTime() + 2 * D);
    expect(extendPin(cur, 3, "days", NOW)?.getTime()).toBe(NOW.getTime() + 5 * D);
  });
  it("不足 1 小时或累计超过 365 天拒绝", () => {
    expect(extendPin(null, 0, "days", NOW)).toBeNull();
    expect(extendPin(null, -3, "days", NOW)).toBeNull();
    expect(extendPin(null, 366, "days", NOW)).toBeNull();
    expect(extendPin(new Date(NOW.getTime() + 360 * D), 10, "days", NOW)).toBeNull();
    expect(extendPin(null, 365, "days", NOW)).not.toBeNull();
  });
});

describe("formatRemaining", () => {
  it("按天、小时、分钟给人话", () => {
    expect(formatRemaining(new Date(NOW.getTime() + 2 * D + 3 * H), NOW)).toBe("2 天 3 小时");
    expect(formatRemaining(new Date(NOW.getTime() + 2 * D), NOW)).toBe("2 天");
    expect(formatRemaining(new Date(NOW.getTime() + 5 * H), NOW)).toBe("5 小时");
    expect(formatRemaining(new Date(NOW.getTime() + 40 * 60_000), NOW)).toBe("40 分钟");
    expect(formatRemaining(new Date(NOW.getTime() + 10_000), NOW)).toBe("1 分钟");
  });
  it("过期显示已到期", () => {
    expect(formatRemaining(new Date(NOW.getTime() - 1), NOW)).toBe("已到期");
    expect(formatRemaining(null, NOW)).toBe("已到期");
  });
});
