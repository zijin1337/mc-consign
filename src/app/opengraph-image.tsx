import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "方块寄售平台 · BLOCK MARKET";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

/**
 * 链接分享到 QQ / 微信时的卡片图。中文站名和描述走 og:title / og:description，
 * 图里只放品牌标和英文字标，这样不用给分享图打包几 MB 的中文字体。
 */
export default async function OpenGraphImage() {
  const [sans, mono] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Geist-Bold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/GeistMono-Medium.ttf")),
  ]);
  const host = new URL(SITE_URL).host;
  const cell = 64;
  const gap = 10;
  const label = { display: "flex", alignItems: "center", gap: 18, fontFamily: "GeistMono", fontSize: 26, letterSpacing: 6, color: "#8a9490" } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#080b0d",
          color: "#f4f7f1",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap }}>
            <div style={{ display: "flex", gap }}>
              <div style={{ width: cell, height: cell, background: "#c8ff54" }} />
              <div style={{ width: cell, height: cell, background: "#5fdcff" }} />
            </div>
            <div style={{ width: cell * 2 + gap, height: cell, background: "#f5f7f2" }} />
          </div>
          <div style={label}>
            <div style={{ width: 4, height: 28, background: "#c8ff54" }} />
            MARKET / MINECRAFT · HYPIXEL
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 156, fontWeight: 700, letterSpacing: -7, lineHeight: 1 }}>BLOCK</div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 156, fontWeight: 700, letterSpacing: -7, lineHeight: 1 }}>
            MARKET
            <div style={{ width: 30, height: 30, marginLeft: 16, background: "#c8ff54" }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={label}>EVERY TRADE · ON THE RECORD</div>
          <div style={{ ...label, color: "#c8ff54" }}>{host}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: sans, weight: 700, style: "normal" },
        { name: "GeistMono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
