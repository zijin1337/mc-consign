import { Check } from "lucide-react";
import { cn } from "./ui";

/**
 * 「官方数据一致」标：卖家填写与 Hypixel 官方快照核对一致时显示。
 * 收敛之后它是市场里唯一的荧光绿信息标记（B 类「已核验」），全站只有这一个实现。
 */
export function VerifiedTag({ className, children = "官方数据一致" }: { className?: string; children?: string }) {
  return (
    <span className={cn("tag inline-flex items-center gap-1 border-lime-300/30 text-lime-300", className)}>
      <Check className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}
