/**
 * 联系方式外泄检测。
 * 求购说明与推荐留言是公开或半公开文本，而平台的撮合模式要求所有联系都经过中介，
 * 所以要拦下 QQ / 手机 / 微信 / 外链这类绕过中介的信息。
 * 数字只拦 7 位以上的连续数字：QQ 是 5～12 位，但预算、等级、年份都到不了 7 位，「3000-5000」这类区间也不会误伤。
 * 全角数字先做 NFKC 归一化，「１２３４５６７８」照样拦。
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/qq|扣扣|企鹅/i, "QQ"],
  [/微信|威信|weixin|wechat|\bvx\b|\bwx\b/i, "微信"],
  [/telegram|\btg\b|discord|whatsapp|line\s*id/i, "外部聊天工具"],
  [/https?:\/\/|www\.|\.com\b|\.cn\b|\.net\b/i, "外部链接"],
  [/1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/, "手机号"],
  [/\d{7,}/, "疑似 QQ 或手机号的长数字"],
];

export const CONTACT_LEAK_HINT = "不要写 QQ、微信、手机号或外部链接，中介会通过 QQ 联系双方";

/** 返回命中的类别名，没有命中返回 null */
export function findContactLeak(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.normalize("NFKC");
  for (const [re, label] of PATTERNS) if (re.test(s)) return label;
  return null;
}
