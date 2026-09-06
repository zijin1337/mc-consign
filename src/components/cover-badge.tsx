import { cn } from "./ui";

/** 截图上「封面」角标。这是标注不是动作，白底黑字；上传器与编辑页共用一份 */
export function CoverBadge({ className }: { className?: string }) {
  return <span className={cn("absolute left-1 top-1 bg-white px-1.5 py-0.5 text-[10px] font-black leading-none text-black", className)}>封面</span>;
}
