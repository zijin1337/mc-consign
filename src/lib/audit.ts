import "server-only";
import { db, schema, type Tx } from "@/db";
import { clientIp } from "./auth";

export type AuditAction =
  | "view_contact"
  | "review_approve"
  | "review_reject"
  | "edit_listing"
  | "delete_listing"
  | "restore_listing"
  | "force_off_shelf"
  | "set_weight"
  | "set_pinned"
  | "assign_order"
  | "start_order"
  | "complete_order"
  | "cancel_order"
  | "aftersale_resolve"
  | "risk_flag"
  | "ban_user"
  | "unban_user"
  | "set_role"
  | "edit_agent"
  | "credit_adjust"
  | "username_change"
  | "setting_change"
  | "banned_word_add"
  | "banned_word_remove"
  | "wanted_remove"
  | "wanted_restore";

/** 敏感操作留痕。可传事务对象让日志和业务改动同进同退。 */
export async function audit(
  operatorId: number,
  action: AuditAction,
  targetType: "listing" | "order" | "user" | "setting" | "banned_word" | "wanted",
  targetId: number | null,
  detail?: { before?: unknown; after?: unknown },
  tx?: Tx,
) {
  const exec = tx ?? db;
  await exec.insert(schema.auditLogs).values({
    operatorId,
    action,
    targetType,
    targetId,
    before: detail?.before ?? null,
    after: detail?.after ?? null,
    ip: await clientIp(),
  });
}
