/** Hypixel 相关文案、颜色与格式化。纯函数，前后端共用。 */

export const MC_COLORS: Record<string, string> = {
  BLACK: "#000000",
  DARK_BLUE: "#0000AA",
  DARK_GREEN: "#00AA00",
  DARK_AQUA: "#00AAAA",
  DARK_RED: "#AA0000",
  DARK_PURPLE: "#AA00AA",
  GOLD: "#FFAA00",
  GRAY: "#AAAAAA",
  DARK_GRAY: "#555555",
  BLUE: "#5555FF",
  GREEN: "#55FF55",
  AQUA: "#55FFFF",
  RED: "#FF5555",
  LIGHT_PURPLE: "#FF55FF",
  YELLOW: "#FFFF55",
  WHITE: "#FFFFFF",
};

export function mcColor(name: unknown, fallback: string): string {
  return typeof name === "string" && MC_COLORS[name] ? MC_COLORS[name] : fallback;
}

interface RankInfo {
  display: string;
  color: string;
  /** 带 + 的会员，+ 用单独颜色 */
  plusDefault?: string;
  /** 对应平台会员类型，特殊身份为 null */
  mc: string | null;
}

export const RANK_INFO: Record<string, RankInfo> = {
  NONE: { display: "无会员", color: "#AAAAAA", mc: "无" },
  VIP: { display: "VIP", color: "#55FF55", mc: "VIP" },
  VIP_PLUS: { display: "VIP+", color: "#55FF55", plusDefault: "#FFAA00", mc: "VIP+" },
  MVP: { display: "MVP", color: "#55FFFF", mc: "MVP" },
  MVP_PLUS: { display: "MVP+", color: "#55FFFF", plusDefault: "#FF5555", mc: "MVP+" },
  MVP_PLUS_PLUS: { display: "MVP++", color: "#FFAA00", plusDefault: "#FF5555", mc: "MVP++" },
  YOUTUBER: { display: "YOUTUBE", color: "#FF5555", mc: null },
  ADMIN: { display: "ADMIN", color: "#FF5555", mc: null },
  GAME_MASTER: { display: "GM", color: "#00AA00", mc: null },
  MODERATOR: { display: "MOD", color: "#00AA00", mc: null },
  HELPER: { display: "HELPER", color: "#5555FF", mc: null },
};

/** 从原始 player 字段推出 rank 键。特殊身份 > MVP++ 月费 > 购买的会员 */
export function deriveRank(p: { rank?: unknown; monthlyPackageRank?: unknown; newPackageRank?: unknown; packageRank?: unknown }): string {
  if (typeof p.rank === "string" && p.rank && p.rank !== "NORMAL") return p.rank;
  if (p.monthlyPackageRank === "SUPERSTAR") return "MVP_PLUS_PLUS";
  const r = (typeof p.newPackageRank === "string" && p.newPackageRank) || (typeof p.packageRank === "string" && p.packageRank) || "NONE";
  return r === "NONE" || r === "NORMAL" ? "NONE" : r;
}

export function rankInfo(rank: string): RankInfo {
  return RANK_INFO[rank] ?? { display: rank, color: "#FF5555", mc: null };
}

/** 把 rank 键映射到平台会员类型，特殊身份返回 null */
export function rankToMcRank(rank: string): string | null {
  return rankInfo(rank).mc;
}

/** 游戏库名（stats 下的 key）→ 英文 / 中文 */
export const GAME_NAMES: Record<string, [string, string]> = {
  Bedwars: ["Bedwars", "起床战争"],
  SkyWars: ["SkyWars", "空岛战争"],
  Duels: ["Duels", "决斗"],
  MurderMystery: ["Murder Mystery", "密室杀手"],
  TNTGames: ["TNT Games", "TNT 游戏"],
  BuildBattle: ["Build Battle", "建筑大师"],
  UHC: ["UHC", "极限生存冠军"],
  Arcade: ["Arcade", "街机游戏"],
  Pit: ["The Pit", "天坑乱斗"],
  WoolGames: ["Wool Games", "羊毛大战"],
  SkyBlock: ["SkyBlock", "空岛生存"],
};

