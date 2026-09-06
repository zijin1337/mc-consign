"use client";

import { useEffect, useRef, useState } from "react";
import type { SkinViewer } from "skinview3d";

type State = "loading" | "ready" | "fallback";

/**
 * 3D 皮肤模型（skinview3d / three.js），按需加载，自动旋转加待机动画，可拖动查看。
 * 加载前与 WebGL 不可用时显示服务端合成的 2D 立绘。皮肤与披风从本站 /skin 路由取，同源无跨域问题。
 */
export function SkinViewer3D({ uuid, name, width = 220, height = 330 }: { uuid: string; name: string; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let viewer: SkinViewer | null = null;
    let io: IntersectionObserver | null = null;

    (async () => {
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") ?? probe.getContext("webgl"))) {
        setState("fallback");
        return;
      }
      try {
        const { SkinViewer, IdleAnimation } = await import("skinview3d");
        if (disposed) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const v = new SkinViewer({ canvas, width, height, pixelRatio: "match-device", fov: 55, zoom: 0.9 });
        viewer = v;
        v.controls.enableZoom = false;
        v.controls.enablePan = false;
        v.autoRotate = !reduced;
        v.autoRotateSpeed = 0.4;
        if (!reduced) v.animation = new IdleAnimation();
        // 单指竖向滑动仍然滚页面，横向拖动才旋转模型
        canvas.style.touchAction = "pan-y";
        await v.loadSkin(`/skin/${uuid}?view=raw`, { model: "auto-detect" });
        if (disposed) return;
        setState("ready");
        v.loadCape(`/skin/${uuid}?view=cape`).catch(() => {});
        // 滚出视口就停渲染
        io = new IntersectionObserver(([e]) => {
          v.renderPaused = !e?.isIntersecting;
        });
        io.observe(canvas);
      } catch (e) {
        console.warn("[skin3d]", e);
        if (!disposed) setState("fallback");
      }
    })();

    return () => {
      disposed = true;
      io?.disconnect();
      viewer?.dispose();
    };
  }, [uuid, width, height]);

  return (
    <div className="hx-viewer" data-state={state} style={{ width, height }}>
      <canvas ref={canvasRef} width={width} height={height} className="hx-viewer-canvas" aria-label={`${name} 的 3D 皮肤模型，拖动可旋转`} />
      {state !== "ready" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/skin/${uuid}?view=body`} width={128} height={256} alt={`${name} 的皮肤`} className="hx-portrait hx-viewer-fallback" />
      )}
      {state === "ready" && <span className="hx-viewer-hint">DRAG / 拖动旋转</span>}
    </div>
  );
}
