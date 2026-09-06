import { KeyRound, ShieldAlert } from "lucide-react";
import { StatGrid } from "@/components/ui";
import { SB_MODE_CN, accountAge, fmtCoins, fmtDate, fmtInt, gameTypeCn, relativeTime } from "@/lib/hypixel/labels";
import { networkProgress } from "@/lib/hypixel/levels";
import { getPlayerByName, getPlayerByUuid, type PlayerView } from "@/lib/hypixel/service";
import type { GameSummary, PlayerSummary, SkyblockSummary } from "@/lib/hypixel/types";
import { HypixelPanelHeader } from "./panel-header";
import { RefreshButton } from "./refresh-button";
import { SkinViewer3D } from "./skin-viewer";

/**
 * Hypixel 官方数据面板。服务端组件，配合 <Suspense fallback={<HypixelPanelSkeleton />}> 使用。
 * 传 uuid 优先，否则按 name 解析。
 */
export async function HypixelPanel({ uuid, name, canRefresh = false, isAdmin = false }: { uuid?: string | null; name?: string | null; canRefresh?: boolean; isAdmin?: boolean }) {
  const r = uuid ? await getPlayerByUuid(uuid, { nameHint: name ?? undefined }) : name ? await getPlayerByName(name) : null;
  if (!r) return null;
  if (!r.ok) {
    if (r.kind === "unconfigured" && !isAdmin) return null;
    return (
      <section className="border border-white/10 bg-card">
        <PanelHeader />
        <div className="flex items-start gap-3 p-5 text-sm leading-6 text-zinc-400">
          {r.kind === "unconfigured" ? <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-300" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />}
          <div>
            <p className="text-zinc-200">{r.message}</p>
            {r.kind === "unconfigured" && <p className="mt-1 text-xs text-zinc-500">在 developer.hypixel.net 申请 API Key，填到 .env 的 HYPIXEL_API_KEY 后重启即可。本提示只有超管可见。</p>}
            {r.kind === "not_found" && <p className="mt-1 text-xs text-zinc-500">正版 ID 可能拼写有误，或这个账号从未登录过 Hypixel。</p>}
          </div>
        </div>
      </section>
    );
  }
  return <PanelBody view={r.view} canRefresh={canRefresh} />;
}

/** 面板头：左侧「HYPIXEL / 官方数据」与错误边界共用一份，右侧是数据源标签、更新时间与刷新按钮 */
function PanelHeader({ view, canRefresh }: { view?: PlayerView; canRefresh?: boolean }) {
  return (
    <HypixelPanelHeader>
      {view && (
        <span className="flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-[0.06em] text-zinc-500">
          {view.mock && <span className="status-warn">MOCK · 模拟数据</span>}
          {view.stale && <span className="status-warn">官方接口暂不可用 · 显示缓存</span>}
          <span>更新于 {relativeTime(view.fetchedAt)}</span>
          {canRefresh && <RefreshButton uuid={view.summary.uuid} />}
        </span>
      )}
    </HypixelPanelHeader>
  );
}

function RankTag({ s }: { s: PlayerSummary }) {
  if (s.rank === "NONE") return <span className="hx-rank text-zinc-500" style={{ borderColor: "rgba(255,255,255,.15)" }}>无会员</span>;
  const base = s.rankDisplay.replace(/\+*$/, "");
  const plus = s.rankDisplay.slice(base.length);
  return (
    <span className="hx-rank" style={{ color: s.rankColor, borderColor: `${s.rankColor}66`, background: `${s.rankColor}14` }}>
      [{base}
      {plus && <span style={{ color: s.plusColor ?? s.rankColor }}>{plus}</span>}]
    </span>
  );
}

function PanelBody({ view, canRefresh }: { view: PlayerView; canRefresh: boolean }) {
  const s = view.summary;
  const lv = networkProgress(s.networkExp);
  const meta: Array<[string, string]> = [
    ["首次登录", s.firstLogin ? `${fmtDate(s.firstLogin)} · ${accountAge(s.firstLogin)}` : "-"],
    ["最近登录", s.lastLogin ? relativeTime(s.lastLogin) : "隐藏"],
    ["最近游戏", gameTypeCn(s.mostRecentGame) ?? "-"],
    ["语言", s.language ? (s.language === "CHINESE_SIMPLIFIED" ? "简体中文" : s.language === "ENGLISH" ? "英语" : s.language) : "-"],
  ];

  return (
    <section className="hx-panel border border-white/10 bg-card">
      <PanelHeader view={view} canRefresh={canRefresh} />

      <div className="grid gap-6 p-5 sm:grid-cols-[220px_1fr] sm:p-6">
        <div className="flex justify-center sm:block">
          <SkinViewer3D uuid={s.uuid} name={s.name} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <RankTag s={s} />
            <h3 className="min-w-0 truncate font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{s.name}</h3>
            {s.guild && (
              <span className="tag" style={s.guild.tagColor ? { color: s.guild.tagColor, borderColor: `${s.guild.tagColor}55` } : undefined}>
                {s.guild.tag ? `[${s.guild.tag}] ` : ""}
                {s.guild.name}
                <span className="ml-1.5 text-zinc-600">· {s.guild.members} 人</span>
              </span>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-end justify-between font-mono text-[11px] tracking-[0.12em] text-zinc-500">
              <span>NETWORK LEVEL</span>
              <span>
                {fmtInt(lv.current)} / {fmtInt(lv.needed)} XP → {lv.level + 1}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <strong className="text-5xl font-black tracking-tight text-white">{lv.level}</strong>
              <span className="font-mono text-sm text-zinc-300">{(lv.progress * 100).toFixed(1)}%</span>
            </div>
            <div className="hx-bar mt-3" aria-hidden="true">
              <span style={{ width: `${Math.max(1, lv.progress * 100)}%` }} />
            </div>
          </div>

          <div className="mt-5">
            <StatGrid
              cols={4}
              items={[
                { label: "成就点数", value: fmtInt(s.achievementPoints) },
                { label: "卡玛", value: fmtCoins(s.karma) },
                { label: "任务完成", value: fmtInt(s.questsCompleted) },
                { label: "总胜场", value: s.totalWins === null ? "-" : fmtInt(s.totalWins) },
              ]}
            />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-zinc-600">{k}</dt>
                <dd className="truncate text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {s.games.length > 0 && (
        <div className="border-t border-white/10 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="sublabel">分游戏统计</h3>
            <span className="font-mono text-xs text-zinc-500">{s.games.length} 个有记录</span>
          </div>
          <div className="grid border-l border-t border-white/10 sm:grid-cols-2 xl:grid-cols-3">
            {s.games.map((g) => (
              <GameCard key={g.key} g={g} />
            ))}
          </div>
        </div>
      )}

      {view.skyblock && <SkyblockSection sb={view.skyblock} />}

      <footer className="border-t border-white/10 px-5 py-3 text-xs leading-5 text-zinc-600">
        Hypixel 官方数据每 6 小时更新，只反映公开统计，不代表账号所有权或可交易性。
      </footer>
    </section>
  );
}

function GameCard({ g }: { g: GameSummary }) {
  return (
    <div className="hx-game border-b border-r border-white/10 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-zinc-500">{g.name.toUpperCase()}</span>
        <span className="text-xs text-zinc-500">{g.nameCn}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <strong className={`font-mono text-2xl font-black tracking-tight ${g.headline.rainbow ? "hx-rainbow" : ""}`} style={!g.headline.rainbow && g.headline.color ? { color: g.headline.color } : undefined}>
          {g.headline.value}
        </strong>
        <span className="text-xs text-zinc-500">{g.headline.label}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
        {g.stats.map((st) => (
          <div key={st.label} className="min-w-0">
            <dt className="truncate text-[10px] text-zinc-600">{st.label}</dt>
            <dd className="truncate font-mono text-sm text-zinc-200">{st.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SkyblockSection({ sb }: { sb: SkyblockSummary }) {
  return (
    <div className="border-t border-white/10 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="sublabel">SKYBLOCK · 空岛生存</h3>
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          档案 {sb.profileName}
          {sb.gameMode && <span className="status-draft">{SB_MODE_CN[sb.gameMode] ?? sb.gameMode}</span>}
        </span>
      </div>
      <StatGrid
        cols={4}
        items={[
          { label: "技能平均", value: sb.skillAverage.toFixed(2) },
          { label: "地牢等级", value: sb.catacombs ? `${sb.catacombs.level}` : "-" },
          { label: "钱袋", value: fmtCoins(sb.purse) },
          { label: "银行", value: sb.bank === null ? "未公开" : fmtCoins(sb.bank) },
        ]}
      />
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {sb.skills.map((k) => (
          <div key={k.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-zinc-400">{k.name}</span>
              <span className="font-mono text-zinc-100">
                {k.level}
                <span className="text-zinc-600"> / {k.cap}</span>
              </span>
            </div>
            <div className="hx-skill-bar mt-1.5" aria-hidden="true">
              <span style={{ width: `${Math.max(1, (k.level / k.cap) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {(sb.slayers.length > 0 || sb.fairySouls !== null) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-600">SLAYER</span>
          {sb.slayers.map((sl) => (
            <span key={sl.key} className="tag">
              {sl.name} <span className="text-zinc-100">{sl.level}</span>
            </span>
          ))}
          {sb.fairySouls !== null && <span className="tag">精灵之魂 <span className="text-zinc-100">{sb.fairySouls}</span></span>}
        </div>
      )}
    </div>
  );
}

export function HypixelPanelSkeleton() {
  return (
    <section className="border border-white/10 bg-card" aria-busy="true" aria-label="正在加载 Hypixel 数据">
      <PanelHeader />
      <div className="grid gap-6 p-5 sm:grid-cols-[220px_1fr] sm:p-6">
        <div className="hx-skel mx-auto h-[330px] w-[220px] sm:mx-0" />
        <div className="space-y-4">
          <div className="hx-skel h-9 w-2/3" />
          <div className="hx-skel h-14 w-1/3" />
          <div className="hx-skel h-1 w-full" />
          <div className="grid grid-cols-4 gap-px">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hx-skel h-16" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
