/**
 * 把 Hypixel API 的原始返回体压成 PlayerSummary / SkyblockSummary。
 * 全部字段按可能缺失处理：拿不到就不显示，绝不让页面崩。纯函数，有单元测试。
 */
import { GAME_NAMES, SKILL_NAMES, SLAYER_NAMES, deriveRank, fmtInt, fmtPct, fmtRatio, mcColor, rankInfo } from "./labels";
import { bedwarsLevel, bedwarsPrestige, catacombsLevel, skillLevel, skywarsLevel, slayerLevel } from "./levels";
import { SUMMARY_VERSION, type GameSummary, type GuildSummary, type PlayerSummary, type SkyblockSkill, type SkyblockSlayer, type SkyblockSummary } from "./types";

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** 街机各模式的总胜场字段名，不含子模式分项 */
const ARCADE_MODE_WINS = [
  "wins_party",
  "wins_zombies",
  "wins_hide_and_seek",
  "wins_mini_walls",
  "wins_pixel_party",
  "wins_dragonwars2",
  "wins_ender",
  "wins_farm_hunt",
  "wins_hole_in_the_wall",
  "wins_oneinthequiver",
  "wins_simon_says",
  "wins_soccer",
  "wins_throw_out",
  "wins_dropper",
  "wins_easter_simulator",
  "wins_halloween_simulator",
  "wins_grinch_simulator_v2",
  "wins_scuba_simulator",
  "wins_santa_simulator",
  "wins_starwars",
  "wins_capture_the_wool",
  "wins_dayone",
  "wins_draw_their_thing",
];

function game(key: string, headline: GameSummary["headline"], stats: Array<[string, string]>): GameSummary {
  const [name, nameCn] = GAME_NAMES[key] ?? [key, key];
  return { key, name, nameCn, headline, stats: stats.map(([label, value]) => ({ label, value })) };
}

