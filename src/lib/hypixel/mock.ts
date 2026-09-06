/**
 * 没有 API Key 时的模拟数据（HYPIXEL_MOCK=1）。按 uuid 播种，同一个名字每次都一样，不同名字各不相同。
 * 字段名和形状按 Hypixel API v2 写，normalize 用同一套代码解析。
 */

function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 伪 uuid：32 位十六进制，来自名字的哈希 */
export function mockUuid(name: string): string {
  const key = name.toLowerCase();
  return [0, 1, 2, 3].map((i) => fnv1a(key, 0x811c9dc5 + i * 7919).toString(16).padStart(8, "0")).join("");
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: () => number, min: number, max: number) => Math.floor(min + r() * (max - min + 1));

export function mockPlayer(uuid: string, name?: string): Record<string, unknown> {
  const r = rng(fnv1a(uuid));
  const displayname = name ?? `Player_${uuid.slice(0, 6)}`;
  const roll = r();
  const rankFields =
    roll < 0.45
      ? { newPackageRank: "MVP_PLUS", rankPlusColor: ["RED", "GOLD", "AQUA", "LIGHT_PURPLE", "WHITE"][int(r, 0, 4)] }
      : roll < 0.7
        ? { newPackageRank: "MVP_PLUS", monthlyPackageRank: "SUPERSTAR", rankPlusColor: ["RED", "GOLD", "DARK_PURPLE", "BLUE"][int(r, 0, 3)], monthlyRankColor: r() < 0.7 ? "GOLD" : "AQUA" }
        : roll < 0.85
          ? { newPackageRank: "MVP" }
          : roll < 0.95
            ? { newPackageRank: "VIP_PLUS" }
            : {};

  const level = int(r, 35, 320);
  const networkExp = Math.round(1250 * (level + 2.5 + r()) ** 2 - 15312.5);
  const now = Date.now();
  const firstLogin = now - int(r, 2, 9) * 365.25 * 86_400_000 - int(r, 0, 300) * 86_400_000;
  const lastLogin = now - int(r, 0, 20) * 86_400_000 - int(r, 0, 86_400_000);

  const bwStar = int(r, 40, 950);
  const bwExp = Math.floor(bwStar / 100) * 487000 + 7000 + ((bwStar % 100) - 4) * 5000 + int(r, 0, 4999);
  const bwWins = int(r, 200, 6000);
  const bwFk = Math.round(bwWins * (2.5 + r() * 4));
  const swLevel = int(r, 8, 40);
  const swExp = swLevel < 12 ? [0, 20, 70, 150, 250, 500, 1000, 2000, 3500, 6000, 10000, 15000][swLevel] : 15000 + (swLevel - 12) * 10000 + int(r, 0, 9999);
  const duelsWins = int(r, 100, 9000);
  const mmWins = int(r, 20, 1500);
  const hasSkyblock = r() < 0.7;

  const quests: Record<string, { completions: Array<{ time: number }> }> = {};
  const questCount = int(r, 20, 900);
  quests.bedwars_daily_win = { completions: Array.from({ length: questCount }, (_, i) => ({ time: now - i * 86_400_000 })) };

  return {
    uuid,
    displayname,
    ...rankFields,
    firstLogin,
    lastLogin,
    lastLogout: lastLogin + int(r, 600_000, 7_200_000),
    networkExp,
    karma: int(r, 50_000, 30_000_000),
    achievementPoints: int(r, 800, 12_000),
    achievements: { general_wins: bwWins + int(r, 100, 3000) + duelsWins + mmWins },
    mostRecentGameType: ["BEDWARS", "SKYWARS", "DUELS", "SKYBLOCK", "MURDER_MYSTERY"][int(r, 0, 4)],
    userLanguage: r() < 0.6 ? "CHINESE_SIMPLIFIED" : "ENGLISH",
    quests,
    socialMedia: r() < 0.5 ? { links: { DISCORD: "user#0000" } } : {},
    stats: {
      Bedwars: {
        Experience: bwExp,
        wins_bedwars: bwWins,
        losses_bedwars: Math.round(bwWins / (0.8 + r() * 3)),
        final_kills_bedwars: bwFk,
        final_deaths_bedwars: Math.round(bwFk / (1.2 + r() * 5)),
        beds_broken_bedwars: Math.round(bwWins * (1 + r() * 2)),
        kills_bedwars: bwFk * 3,
        deaths_bedwars: bwFk * 2,
        ...(r() < 0.6 ? { winstreak: int(r, 0, 40) } : {}),
      },
      SkyWars: {
        skywars_experience: swExp,
        wins: int(r, 100, 3000),
        losses: int(r, 300, 8000),
        kills: int(r, 500, 30000),
        deaths: int(r, 400, 10000),
        heads: int(r, 0, 4000),
        win_streak: int(r, 0, 15),
      },
      Duels: {
        wins: duelsWins,
        losses: Math.round(duelsWins / (0.7 + r() * 2.5)),
        kills: Math.round(duelsWins * 1.1),
        deaths: Math.round(duelsWins * 0.9),
        games_played_duels: Math.round(duelsWins * 1.9),
        best_overall_winstreak: int(r, 5, 120),
        current_winstreak: int(r, 0, 12),
      },
      MurderMystery: { wins: mmWins, games: Math.round(mmWins * 3.2), kills: mmWins * 4, detective_wins: Math.round(mmWins * 0.3), murderer_wins: Math.round(mmWins * 0.25), coins: int(r, 1000, 900_000) },
      TNTGames: { wins: int(r, 10, 800), wins_tntrun: int(r, 5, 400), wins_bowspleef: int(r, 0, 200), wins_tntag: int(r, 0, 150), wins_pvprun: int(r, 0, 60), wins_capture: int(r, 0, 40), coins: int(r, 500, 200_000) },
      BuildBattle: { score: int(r, 500, 40_000), wins: int(r, 5, 400), games_played: int(r, 50, 1500), total_votes: int(r, 500, 30_000), coins: int(r, 1000, 300_000) },
      UHC: { score: int(r, 0, 2500), wins: int(r, 0, 60), kills: int(r, 0, 500), deaths: int(r, 10, 400), coins: int(r, 0, 20_000) },
      ...(hasSkyblock ? { SkyBlock: { profiles: { [uuid.slice(0, 8)]: { profile_id: uuid, cute_name: "Apple" } } } } : {}),
    },
  };
}

