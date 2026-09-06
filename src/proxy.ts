import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mc_session";

/**
 * 乐观登录检查：没有会话 cookie 的请求直接跳登录页。
 * 真正的鉴权在页面和 Server Action 里做（见 lib/auth.ts）。
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get(SESSION_COOKIE)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/me/:path*", "/sell/:path*", "/admin/:path*", "/agent/:path*", "/orders/:path*", "/listings/:path*"],
};
