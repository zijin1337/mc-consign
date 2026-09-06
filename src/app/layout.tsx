import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Gamepad2, ShieldAlert } from "lucide-react";
import "./globals.css";
import { Nav } from "@/components/nav";
import { cn, focusRing } from "@/components/ui";
import { getSettings } from "@/lib/settings";

const SITE = process.env.SITE_NAME || "方块寄售平台";
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const DESCRIPTION = "Minecraft / Hypixel 正版账号寄售信息平台。卖家发布账号、平台审核、中介人工撮合，按信用分排序，成交记录公开。";

/** 像素字只用在品牌字标 tagline、错误码和首页 hero 背景底纹上，单独加载一份，不把 geist/font/pixel 里其他四款一起打进来 */
const pixel = localFont({
  src: "../assets/fonts/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel-square",
  weight: "500",
  display: "swap",
  // 关掉 Arial 度量回退，加载失败时沿 --font-pixel 的链回到 Geist Mono
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE} · Minecraft 正版账号寄售`, template: `%s · ${SITE}` },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE,
    title: `${SITE} · Minecraft 正版账号寄售`,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#080b0d",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  return (
    <html lang="zh-CN" className={`h-full ${GeistSans.variable} ${GeistMono.variable} ${pixel.variable}`}>
      <body className="site-shell flex min-h-full flex-col text-foreground">
        {settings.announcement && (
          <div className="border-b border-amber-300/25 bg-amber-300/[0.08]">
            <div className="mx-auto flex w-full max-w-[1380px] items-start gap-3 px-4 py-3 text-sm leading-6 text-amber-100 sm:items-center sm:px-8">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300 sm:mt-0" />
              <p>
                <span className="font-semibold text-amber-200">公告：</span>
                {settings.announcement}
              </p>
            </div>
          </div>
        )}
        <Nav />
        <main className="mx-auto w-full max-w-[1380px] flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
        <footer className="border-t border-white/[0.07] bg-sunken">
          <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-4 px-4 py-8 text-sm text-zinc-600 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="flex items-center gap-2">
                <Gamepad2 className="size-5 text-zinc-500" />© {new Date().getFullYear()} {SITE}
              </span>
              <Link href="/terms" className={cn("official-link", focusRing)}>
                用户协议与免责声明
              </Link>
              {process.env.ICP_NUMBER && (
                <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className={cn("official-link", focusRing)}>
                  {process.env.ICP_NUMBER}
                </a>
              )}
              {process.env.PSB_NUMBER && (
                <a href="https://beian.mps.gov.cn/" target="_blank" rel="noreferrer" className={cn("official-link", focusRing)}>
                  {process.env.PSB_NUMBER}
                </a>
              )}
              {process.env.COMPANY_NAME && <span>{process.env.COMPANY_NAME}</span>}
            </div>
            <p className="max-w-2xl leading-6 lg:text-right">
              本站仅提供账号信息展示与中介撮合服务，不经手资金。非 Microsoft 或 Mojang 官方平台，不代表其认可或授权。Minecraft 为其权利人商标。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
