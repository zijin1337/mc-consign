import { cn } from "./ui";

// md 抬到 28px：卡片正文里零彩色之后，价格靠字号而不是颜色成为第二落点
const sizes = {
  sm: { amount: "text-lg", symbol: "text-xs" },
  md: { amount: "text-[1.75rem] leading-none", symbol: "text-sm" },
  lg: { amount: "text-4xl", symbol: "text-lg" },
} as const;

/**
 * 统一的价格排版：小号淡色 ¥ + 粗体白色数字，全站唯一写法（表格单元格用 formatPrice + text-white）。
 * 文本输出必须连续（「¥4,800」），e2e 按整串断言。
 */
export function Price({ value, size = "md", className }: { value: number; size?: keyof typeof sizes; className?: string }) {
  const s = sizes[size];
  return (
    <strong className={cn("inline-flex items-baseline font-black tracking-tight text-white", s.amount, className)}>
      <span className={cn("mr-1 font-medium text-zinc-400", s.symbol)}>¥</span>
      {value.toLocaleString("zh-CN")}
    </strong>
  );
}
