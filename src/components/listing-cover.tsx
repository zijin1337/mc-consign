import type { ReactNode } from "react";
import { imageUrl } from "@/lib/image-url";
import { cn } from "./ui";

export type CoverAccent = "lime" | "cyan" | "violet" | "amber" | "rose" | "mint";

/**
 * 账号卡封面。三种状态：
 * - 有截图：截图铺满 + 底部渐变遮罩；
 * - 无截图但有正版 uuid：会员色底纹 + 右偏的像素头像（/skin/<uuid>?view=face，源图 8×8 放大 16 倍，显示尺寸取 8 的倍数才不歪）；
 * - 什么都没有：会员色底纹 + 几何图形（现状）。
 * 角标（编号 / 会员 / 信用 / 交易中）由 children 传入，位置沿用 .cover-* 类。
 */
export function ListingCover({
  cover,
  mcUuid,
  accent,
  size = "grid",
  className,
  children,
}: {
  cover: string | null | undefined;
  mcUuid: string | null | undefined;
  accent: CoverAccent;
  size?: "grid" | "pinned";
  className?: string;
  children?: ReactNode;
}) {
  const hasImage = !!cover;
  const hasFace = !hasImage && !!mcUuid;
  const face = size === "pinned" ? 64 : 96;
  return (
    <div className={cn("listing-cover", hasImage ? "has-image" : `cover-${accent}`, hasFace && "has-face", size === "pinned" && "pinned-cover", className)}>
      {hasImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cover-shot" src={imageUrl(cover)} alt="" loading="lazy" />
          <div className="cover-shade" />
        </>
      ) : (
        <>
          <div className="cover-noise" />
          {hasFace && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cover-face" src={`/skin/${mcUuid}?view=face`} width={face} height={face} alt="" loading="lazy" decoding="async" />
          )}
        </>
      )}
      {children}
    </div>
  );
}

/**
 * 正文里 ign 旁的 32px 像素头像（每个皮肤像素 = 4 css px）。每张卡因此都有独一无二的图，且不压卖家的截图。
 * 没有 uuid 不渲染。
 */
export function AccountFace({ uuid, size = 32, className }: { uuid: string | null | undefined; size?: 24 | 32 | 64; className?: string }) {
  if (!uuid) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cn("account-face", className)} src={`/skin/${uuid}?view=face`} width={size} height={size} alt="" loading="lazy" decoding="async" />
  );
}
