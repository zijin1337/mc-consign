/** 枚举的中文显示，前后端共用，不能 import server-only 模块。 */

export const FEE_MODE_LABEL = { all_in: "全包", exclusive: "不包" } as const;
export const FEE_MODE_HINT = {
  all_in: "标价已含中介费",
  exclusive: "买家另付中介费",
} as const;

export const SOURCE_LABEL = { self_bought: "自购正版", mfa: "MFA", second_hand: "二手" } as const;

export const LISTING_STATUS_LABEL = {
  pending_review: "待审核",
  on_sale: "在售",
  rejected: "已拒绝",
  off_shelf: "已下架",
  in_trade: "交易中",
  sold: "已完成",
  deleted: "已删除",
} as const;

export const LISTING_STATUS_CLASS: Record<keyof typeof LISTING_STATUS_LABEL, string> = {
  pending_review: "bg-amber-300/15 text-amber-300",
  // 在售是缺省状态，不发绿；只留一颗 6px 绿方点表示「平台放行」
  on_sale: "bg-white/[0.06] text-zinc-100 before:mr-1.5 before:inline-block before:size-1.5 before:bg-lime-300 before:content-['']",
  rejected: "bg-rose-400/15 text-rose-300",
  off_shelf: "bg-white/10 text-zinc-300",
  // 交易中 = 实色 cyan，与首页封面角标同款；意向单的交易中也用它
  in_trade: "bg-cyan-300 text-on-cyan",
  sold: "bg-violet-300/15 text-violet-300",
  deleted: "bg-white/5 text-zinc-500",
};

/** 会员类型对应的封面配色，无截图时用。VIP 用 lime 是忠实于 Hypixel 的 §a 绿，属会员色板不属语义；未知会员按「无」走 rose */
export const RANK_ACCENT: Record<string, "lime" | "cyan" | "violet" | "amber" | "rose" | "mint"> = {
  "MVP++": "amber",
  "MVP+": "cyan",
  MVP: "violet",
  "VIP+": "mint",
  VIP: "lime",
  无: "rose",
};

export const ORDER_STATUS_LABEL = {
  pending_assign: "待分派",
  pending_contact: "待联系",
  in_progress: "交易中",
  completed: "已完成",
  cancelled: "已取消",
} as const;

export const CANCEL_REASON_LABEL = {
  buyer_quit: "买家放弃或失联",
  seller_quit: "卖家放弃或失联",
  mismatch: "验号与描述不符",
  price_disagree: "价格未谈妥",
  sold_elsewhere: "账号已售出",
  other: "其他",
  buyer_withdrawn: "买家撤回",
  listing_unavailable: "账号已下架或删除",
} as const;

/** 中介 / 超管手动取消时可选的原因；其余是系统自动写入的 */
export const AGENT_CANCEL_REASONS = ["buyer_quit", "seller_quit", "mismatch", "price_disagree", "other"] as const;

export const ORDER_STATUS_CLASS: Record<keyof typeof ORDER_STATUS_LABEL, string> = {
  pending_assign: "bg-amber-300/15 text-amber-300",
  pending_contact: "bg-cyan-300/15 text-cyan-300",
  in_progress: "bg-cyan-300 text-on-cyan",
  completed: "bg-violet-300/15 text-violet-300",
  cancelled: "bg-white/10 text-zinc-400",
};

export const AFTERSALE_STATUS_LABEL = { open: "处理中", resolved: "已解决", rejected: "已驳回" } as const;
/** 处理中 = 需要人处理（amber）；已解决 = 终态（violet，与已完成同族）；已驳回 = 静止 */
export const AFTERSALE_STATUS_CLASS: Record<keyof typeof AFTERSALE_STATUS_LABEL, string> = {
  open: "bg-amber-300/15 text-amber-300",
  resolved: "bg-violet-300/15 text-violet-300",
  rejected: "bg-white/10 text-zinc-400",
};
export const AFTERSALE_RESULT_LABEL = { refund: "退款", negotiated: "协商解决", rejected: "驳回" } as const;

export const ROLE_LABEL = { user: "用户", agent: "中介", admin: "超管" } as const;

export const USER_STATUS_LABEL = { active: "正常", banned: "已封禁" } as const;

export function formatPrice(n: number) {
  return `¥${n.toLocaleString("zh-CN")}`;
}

/** 站点统一时区，不依赖服务器 TZ（Docker 默认 UTC 会让日期偏 8 小时） */
export const SITE_TZ = process.env.SITE_TZ || "Asia/Shanghai";

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("zh-CN", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-CN", { timeZone: SITE_TZ, hour12: false });
}

// ---------- 求购 ----------

/** 求购单状态。expired 不落库，是「求购中且已到期」的展示状态（见 wanted-shared.ts） */
export const WANTED_STATUS_LABEL = {
  open: "求购中",
  fulfilled: "已完成",
  closed: "已关闭",
  removed: "已下架",
  expired: "已过期",
} as const;

/** 求购中是缺省状态且不经审核，没有「平台放行」的绿方点；已过期需要买家续期，用琥珀提醒 */
export const WANTED_STATUS_CLASS: Record<keyof typeof WANTED_STATUS_LABEL, string> = {
  open: "bg-white/[0.06] text-zinc-100",
  fulfilled: "bg-violet-300/15 text-violet-300",
  closed: "bg-white/10 text-zinc-400",
  removed: "bg-white/5 text-zinc-500",
  expired: "bg-amber-300/15 text-amber-300",
};

export const WANTED_OFFER_STATUS_LABEL = {
  pending: "待买家回应",
  accepted: "买家已下单",
  declined: "已谢绝",
  withdrawn: "已撤回",
  closed: "已关闭",
} as const;

/** 待回应 = 等买家动作（amber）；已下单 = 进入交易通道（浅 cyan，与意向单待联系同族） */
export const WANTED_OFFER_STATUS_CLASS: Record<keyof typeof WANTED_OFFER_STATUS_LABEL, string> = {
  pending: "bg-amber-300/15 text-amber-300",
  accepted: "bg-cyan-300/15 text-cyan-300",
  declined: "bg-white/10 text-zinc-400",
  withdrawn: "bg-white/5 text-zinc-500",
  closed: "bg-white/10 text-zinc-400",
};
