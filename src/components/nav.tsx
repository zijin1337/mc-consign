import Link from "next/link";
import { Bell, LogOut, Store } from "lucide-react";
import { logout } from "@/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/labels";
import { countUnread } from "@/lib/notify";
import { NavLinks, type NavItem } from "./nav-links";
import { PixelAvatar } from "./pixel-avatar";
import { SubmitButton } from "./submit-button";
import { Badge, buttonClass, cn, focusRing } from "./ui";

const SITE = process.env.SITE_NAME || "方块寄售平台";
const TAGLINE = process.env.SITE_TAGLINE || "BLOCK MARKET";

export async function Nav() {
  const user = await getCurrentUser();
  const unread = user ? await countUnread(user.id) : 0;
  const items: NavItem[] = [
    { href: "/", label: "账号市场", also: ["/listings"] },
    { href: "/sold", label: "成交记录" },
    { href: "/wanted", label: "求购" },
  ];
  if (user) items.push({ href: "/sell/new", label: "我要卖", also: ["/sell"] });
  if (user) items.push({ href: "/orders", label: "意向单" });
  if (user && (user.role === "agent" || user.role === "admin")) items.push({ href: "/agent", label: "中介台" });
  if (user?.role === "admin") items.push({ href: "/admin", label: "后台" });

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1380px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-8">
        <Link href="/" className={cn("flex items-center gap-3", focusRing)} aria-label={`${SITE}首页`}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <span className="block text-[17px] font-black tracking-[0.12em] text-white">{SITE}</span>
            <span className="block font-pixel text-[11px] tracking-[0.14em] text-zinc-500">{TAGLINE}</span>
          </span>
        </Link>

        <div className="order-3 w-full lg:order-2 lg:w-auto lg:flex-1 lg:px-4">
          <NavLinks items={items} />
        </div>

        <div className="order-2 flex items-center gap-2 lg:order-3">
          {user ? (
            <>
              <Link href="/me" className={cn("flex items-center gap-2.5 border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-white/30 hover:bg-white/[0.06]", focusRing)}>
                <PixelAvatar seed={user.username} size={30} />
                <span className="leading-tight">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                    {user.username}
                    {user.role !== "user" && <Badge className="bg-white/10 text-white">{ROLE_LABEL[user.role]}</Badge>}
                  </span>
                  <span className="block font-mono text-[10px] tracking-[0.1em] text-zinc-500">信用 {user.creditScore}</span>
                </span>
              </Link>
              {/* 未读消息角标：审核结果、中介联系、交易进度都靠它提醒 */}
              <Link
                href="/me/notifications"
                data-unread={unread}
                aria-label={unread > 0 ? `消息，${unread} 条未读` : "消息"}
                className={cn("relative flex size-10 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-zinc-300 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white", focusRing)}
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-[18px] bg-rose-400 px-1 text-center font-mono text-[10px] font-black leading-[18px] text-on-rose" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <form action={logout}>
                <SubmitButton variant="ghost" size="sm" pendingText="退出中…" aria-label="退出登录">
                  <LogOut className="size-4" />
                  退出
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "md")}>
                登录
              </Link>
              <Link href="/register" className={buttonClass("primary", "md")}>
                <Store className="size-4" />
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
