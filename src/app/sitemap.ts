import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "http://localhost:3000";

/**
 * 站点地图是百度 SEO 的前置条件之一。
 * 只收录游客能直接读到内容的页面。详情页（/listings/[id]、/wanted/[id]）要登录，
 * 爬虫拿到的是登录跳转，收录进来等于喂死链，所以不放。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/+$/, "");
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/wanted`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/sold`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
