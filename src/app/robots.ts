import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

/**
 * 前六个 disallow 前缀对应 proxy.ts 的 matcher，爬虫访问只会拿到登录跳转。
 * proxy 的 matcher 必须是字面量（Next 在构建期静态分析），没法共用常量，改一处记得改另一处。
 * `/wanted/` 带尾斜杠：拦下发布页与详情页，放行公开的求购大厅 `/wanted`。
 */
export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/+$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/me",
        "/agent",
        "/orders",
        "/sell",
        "/listings",
        "/wanted/",
        "/api/",
        "/uploads/",
        "/skin/",
        "/login",
        "/register",
        "/forgot",
        "/banned",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