/** mostRecentGameType → 中文 */
export const GAME_TYPE_CN: Record<string, string> = {
  BEDWARS: "起床战争",
  SKYWARS: "空岛战争",
  DUELS: "决斗",
  MURDER_MYSTERY: "密室杀手",
  TNTGAMES: "TNT 游戏",
  BUILD_BATTLE: "建筑大师",
  UHC: "极限生存冠军",
  ARCADE: "街机游戏",
  PIT: "天坑乱斗",
  SKYBLOCK: "空岛生存",
  WOOL_GAMES: "羊毛大战",
  HOUSING: "家园",
  PROTOTYPE: "原型大厅",
  MAIN_LOBBY: "主大厅",
  REPLAY: "回放",
  SMP: "SMP",
  LEGACY: "经典游戏",
  SURVIVAL_GAMES: "闪电饥饿游戏",
  QUAKECRAFT: "雷霆之战",
  WALLS: "战墙",
  WALLS3: "超级战墙",
  PAINTBALL: "彩弹射击",
  ARENA: "竞技场",
  MCGO: "警匪大战",
  VAMPIREZ: "吸血鬼",
  BATTLEGROUND: "战神",
  SUPER_SMASH: "英雄大乱斗",
  GINGERBREAD: "卡丁车",
  SPEED_UHC: "极速 UHC",
  TRUE_COMBAT: "疯狂战墙",
};

export function gameTypeCn(type: string | null | undefined): string | null {
  if (!type) return null;
  return GAME_TYPE_CN[type] ?? type;
}

export const SKILL_NAMES: Record<string, string> = {
  farming: "农业",
  mining: "挖矿",
  combat: "战斗",
  foraging: "采集",
  fishing: "钓鱼",
  enchanting: "附魔",
  alchemy: "炼药",
  taming: "驯养",
  carpentry: "木工",
};

export const SLAYER_NAMES: Record<string, string> = {
  zombie: "僵尸",
  spider: "蜘蛛",
  wolf: "狼",
  enderman: "末影人",
  blaze: "烈焰人",
  vampire: "吸血鬼",
};

export const SB_MODE_CN: Record<string, string> = {
  ironman: "铁人",
  bingo: "宾果",
  island: "孤岛",
  stranded: "孤岛",
};

// ---------- 格式化 ----------

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtCoins(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toString();
}

export function fmtRatio(a: number, b: number): string {
  if (!Number.isFinite(a)) return "-";
  if (!b) return a.toFixed(2);
  return (a / b).toFixed(2);
}

export function fmtPct(part: number, total: number): string {
  if (!total) return "-";
  return `${((part / total) * 100).toFixed(1)}%`;
}

const SITE_TZ = process.env.SITE_TZ || "Asia/Shanghai";
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** 站点时区下的 YYYY-MM-DD */
export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "-";
  return dateFmt.format(new Date(ms));
}

/** 账号年龄：「9 年 1 个月」「11 个月」「20 天」 */
export function accountAge(firstLogin: number | null | undefined, now = Date.now()): string {
  if (!firstLogin || firstLogin > now) return "-";
  const days = Math.floor((now - firstLogin) / 86_400_000);
  if (days < 30) return `${Math.max(1, days)} 天`;
  const months = Math.floor(days / 30.4375);
  if (months < 12) return `${months} 个月`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} 年 ${rem} 个月` : `${years} 年`;
}

/** 相对时间：「刚刚」「3 分钟前」「5 小时前」「3 天前」「2 个月前」「2 年前」 */
export function relativeTime(ts: number | Date | null | undefined, now = Date.now()): string {
  if (!ts) return "-";
  const t = ts instanceof Date ? ts.getTime() : ts;
  const diff = now - t;
  if (diff < 60_000) return "刚刚";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30.4375);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}
