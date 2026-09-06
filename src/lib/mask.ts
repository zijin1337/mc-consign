/**
 * 卖家用户名打码，规则见大纲 4.4：
 * 超过 4 个字保留前 2 后 2；3 到 4 个字保留前 1 后 1；2 个字以内全打码。
 * 中间统一三个星号，不暴露真实长度。按 Unicode 码点计数，中英文都算一个字。
 */
export function maskUsername(name: string): string {
  const chars = Array.from(name);
  const n = chars.length;
  if (n <= 2) return "***";
  if (n <= 4) return `${chars[0]}***${chars[n - 1]}`;
  return `${chars.slice(0, 2).join("")}***${chars.slice(n - 2).join("")}`;
}
