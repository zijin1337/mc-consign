import { sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { flushOutbox } from "@/lib/outbox";

/** 容器与负载均衡的健康检查：数据库能查到就算健康。顺带刷一次邮件发件箱，相当于每 30 秒一次的定时器 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    after(() => flushOutbox());
    return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[health]", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
