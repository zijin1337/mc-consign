import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Docker 镜像用独立输出（BUILD_STANDALONE=1）；直接跑在 Linux 上用普通输出配 next start
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // 允许第二个 dev 实例（例如 e2e）用独立的构建目录，避免和手动开着的 pnpm dev 抢 .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      // 图片走 /api/upload 单独上传，表单本身只有文字和几个 id，2MB 足够；匿名可达的登录 / 验证码不再吃大请求
      bodySizeLimit: "2mb",
    },
  },
  // 上传图走 /uploads 路由自行输出，不用 next/image 优化
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
