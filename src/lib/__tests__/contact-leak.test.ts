import { describe, expect, it } from "vitest";
import { findContactLeak } from "../contact-leak";

describe("联系方式外泄检测", () => {
  it("放行正常的求购描述", () => {
    for (const s of [
      "想要 MVP+ 以上，等级 150 左右，预算 3000-5000",
      "2019 年注册的老号优先，有官方披风加分",
      "能换绑邮箱，无封禁记录，价格 8000 以内",
      "等级 100000 以上（不可能但要能过）",
      "",
    ]) {
      expect(findContactLeak(s), s).toBeNull();
    }
    expect(findContactLeak(null)).toBeNull();
  });

  it("拦 QQ / 微信 / 手机 / 外链 / 长数字，全角数字也拦", () => {
    const cases: Array<[string, string]> = [
      ["加我QQ聊", "QQ"],
      ["扣扣私聊", "QQ"],
      ["加 vx 详谈", "微信"],
      ["微信同号", "微信"],
      ["tg 联系", "外部聊天工具"],
      ["看 https://example.com 的图", "外部链接"],
      ["去 baidu.com 搜", "外部链接"],
      ["13800138000", "手机号"],
      ["138 0013 8000", "手机号"],
      ["联系 123456789", "疑似 QQ 或手机号的长数字"],
      ["１２３４５６７８", "疑似 QQ 或手机号的长数字"],
    ];
    for (const [s, label] of cases) expect(findContactLeak(s), s).toBe(label);
  });
});
