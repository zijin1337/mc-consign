import type { ApiSnapshot } from "./types";

/**
 * none：没有快照；match：等级与会员都对得上；partial：等级对得上但官方是特殊身份没法比会员；mismatch：对不上。
 * 只有 match 才在列表卡片上打「官方数据一致」标。
 */
export type CompareStatus = "none" | "match" | "partial" | "mismatch";

/** 卖家填写的等级 / 会员 与上架时抓到的官方快照做比对。等级差 1 以内算一致（取整误差）。 */
export function compareSnapshot(attrs: Record<string, unknown> | null | undefined, snap: ApiSnapshot | null | undefined): { status: CompareStatus; text: string } {
  if (!snap) return { status: "none", text: "未能核对" };
  const claimedLevel = Number(attrs?.level);
  const claimedRank = typeof attrs?.rank === "string" ? attrs.rank : "";
  const parts: string[] = [];
  let ok = true;
  let partial = false;

  if (Number.isFinite(claimedLevel)) {
    const levelOk = Math.abs(claimedLevel - snap.level) <= 1;
    ok &&= levelOk;
    parts.push(levelOk ? `等级 ${snap.level}（一致）` : `等级 ${snap.level}（卖家填 ${claimedLevel}）`);
  } else {
    parts.push(`等级 ${snap.level}`);
    partial = true;
  }

  if (snap.rank === null) {
    parts.push(`身份 ${snap.rankRaw}（特殊身份，不比对会员）`);
    partial = true;
  } else if (claimedRank) {
    const rankOk = claimedRank === snap.rank;
    ok &&= rankOk;
    parts.push(rankOk ? `会员 ${snap.rank}（一致）` : `会员 ${snap.rank}（卖家填 ${claimedRank}）`);
  } else {
    parts.push(`会员 ${snap.rank}`);
    partial = true;
  }

  const status: CompareStatus = !ok ? "mismatch" : partial ? "partial" : "match";
  return { status, text: parts.join(" · ") };
}
