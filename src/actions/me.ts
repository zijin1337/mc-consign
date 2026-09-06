"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser("/me/notifications");
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/me/notifications");
}

export async function toggleEmailNotify(form: FormData): Promise<void> {
  const user = await requireUser("/me");
  const on = form.get("notifyEmail") === "on";
  await db.update(schema.users).set({ notifyEmail: on }).where(eq(schema.users.id, user.id));
  revalidatePath("/me");
}
