import "server-only";
import { after } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { sendMail } from "./mail";

/**
 * 邮件发件箱。业务事务里只写一行 mail_outbox，事务提交后由 flushOutbox 真正发送。
 * 事务回滚时这一行跟着消失，用户不会收到描述「从未发生的事」的邮件。
 * 触发时机：每次入队后用 after() 在响应发出后刷一次；健康检查也会顺带刷一次，等于一个免费的定时器。
 */

const { mailOutbox, notifications } = schema;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;
const BATCH = 20;

export async function enqueueMail(exec: Tx | typeof db, m: { to: string; subject: string; body: string; notificationId?: number | null }) {
  await exec.insert(mailOutbox).values({ to: m.to, subject: m.subject, body: m.body, notificationId: m.notificationId ?? null });
}

const g = globalThis as unknown as { __outboxFlushing?: boolean };

/** 认领一批未发的邮件并发送。同一进程内不重入；多实例靠 for update skip locked 互斥。返回本次成功发送数 */
export async function flushOutbox(): Promise<number> {
  if (g.__outboxFlushing) return 0;
  g.__outboxFlushing = true;
  let sent = 0;
  try {
    for (let round = 0; round < 5; round++) {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - LOCK_MS);
      const claimed = await db
        .update(mailOutbox)
        .set({ lockedAt: now, attempts: sql`${mailOutbox.attempts} + 1` })
        .where(
          inArray(
            mailOutbox.id,
            sql`(select id from mail_outbox where sent_at is null and attempts < ${MAX_ATTEMPTS} and (locked_at is null or locked_at < ${staleBefore}) order by id limit ${BATCH} for update skip locked)`,
          ),
        )
        .returning();
      if (claimed.length === 0) break;
      for (const m of claimed) {
        try {
          await sendMail(m.to, m.subject, m.body);
          await db.update(mailOutbox).set({ sentAt: new Date(), lastError: null }).where(eq(mailOutbox.id, m.id));
          if (m.notificationId) await db.update(notifications).set({ emailedAt: new Date() }).where(eq(notifications.id, m.notificationId));
          sent++;
        } catch (e) {
          // 保留 lockedAt，5 分钟后才会再试，避免同一封信在一次刷新里连续重发
          await db
            .update(mailOutbox)
            .set({ lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
            .where(eq(mailOutbox.id, m.id));
          console.error("[outbox] send failed", m.id, e instanceof Error ? e.message : e);
        }
      }
    }
  } catch (e) {
    console.error("[outbox] flush failed", e instanceof Error ? e.message : e);
  } finally {
    g.__outboxFlushing = false;
  }
  return sent;
}

/** 在当前请求响应之后刷发件箱；不在请求上下文里（脚本、测试）就退化为定时器 */
export function scheduleFlush() {
  try {
    after(() => flushOutbox());
  } catch {
    setTimeout(() => void flushOutbox(), 100);
  }
}
