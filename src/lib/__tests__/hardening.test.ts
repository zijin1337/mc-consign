import { describe, expect, it } from "vitest";
import { safeNext } from "../../actions/types";
import { parseId, parseIntParam, parsePage } from "../ids";

describe("safeNext 回跳地址", () => {
  it("站内相对路径原样放行", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/listings/12?x=1#a")).toBe("/listings/12?x=1#a");
  });
  it("外站与各种伪装一律回到首页", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/\\\\evil.com")).toBe("/");
    expect(safeNext("/ /evil.com")).toBe("/");
    expect(safeNext("/%5Cevil.com")).toBe("/%5Cevil.com");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("/" + "a".repeat(3000))).toBe("/");
  });
});

describe("路由与分页参数收敛", () => {
  it("id 只接受 15 位以内的正整数", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId("0")).toBeNull();
    expect(parseId("abc")).toBeNull();
    expect(parseId("1e20")).toBeNull();
    expect(parseId("100000000000000000000")).toBeNull();
    expect(parseId("1.5")).toBeNull();
    expect(parseId(undefined)).toBeNull();
  });
  it("页码乱值回到第一页并有上限", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("1.3")).toBe(1);
    expect(parsePage("1e20")).toBe(1);
    expect(parsePage("-4")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("9999999")).toBe(1);
    expect(parsePage("100000")).toBe(100000);
  });
  it("筛选整数乱值当作没填，超出上限截断", () => {
    expect(parseIntParam("120")).toBe(120);
    expect(parseIntParam("1.5")).toBeUndefined();
    expect(parseIntParam("3000000000", 100_000)).toBe(100_000);
    expect(parseIntParam("")).toBeUndefined();
    expect(parseIntParam("-1")).toBeUndefined();
  });
});
