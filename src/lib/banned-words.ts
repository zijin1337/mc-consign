/**
 * 违禁词检测，见大纲第 12 节。
 * 匹配前去掉空白和常见分隔符，防止「黑 卡」「黑.卡」这类绕过。英文不区分大小写。
 */
export const DEFAULT_BANNED_WORDS = ["黑卡", "黑号", "盗号", "代刷", "外挂"];

const SEPARATORS = /[\s\p{P}\p{S}_]+/gu;

function normalize(s: string): string {
  return s.replace(SEPARATORS, "").toLowerCase();
}

/** 返回命中的第一个违禁词，没有命中返回 null */
export function findBannedWord(text: string, words: string[] = DEFAULT_BANNED_WORDS): string | null {
  if (!text) return null;
  const haystack = normalize(text);
  for (const w of words) {
    const needle = normalize(w);
    if (needle && haystack.includes(needle)) return w;
  }
  return null;
}
