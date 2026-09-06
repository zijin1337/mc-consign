import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/actions/types";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { parseId } from "@/lib/ids";

/**
 * 打开一条通知：标记已读，然后跳到它指向的页面。
 * 列表里用普通 <a> 指向这里而不是 <Link>，免得路由预取把通知误标成已读；这里再拦一道预取请求。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (req.headers.get("next-router-prefetch") || req.headers.get("rsc") || req.headers.get("purpose") === "prefetch") {
    return new Response(null, { status: 204 });
  }
  const id = parseId((await ctx.params).id);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/me/notifications")}`);
  if (!id) redirect("/me/notifications");

  const { notifications } = schema;
  const [n] = await db
    .select({ link: notifications.link, readAt: notifications.readAt })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .limit(1);
  if (!n) redirect("/me/notifications");
  if (!n.readAt) await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
  redirect(safeNext(n.link, "/me/notifications"));
}
