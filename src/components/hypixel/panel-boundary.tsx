"use client";

import { Component, type ReactNode } from "react";
import { HypixelPanelHeader } from "./panel-header";

/** 面板自己的错误边界：Hypixel 数据渲染出错只影响这一块，不拖垮整个详情页 */
export class HypixelPanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[hypixel-panel]", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="border border-white/10 bg-card">
          <HypixelPanelHeader />
          <p className="px-5 py-4 text-sm text-zinc-500">官方数据暂时无法加载，不影响查看账号信息和下单。稍后刷新再试。</p>
        </section>
      );
    }
    return this.props.children;
  }
}