function buildGames(stats: Raw): GameSummary[] {
  const out: GameSummary[] = [];

  const bw = obj(stats.Bedwars);
  if (num(bw.Experience) > 0 || num(bw.wins_bedwars) > 0) {
    const star = Math.floor(bedwarsLevel(num(bw.Experience)));
    const pr = bedwarsPrestige(star);
    const fk = num(bw.final_kills_bedwars);
    const fd = num(bw.final_deaths_bedwars);
    const wins = num(bw.wins_bedwars);
    const losses = num(bw.losses_bedwars);
    const ws = numOrNull(bw.winstreak);
    out.push(
      game("Bedwars", { label: "星级", value: `${pr.symbol} ${star}`, color: pr.color, rainbow: pr.rainbow }, [
        ["胜场", fmtInt(wins)],
        ["最终击杀", fmtInt(fk)],
        ["FKDR", fmtRatio(fk, fd)],
        ["拆床", fmtInt(num(bw.beds_broken_bedwars))],
        ["胜率", fmtPct(wins, wins + losses)],
        ["连胜", ws === null ? "隐藏" : fmtInt(ws)],
      ]),
    );
  }

  const sw = obj(stats.SkyWars);
  if (num(sw.skywars_experience) > 0 || num(sw.wins) > 0) {
    const lvl = Math.floor(skywarsLevel(num(sw.skywars_experience)));
    const kills = num(sw.kills);
    const deaths = num(sw.deaths);
    const wins = num(sw.wins);
    const losses = num(sw.losses);
    out.push(
      game("SkyWars", { label: "等级", value: `✯ ${lvl}` }, [
        ["胜场", fmtInt(wins)],
        ["击杀", fmtInt(kills)],
        ["KDR", fmtRatio(kills, deaths)],
        ["胜率", fmtPct(wins, wins + losses)],
        ["人头", fmtInt(num(sw.heads))],
        ["连胜", numOrNull(sw.win_streak) === null ? "隐藏" : fmtInt(num(sw.win_streak))],
      ]),
    );
  }

  const du = obj(stats.Duels);
  if (num(du.wins) > 0 || num(du.games_played_duels) > 0) {
    const wins = num(du.wins);
    const losses = num(du.losses);
    const kills = num(du.kills);
    out.push(
      game("Duels", { label: "胜场", value: fmtInt(wins) }, [
        ["WLR", fmtRatio(wins, losses)],
        ["击杀", fmtInt(kills)],
        ["KDR", fmtRatio(kills, num(du.deaths))],
        ["场次", fmtInt(num(du.games_played_duels))],
        ["最高连胜", fmtInt(num(du.best_overall_winstreak))],
        ["当前连胜", fmtInt(num(du.current_winstreak))],
      ]),
    );
  }

  const mm = obj(stats.MurderMystery);
  if (num(mm.wins) > 0 || num(mm.games) > 0) {
    out.push(
      game("MurderMystery", { label: "胜场", value: fmtInt(num(mm.wins)) }, [
        ["场次", fmtInt(num(mm.games))],
        ["击杀", fmtInt(num(mm.kills))],
        ["胜率", fmtPct(num(mm.wins), num(mm.games))],
        ["侦探胜", fmtInt(num(mm.detective_wins))],
        ["杀手胜", fmtInt(num(mm.murderer_wins))],
        ["金币", fmtInt(num(mm.coins))],
      ]),
    );
  }

  const tnt = obj(stats.TNTGames);
  if (num(tnt.wins) > 0) {
    out.push(
      game("TNTGames", { label: "胜场", value: fmtInt(num(tnt.wins)) }, [
        ["TNT Run", fmtInt(num(tnt.wins_tntrun))],
        ["Bow Spleef", fmtInt(num(tnt.wins_bowspleef))],
        ["TNT Tag", fmtInt(num(tnt.wins_tntag))],
        ["PVP Run", fmtInt(num(tnt.wins_pvprun))],
        ["Wizards", fmtInt(num(tnt.wins_capture))],
        ["金币", fmtInt(num(tnt.coins))],
      ]),
    );
  }

  const bb = obj(stats.BuildBattle);
  if (num(bb.score) > 0 || num(bb.wins) > 0) {
    out.push(
      game("BuildBattle", { label: "分数", value: fmtInt(num(bb.score)) }, [
        ["胜场", fmtInt(num(bb.wins))],
        ["场次", fmtInt(num(bb.games_played))],
        ["胜率", fmtPct(num(bb.wins), num(bb.games_played))],
        ["投票", fmtInt(num(bb.total_votes))],
        ["金币", fmtInt(num(bb.coins))],
      ]),
    );
  }

  const uhc = obj(stats.UHC);
  if (num(uhc.score) > 0 || num(uhc.wins) > 0) {
    out.push(
      game("UHC", { label: "分数", value: fmtInt(num(uhc.score)) }, [
        ["胜场", fmtInt(num(uhc.wins))],
        ["击杀", fmtInt(num(uhc.kills))],
        ["KDR", fmtRatio(num(uhc.kills), num(uhc.deaths))],
        ["金币", fmtInt(num(uhc.coins))],
      ]),
    );
  }

  const pit = obj(stats.Pit);
  const pitProfile = obj(pit.profile);
  const pitStats = obj(pit.pit_stats_ptl);
  if (Object.keys(pitProfile).length > 0 || num(pitStats.kills) > 0) {
    const prestiges = Array.isArray(pitProfile.prestiges) ? pitProfile.prestiges.length : 0;
    out.push(
      game("Pit", { label: "声望", value: `${prestiges}` }, [
        ["击杀", fmtInt(num(pitStats.kills))],
        ["死亡", fmtInt(num(pitStats.deaths))],
        ["KDR", fmtRatio(num(pitStats.kills), num(pitStats.deaths))],
        ["助攻", fmtInt(num(pitStats.assists))],
        ["游玩", `${Math.round(num(pitStats.playtime_minutes) / 60)} 小时`],
      ]),
    );
  }

  const wool = obj(obj(obj(stats.WoolGames).wool_wars).stats);
  if (num(wool.wins) > 0 || num(wool.games_played) > 0) {
    out.push(
      game("WoolGames", { label: "胜场", value: fmtInt(num(wool.wins)) }, [
        ["场次", fmtInt(num(wool.games_played))],
        ["击杀", fmtInt(num(wool.kills))],
        ["KDR", fmtRatio(num(wool.kills), num(wool.deaths))],
        ["胜率", fmtPct(num(wool.wins), num(wool.games_played))],
      ]),
    );
  }

  // 街机只加各模式的总胜场；像 wins_zombies_deadend、wins_pixel_party_normal 这类分项与总量并存，一起加会虚高
  const ar = obj(stats.Arcade);
  const arcadeWins = ARCADE_MODE_WINS.reduce((s, k) => s + num(ar[k]), 0);
  if (arcadeWins > 0) {
    out.push(
      game("Arcade", { label: "胜场", value: fmtInt(arcadeWins) }, [
        ["Party Games", fmtInt(num(ar.wins_party))],
        ["Zombies", fmtInt(num(ar.wins_zombies))],
        ["Hide & Seek", fmtInt(num(ar.wins_hide_and_seek))],
        ["Mini Walls", fmtInt(num(ar.wins_mini_walls))],
        ["金币", fmtInt(num(ar.coins))],
      ]),
    );
  }

  return out;
}

