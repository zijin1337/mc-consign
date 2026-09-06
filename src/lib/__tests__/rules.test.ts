import { describe, expect, it } from "vitest";
import { maskUsername } from "../mask";
import { USERNAME_COOLDOWN_DAYS, usernameCooldownDaysLeft, usernameSchema } from "../validation";
import { calcFee, DEFAULT_FEE_TIERS, validateFeeTiers } from "../fee";
import { creditForDeal } from "../credit";
import { findBannedWord } from "../banned-words";
import { hashPassword, verifyPassword } from "../password";
import { renderTitle, MC_TITLE_TEMPLATE } from "../games/mc";

describe("maskUsername 用户名打码", () => {
  it("超过 4 字保留前 2 后 2，和大纲示例一致", () => {
    expect(maskUsername("包子sama")).toBe("包子***ma");
    expect(maskUsername("Baozisama")).toBe("Ba***ma");
  });
  it("3 到 4 字保留前 1 后 1", () => {
    expect(maskUsername("小申哥")).toBe("小***哥");
    expect(maskUsername("abcd")).toBe("a***d");
  });
  it("2 字以内全打码", () => {
    expect(maskUsername("小申")).toBe("***");
    expect(maskUsername("a")).toBe("***");
  });
});

describe("calcFee 中介费阶梯", () => {
  it("低价档固定金额", () => {
    expect(calcFee(50)).toBe(15);
    expect(calcFee(200)).toBe(15);
    expect(calcFee(201)).toBe(30);
    expect(calcFee(500)).toBe(30);
  });
  it("高价档按比例向上取整", () => {
    expect(calcFee(501)).toBe(31); // 501 * 6% = 30.06
    expect(calcFee(1000)).toBe(60);
    expect(calcFee(2001)).toBe(101); // 2001 * 5% = 100.05
    expect(calcFee(5000)).toBe(250);
  });
  it("非法金额为 0", () => {
    expect(calcFee(0)).toBe(0);
    expect(calcFee(-5)).toBe(0);
  });
  it("默认阶梯本身是合法的", () => {
    expect(validateFeeTiers(DEFAULT_FEE_TIERS)).toBeNull();
  });
  it("不连续的阶梯会被拒绝", () => {
    expect(
      validateFeeTiers([
        { min: 1, max: 100, type: "fixed", value: 10 },
        { min: 200, max: null, type: "percent", value: 5 },
      ]),
    ).toMatch(/不连续/);
  });
});

describe("creditForDeal 信用分", () => {
  it("每 10 元 1 分，向下取整", () => {
    expect(creditForDeal(300)).toBe(30);
    expect(creditForDeal(309)).toBe(30);
    expect(creditForDeal(9)).toBe(0);
  });
});

describe("findBannedWord 违禁词", () => {
  it("命中返回词本身", () => {
    expect(findBannedWord("出一个黑卡号")).toBe("黑卡");
  });
  it("空格和符号绕过无效", () => {
    expect(findBannedWord("黑 卡")).toBe("黑卡");
    expect(findBannedWord("黑.卡")).toBe("黑卡");
  });
  it("正常文本不命中", () => {
    expect(findBannedWord("自购正版，可提供交易 ID")).toBeNull();
  });
});

describe("password scrypt", () => {
  it("正确密码通过，错误密码不通过", async () => {
    const h = await hashPassword("hunter2!");
    expect(await verifyPassword("hunter2!", h)).toBe(true);
    expect(await verifyPassword("hunter3!", h)).toBe(false);
  });
});

describe("renderTitle 标题模板", () => {
  it("按 attrs 渲染", () => {
    expect(renderTitle(MC_TITLE_TEMPLATE, { rank: "MVP+", level: 120, ign: "Baozisama" })).toBe(
      "MVP+ · 120 级 · Baozisama",
    );
  });
});

describe("用户名改名规则（大纲第 2 节）", () => {
  const day = 86_400_000;
  const now = new Date("2026-09-06T12:00:00Z");

  it("从没改过时随时能改", () => {
    expect(usernameCooldownDaysLeft(null, now)).toBe(0);
  });
  it("满 30 天后能改", () => {
    expect(usernameCooldownDaysLeft(new Date(now.getTime() - USERNAME_COOLDOWN_DAYS * day), now)).toBe(0);
    expect(usernameCooldownDaysLeft(new Date(now.getTime() - 31 * day), now)).toBe(0);
  });
  it("刚改完要等满 30 天", () => {
    expect(usernameCooldownDaysLeft(now, now)).toBe(USERNAME_COOLDOWN_DAYS);
    expect(usernameCooldownDaysLeft(new Date(now.getTime() - 29 * day), now)).toBe(1);
  });
  it("不足一天的余量向上取整成 1 天，不会显示 0 天却仍被拒", () => {
    expect(usernameCooldownDaysLeft(new Date(now.getTime() - (30 * day - 60_000)), now)).toBe(1);
  });

  it("长度与字符集按大纲：2～16 字，中英文数字下划线", () => {
    expect(usernameSchema.safeParse("包子").success).toBe(true);
    expect(usernameSchema.safeParse("Baozi_2026").success).toBe(true);
    expect(usernameSchema.safeParse("a").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(17)).success).toBe(false);
    expect(usernameSchema.safeParse("包子 sama").success).toBe(false);
    expect(usernameSchema.safeParse("baozi@qq").success).toBe(false);
  });
});
