/** Hypixel 各类等级公式。纯函数，前后端共用，有单元测试。 */

// ---------- 网络等级 ----------

export function networkLevel(exp: number): number {
  if (!Number.isFinite(exp) || exp <= 0) return 1;
  return Math.sqrt(2 * exp + 30625) / 50 - 2.5;
}

export function networkExpForLevel(level: number): number {
  return 1250 * (level + 2.5) ** 2 - 15312.5;
}

export function networkProgress(exp: number) {
  const exact = networkLevel(exp);
  const level = Math.max(1, Math.floor(exact));
  const start = networkExpForLevel(level);
  const end = networkExpForLevel(level + 1);
  const current = Math.max(0, Math.round((Number.isFinite(exp) ? exp : 0) - start));
  const needed = Math.round(end - start);
  return { exact, level, current, needed, progress: Math.min(1, Math.max(0, current / needed)) };
}

// ---------- 起床战争 ----------

const BW_EASY = [500, 1000, 2000, 3500];
const BW_PRESTIGE_XP = 487000;

export function bedwarsLevel(exp: number): number {
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  const prestiges = Math.floor(exp / BW_PRESTIGE_XP);
  let level = prestiges * 100;
  let rem = exp - prestiges * BW_PRESTIGE_XP;
  for (const t of BW_EASY) {
    if (rem < t) return level + rem / t;
    rem -= t;
    level += 1;
  }
  return level + rem / 5000;
}

const BW_PRESTIGE_COLORS = ["#AAAAAA", "#FFFFFF", "#FFAA00", "#55FFFF", "#00AA00", "#00AAAA", "#AA0000", "#FF55FF", "#5555FF", "#AA00AA"];

export function bedwarsPrestige(level: number): { color: string | null; rainbow: boolean; symbol: string } {
  const p = Math.floor(Math.max(0, level) / 100);
  const symbol = level < 1100 ? "✫" : level < 2100 ? "✪" : level < 3100 ? "⚝" : "✥";
  if (p >= 10) return { color: null, rainbow: true, symbol };
  return { color: BW_PRESTIGE_COLORS[p], rainbow: false, symbol };
}

// ---------- 空岛战争 ----------

const SW_XP = [0, 20, 70, 150, 250, 500, 1000, 2000, 3500, 6000, 10000, 15000];

export function skywarsLevel(exp: number): number {
  if (!Number.isFinite(exp) || exp < 0) exp = 0;
  if (exp >= 15000) return (exp - 15000) / 10000 + 12;
  for (let i = 1; i < SW_XP.length; i++) {
    if (exp < SW_XP[i]) return i + (exp - SW_XP[i - 1]) / (SW_XP[i] - SW_XP[i - 1]);
  }
  return 12;
}

// ---------- SkyBlock 技能 ----------

/** 累计经验表，下标即等级，0 到 60 */
export const SKILL_XP = [
  0, 50, 175, 275, 435, 635, 885, 1200, 1600, 2100, 2725, 3450, 4325, 5325, 6500, 7825, 9325, 11000, 12900, 15000, 17250, 19725, 22400, 25400, 28800, 32700, 37000,
  41700, 46900, 52700, 59000, 66000, 73900, 82600, 92300, 103000, 114700, 127300, 141000, 155600, 171300, 188100, 206000, 225000, 245400, 266900, 289600, 313700,
  339000, 366100, 394700, 429700, 466900, 507300, 550600, 597100, 646900, 700200, 757100, 817700, 882200,
];

export function levelFromTable(xp: number, table: number[], cap: number): { level: number; exact: number; progress: number } {
  const x = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const max = Math.min(cap, table.length - 1);
  let level = 0;
  for (let i = 1; i <= max; i++) {
    if (x >= table[i]) level = i;
    else break;
  }
  if (level >= max) return { level: max, exact: max, progress: 1 };
  const progress = Math.min(1, Math.max(0, (x - table[level]) / (table[level + 1] - table[level])));
  return { level, exact: level + progress, progress };
}

export function skillLevel(xp: number, cap = 50) {
  return levelFromTable(xp, SKILL_XP, cap);
}

/** 地牢（Catacombs）累计经验表，0 到 50 */
export const CATACOMBS_XP = [
  0, 50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385, 6275, 8940, 12700, 17960, 25340, 35640, 50040, 70040, 97640, 135640, 188140, 259640, 356640, 488640,
  668640, 911640, 1239640, 1684640, 2284640, 3084640, 4149640, 5559640, 7459640, 9959640, 13259640, 17559640, 23159640, 30359640, 39559640, 51559640, 66559640,
  85559640, 109559640, 139559640, 177559640, 225559640, 285559640, 360559640, 453559640, 569809640,
];

export function catacombsLevel(xp: number) {
  return levelFromTable(xp, CATACOMBS_XP, 50);
}

/** 猎手（Slayer）各 Boss 升级所需累计经验 */
export const SLAYER_XP: Record<string, number[]> = {
  zombie: [5, 15, 200, 1000, 5000, 20000, 100000, 400000, 1000000],
  spider: [5, 25, 200, 1000, 5000, 20000, 100000, 400000, 1000000],
  wolf: [10, 30, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  enderman: [10, 30, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  blaze: [10, 30, 250, 1500, 5000, 20000, 100000, 400000, 1000000],
  vampire: [20, 75, 240, 840, 2400],
};

export function slayerLevel(key: string, xp: number): number {
  const table = SLAYER_XP[key];
  if (!table || !Number.isFinite(xp)) return 0;
  return table.filter((t) => xp >= t).length;
}