export function normalizePlayer(raw: unknown, guildRaw: unknown): PlayerSummary {
  const p = obj(raw);
  const stats = obj(p.stats);
  const rank = deriveRank(p);
  const info = rankInfo(rank);
  const rankColor = rank === "MVP_PLUS_PLUS" ? mcColor(p.monthlyRankColor, info.color) : info.color;
  const plusColor = info.plusDefault ? mcColor(p.rankPlusColor, info.plusDefault) : null;

  const quests = obj(p.quests);
  const questsCompleted = Object.values(quests).reduce<number>((s, q) => {
    const c = obj(q).completions;
    return s + (Array.isArray(c) ? c.length : 0);
  }, 0);

  const g = obj(guildRaw);
  const guild: GuildSummary | null = str(g.name)
    ? { name: String(g.name), tag: str(g.tag), tagColor: str(g.tagColor) ? mcColor(g.tagColor, "#AAAAAA") : null, members: Array.isArray(g.members) ? g.members.length : 0 }
    : null;

  const links = obj(obj(p.socialMedia).links);
  const socials: Record<string, string> = {};
  for (const [k, v] of Object.entries(links)) if (typeof v === "string" && v) socials[k] = v;

  const achievements = obj(p.achievements);
  const uuid = String(p.uuid ?? "").replace(/-/g, "").toLowerCase();

  return {
    v: SUMMARY_VERSION,
    uuid,
    name: str(p.displayname) ?? str(p.playername) ?? uuid.slice(0, 8),
    rank,
    rankDisplay: info.display,
    rankColor,
    plusColor,
    networkExp: num(p.networkExp),
    karma: num(p.karma),
    achievementPoints: num(p.achievementPoints),
    questsCompleted,
    totalWins: numOrNull(achievements.general_wins),
    firstLogin: numOrNull(p.firstLogin),
    lastLogin: numOrNull(p.lastLogin),
    lastLogout: numOrNull(p.lastLogout),
    mostRecentGame: str(p.mostRecentGameType),
    language: str(p.userLanguage),
    guild,
    socials,
    games: buildGames(stats),
    hasSkyblock: Object.keys(obj(obj(stats.SkyBlock).profiles)).length > 0,
  };
}

const SKILLS: Array<[string, number]> = [
  ["farming", 60],
  ["mining", 60],
  ["combat", 60],
  ["foraging", 50],
  ["fishing", 50],
  ["enchanting", 60],
  ["alchemy", 50],
  ["taming", 60],
];

/** 选中的档案；v2 有 selected 标记，否则取最近保存的 */
function pickProfile(profiles: Raw[], uuid: string): Raw | null {
  if (profiles.length === 0) return null;
  const selected = profiles.find((p) => p.selected === true);
  if (selected) return selected;
  const withSave = profiles
    .map((p) => ({ p, save: num(obj(obj(obj(p.members)[uuid]).profile).last_save) }))
    .sort((a, b) => b.save - a.save);
  return withSave[0].p;
}

export function normalizeSkyblock(profilesRaw: unknown, uuidRaw: string): SkyblockSummary | null {
  const uuid = uuidRaw.replace(/-/g, "").toLowerCase();
  const profiles = Array.isArray(profilesRaw) ? profilesRaw.map(obj) : [];
  const profile = pickProfile(profiles, uuid);
  if (!profile) return null;
  const m = obj(obj(profile.members)[uuid]);
  if (Object.keys(m).length === 0) return null;

  const xpTable = obj(obj(m.player_data).experience);
  const skills: SkyblockSkill[] = SKILLS.map(([key, cap]) => {
    const xp = num(xpTable[`SKILL_${key.toUpperCase()}`] ?? m[`experience_skill_${key}`]);
    const lv = skillLevel(xp, cap);
    return { key, name: SKILL_NAMES[key] ?? key, level: lv.level, exact: lv.exact, progress: lv.progress, xp, cap };
  });
  const skillAverage = skills.reduce((s, k) => s + k.exact, 0) / skills.length;

  const cataXp = num(obj(obj(obj(m.dungeons).dungeon_types).catacombs).experience);
  const cata = cataXp > 0 ? catacombsLevel(cataXp) : null;

  const bosses = obj(obj(m.slayer).slayer_bosses ?? m.slayer_bosses);
  const slayers: SkyblockSlayer[] = Object.keys(SLAYER_NAMES)
    .filter((k) => num(obj(bosses[k]).xp) > 0)
    .map((k) => {
      const xp = num(obj(bosses[k]).xp);
      return { key: k, name: SLAYER_NAMES[k], level: slayerLevel(k, xp), xp };
    });

  return {
    profileName: str(profile.cute_name) ?? "未命名",
    gameMode: str(profile.game_mode),
    skills,
    skillAverage: Math.round(skillAverage * 100) / 100,
    catacombs: cata ? { level: cata.level, exact: Math.round(cata.exact * 100) / 100, xp: cataXp } : null,
    slayers,
    purse: numOrNull(obj(m.currencies).coin_purse ?? m.coin_purse),
    bank: numOrNull(obj(profile.banking).balance),
    fairySouls: numOrNull(obj(m.fairy_soul).total_collected ?? m.fairy_souls_collected),
  };
}
