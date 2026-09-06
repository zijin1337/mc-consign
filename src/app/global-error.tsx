"use client";

/** 根布局本身出错（例如数据库连不上）时的兜底页，必须自带 html/body */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#080b0d", color: "#f4f7f1", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "20vh auto", padding: "0 24px", textAlign: "center" }}>
          <p style={{ fontSize: 14, letterSpacing: "0.14em", color: "#8f9895", fontFamily: "monospace" }}>ERROR</p>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: "12px 0" }}>站点暂时不可用</h1>
          <p style={{ color: "#8a9490", fontSize: 14, lineHeight: 1.7 }}>服务器暂时无法响应，请稍后重试。{error.digest ? `错误编号 ${error.digest}` : ""}</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, background: "#c8ff54", color: "#111708", border: 0, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
