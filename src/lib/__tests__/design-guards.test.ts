import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Price } from "../../components/price";
import { PAGE_WORD_SET } from "../eyebrow";
import { AFTERSALE_STATUS_CLASS, LISTING_STATUS_CLASS, ORDER_STATUS_CLASS, WANTED_OFFER_STATUS_CLASS, WANTED_STATUS_CLASS } from "../labels";

/**
 * 设计规则守卫（第二批 UI 打磨颁布的规则，见 globals.css 顶部注释）。
 * 这些都是「不再新增」型约束，只有机器守着才守得住。
 */

const ROOT = join(__dirname, "..", "..");
/** globals.css 里品牌绿的出现次数基线：#c8ff54 22 次、rgba(200,255,84) 10 次（2026-09 第二批打磨定稿，含顶部规则注释） */
const LIME_HEX_BASELINE = 22;
const LIME_RGB_BASELINE = 10;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// 测试文件自己会提到这些模式，不算 UI 源码
const files = walk(ROOT)
  .filter((p) => !p.includes("__tests__"))
  .map((p) => ({ path: relative(ROOT, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));

describe("eyebrow 词表", () => {
  it("除 ui.tsx 外不允许手写 className=\"eyebrow\"，必须走 <Eyebrow>", () => {
    const bad = files.filter((f) => f.path !== "components/ui.tsx" && /className=["'`][^"'`]*\beyebrow\b/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
  it("PageHeader / Eyebrow 的 section 只能是词表里的词", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.path === "components/ui.tsx") continue;
      for (const m of f.text.matchAll(/\b(?:eyebrow|section)=["']([^"']+)["']/g)) {
        if (!PAGE_WORD_SET.has(m[1])) bad.push(`${f.path}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("卡级 eyebrow 已取消，Card 不再接受 eyebrow 属性", () => {
    const ui = files.find((f) => f.path === "components/ui.tsx")!.text;
    const cardProps = ui.slice(ui.indexOf("export function Card("), ui.indexOf("export function Badge("));
    expect(cardProps).not.toMatch(/eyebrow/);
  });
});

describe("荧光绿只表达动作与已核验", () => {
  it("状态徽章文字里没有 lime（在售只允许 before: 方点）", () => {
    for (const [k, v] of Object.entries(LISTING_STATUS_CLASS)) {
      const withoutDot = v.replace(/before:[^\s]+/g, "");
      expect(withoutDot, `LISTING_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    }
    for (const [k, v] of Object.entries(ORDER_STATUS_CLASS)) expect(v, `ORDER_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    for (const [k, v] of Object.entries(AFTERSALE_STATUS_CLASS)) expect(v, `AFTERSALE_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    // 求购单与推荐的状态徽章：求购中是缺省状态且不经审核，连「在售」那种绿方点也没有
    for (const [k, v] of Object.entries(WANTED_STATUS_CLASS)) expect(v, `WANTED_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    for (const [k, v] of Object.entries(WANTED_OFFER_STATUS_CLASS)) expect(v, `WANTED_OFFER_STATUS_CLASS.${k}`).not.toMatch(/lime/);
    expect(LISTING_STATUS_CLASS.on_sale).toMatch(/before:bg-lime-300/);
  });
  it("accent-* 是死类（控件已 appearance:none 自绘），不应再出现", () => {
    const bad = files.filter((f) => /\baccent-(lime|rose|cyan|amber)-\d+/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
  it("荧光绿 hover 只给商品内容卡与 primary 按钮", () => {
    // ui.tsx 里是 primary 按钮的 hover:bg-lime-200（A 类动作）；卡片的 group-hover 进入方块也是 A 类
    const allowed = new Set(["components/listing-card.tsx", "components/pinned-strip.tsx", "components/ui.tsx"]);
    const bad = files.filter((f) => !allowed.has(f.path) && /(^|[^-])hover:(border|bg|text)-lime-/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
  it("globals.css 里荧光绿的出现次数不超过封闭清单基线", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    const hex = (css.match(/#c8ff54/gi) ?? []).length;
    const rgb = (css.match(/200, 255, 84/g) ?? []).length;
    // 基线：2026-09 第二批打磨定稿时的数量（含顶部规则注释里的 1 次）。新增品牌点缀必须先改定稿再改这里。
    expect(hex, "#c8ff54 出现次数").toBeLessThanOrEqual(LIME_HEX_BASELINE);
    expect(rgb, "rgba(200,255,84) 出现次数").toBeLessThanOrEqual(LIME_RGB_BASELINE);
  });
});

describe("价格排版", () => {
  it("Price 输出的文本连续（e2e 按「¥4,800」整串断言）", () => {
    const html = renderToStaticMarkup(Price({ value: 4800 }));
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("¥4,800");
    expect(html).not.toMatch(/lime/);
  });
});
