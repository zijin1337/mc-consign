/** Hypixel 数据的归一化结构。原始 API 返回体不落库，只存这些。 */

export interface GameStat {
  label: string;
  value: string;
}

export interface GameSummary {
  key: string;
  /** 英文名，等宽小标签 */
  name: string;
  nameCn: string;
  headline: { label: string; value: string; color?: string | null; rainbow?: boolean };
  stats: GameStat[];
}

export interface GuildSummary {
  name: string;
  tag: string | null;
  tagColor: string | null;
  members: number;
}

/** 摘要结构版本。改了字段就 +1，旧缓存会被重新抓取而不是拿去渲染 */
export const SUMMARY_VERSION = 2;

export interface PlayerSummary {
  v: number;
  uuid: string;
  name: string;
  /** 归一化后的 rank 键：NONE / VIP / VIP_PLUS / MVP / MVP_PLUS / MVP_PLUS_PLUS / YOUTUBER / ADMIN ... */
  rank: string;
  rankDisplay: string;
  rankColor: string;
  plusColor: string | null;
  networkExp: number;
  karma: number;
  achievementPoints: number;
  questsCompleted: number;
  totalWins: number | null;
  firstLogin: number | null;
  lastLogin: number | null;
  lastLogout: number | null;
  mostRecentGame: string | null;
  language: string | null;
  guild: GuildSummary | null;
  socials: Record<string, string>;
  games: GameSummary[];
  hasSkyblock: boolean;
}

export interface SkyblockSkill {
  key: string;
  name: string;
  level: number;
  /** 含当前级进度的小数等级 */
  exact: number;
  progress: number;
  xp: number;
  cap: number;
}

export interface SkyblockSlayer {
  key: string;
  name: string;
  level: number;
  xp: number;
}

export interface SkyblockSummary {
  profileName: string;
  gameMode: string | null;
  skills: SkyblockSkill[];
  skillAverage: number;
  catacombs: { level: number; exact: number; xp: number } | null;
  slayers: SkyblockSlayer[];
  purse: number | null;
  bank: number | null;
  fairySouls: number | null;
}

/** 上架时抓的快照，审核核对与列表「已核对」标签用 */
export interface ApiSnapshot {
  uuid: string;
  name: string;
  level: number;
  /** 映射到平台会员类型（无 / VIP / VIP+ / MVP / MVP+ / MVP++），特殊身份为 null */
  rank: string | null;
  rankRaw: string;
  fetchedAt: number;
}
