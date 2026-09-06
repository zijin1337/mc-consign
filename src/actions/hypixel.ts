"use server";

import { getCurrentUser, isBanned } from "@/lib/auth";
import { isValidIgn } from "@/lib/hypixel/client";
import { rankToMcRank } from "@/lib/hypixel/labels";
import { networkProgress } from "@/lib/hypixel/levels";
import { getPlayerByName, refreshPlayer as refresh } from "@/lib/hypixel/service";
import { consume, retryText } from "@/lib/rate-limit";

export type LookupResult = { ok: true; name: string; uuid: string; level: number; rank: string | null; rankDisplay: string } | { ok: false; message: string };

const TEN_MIN = 10 * 60_000;

/** 上架表单「从 Hypixel 拉取」：返回等级与会员，前端填进表单。每人 10 分钟 20 次。 */
export async function lookupPlayer(ignRaw: string): Promise<LookupResult> {
  const user = await getCurrentUser();
  if (!user || isBanned(user)) return { ok: false, message: "请先登录" };
  const rl = consume(`hx:lookup:${user.id}`, 20, TEN_MIN);
  if (!rl.ok) return { ok: false, message: `查询太频繁，请 ${retryText(rl.retryAfterMs)} 后再试` };
  const ign = String(ignRaw ?? "").trim();
  if (!isValidIgn(ign)) return { ok: false, message: "正版 ID 必须是 1～16 位字母、数字或下划线" };
  const r = await getPlayerByName(ign);
  if (!r.ok) return { ok: false, message: r.message };
  const s = r.view.summary;
  return { ok: true, name: s.name, uuid: s.uuid, level: networkProgress(s.networkExp).level, rank: rankToMcRank(s.rank), rankDisplay: s.rankDisplay };
}

/** 面板上的手动刷新。每人 10 分钟 5 次，服务层另有每个玩家 10 分钟一次的冷却。 */
export async function refreshPlayer(uuid: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user || isBanned(user)) return { ok: false, message: "请先登录" };
  const rl = consume(`hx:refresh:${user.id}`, 5, TEN_MIN);
  if (!rl.ok) return { ok: false, message: `刷新太频繁，请 ${retryText(rl.retryAfterMs)} 后再试` };
  return refresh(String(uuid ?? ""));
}
