import { DEFAULT_FEE_TIERS, type FeeTier } from "./fee";

/** 系统配置的类型、默认值、中文名。前后端共用，不能引 server-only 模块。 */
export interface Settings {
  fee_tiers: FeeTier[];
  warranty_days: number;
  max_active_listings: number;
  min_credit_to_list: number;
  max_open_orders: number;
  no_show_limit: number;
  no_show_lock_days: number;
  credit_penalty_aftersale: number;
  credit_penalty_no_show: number;
  /** 单个用户同时挂的求购单上限 */
  wanted_max_active: number;
  /** 求购单默认有效期（天），续期也按它 */
  wanted_default_days: number;
  show_sold_price: boolean;
  announcement: string;
}

export type SettingKey = keyof Settings;

export const SETTING_DEFAULTS: Settings = {
  fee_tiers: DEFAULT_FEE_TIERS,
  warranty_days: 7,
  max_active_listings: 10,
  min_credit_to_list: 60,
  max_open_orders: 3,
  no_show_limit: 3,
  no_show_lock_days: 30,
  credit_penalty_aftersale: 50,
  credit_penalty_no_show: 5,
  wanted_max_active: 3,
  wanted_default_days: 30,
  show_sold_price: true,
  announcement: "",
};

export const SETTING_LABELS: Record<SettingKey, string> = {
  fee_tiers: "中介费阶梯",
  warranty_days: "质保天数",
  max_active_listings: "每位卖家同时在售上限",
  min_credit_to_list: "发布账号最低信用分",
  max_open_orders: "每位买家进行中意向单上限",
  no_show_limit: "爽约几次后限制下单",
  no_show_lock_days: "爽约后限制下单天数",
  credit_penalty_aftersale: "售后判定卖家责任扣分",
  credit_penalty_no_show: "买家每次爽约扣分",
  wanted_max_active: "每位用户同时求购上限",
  wanted_default_days: "求购单默认有效期（天）",
  show_sold_price: "成交记录显示成交价",
  announcement: "首页公告",
};
