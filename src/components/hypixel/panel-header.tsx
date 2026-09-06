import type { ReactNode } from "react";
import { Eyebrow } from "../ui";

/**
 * Hypixel 面板头：唯一一处卡级 eyebrow（标明数据源身份）。
 * 正常面板与错误边界共用，文字 "HYPIXEL / 官方数据" 是 e2e 依赖，别改。
 * 不引任何服务端模块，客户端组件也能用。
 */
export function HypixelPanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mc-rule flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <Eyebrow section="HYPIXEL" detail="官方数据" />
      {children}
    </header>
  );
}