export function mockGuild(uuid: string): Record<string, unknown> | null {
  const r = rng(fnv1a(uuid, 99));
  if (r() < 0.35) return null;
  const names = ["Blockheads", "Redstone Union", "Nether Kings", "Void Walkers", "Cake Society", "Diamond Hands"];
  const i = int(r, 0, names.length - 1);
  return { name: names[i], tag: names[i].split(" ").map((w) => w[0]).join("").toUpperCase(), tagColor: ["GOLD", "AQUA", "GREEN", "LIGHT_PURPLE", "DARK_AQUA"][int(r, 0, 4)], members: Array.from({ length: int(r, 20, 125) }, (_, k) => ({ uuid: `${k}` })) };
}

export function mockProfiles(uuid: string): Array<Record<string, unknown>> {
  const r = rng(fnv1a(uuid, 7));
  const skillXp = (cap: number) => {
    const table = [0, 50, 175, 275, 435, 635, 885, 1200, 1600, 2100, 2725, 3450, 4325, 5325, 6500, 7825, 9325, 11000, 12900, 15000, 17250, 19725, 22400, 25400, 28800, 32700, 37000, 41700, 46900, 52700, 59000, 66000, 73900, 82600, 92300, 103000, 114700, 127300, 141000, 155600, 171300, 188100, 206000, 225000, 245400, 266900, 289600, 313700, 339000, 366100, 394700, 429700, 466900, 507300, 550600, 597100, 646900, 700200, 757100, 817700, 882200];
    const lv = int(r, 15, cap);
    return table[lv] + int(r, 0, Math.max(1, (table[Math.min(cap, lv + 1)] ?? table[lv]) - table[lv] - 1));
  };
  const cataLevel = int(r, 0, 42);
  const cataTable = [0, 50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385, 6275, 8940, 12700, 17960, 25340, 35640, 50040, 70040, 97640, 135640, 188140, 259640, 356640, 488640, 668640, 911640, 1239640, 1684640, 2284640, 3084640, 4149640, 5559640, 7459640, 9959640, 13259640, 17559640, 23159640, 30359640, 39559640, 51559640, 66559640, 85559640];
  return [
    {
      profile_id: uuid,
      cute_name: ["Apple", "Banana", "Cucumber", "Grapes", "Kiwi", "Lemon"][int(r, 0, 5)],
      selected: true,
      game_mode: r() < 0.2 ? "ironman" : undefined,
      banking: r() < 0.7 ? { balance: int(r, 1_000_000, 900_000_000) } : undefined,
      members: {
        [uuid]: {
          player_data: {
            experience: {
              SKILL_FARMING: skillXp(60),
              SKILL_MINING: skillXp(60),
              SKILL_COMBAT: skillXp(60),
              SKILL_FORAGING: skillXp(50),
              SKILL_FISHING: skillXp(50),
              SKILL_ENCHANTING: skillXp(60),
              SKILL_ALCHEMY: skillXp(50),
              SKILL_TAMING: skillXp(60),
            },
          },
          currencies: { coin_purse: int(r, 10_000, 120_000_000) },
          fairy_soul: { total_collected: int(r, 50, 247) },
          dungeons: { dungeon_types: { catacombs: { experience: cataTable[cataLevel] + int(r, 0, 1000) } } },
          slayer: {
            slayer_bosses: {
              zombie: { xp: int(r, 0, 1_200_000) },
              spider: { xp: int(r, 0, 500_000) },
              wolf: { xp: int(r, 0, 400_000) },
              enderman: { xp: int(r, 0, 300_000) },
              blaze: { xp: int(r, 0, 150_000) },
              vampire: { xp: int(r, 0, 2500) },
            },
          },
        },
      },
    },
  ];
}
