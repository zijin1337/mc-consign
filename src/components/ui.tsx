import Link from "next/link";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import type { PageWord } from "@/lib/eyebrow";
import { LinkPending } from "./link-pending";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost" | "white";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary:
    "mc-btn border border-lime-300 bg-lime-300 font-bold text-primary-foreground hover:bg-lime-200 disabled:border-lime-300/30 disabled:bg-lime-300/30 disabled:text-primary-foreground/60 disabled:shadow-none",
  secondary: "border border-white/15 bg-transparent text-zinc-200 hover:bg-white/10 disabled:text-zinc-600 disabled:hover:bg-transparent",
  danger: "border border-rose-400 bg-rose-400 font-bold text-on-rose hover:bg-rose-300 disabled:opacity-40",
  ghost: "text-zinc-400 hover:bg-white/5 hover:text-white disabled:text-zinc-700",
  white: "bg-white font-bold text-black hover:bg-zinc-200",
};
const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
};

/** 全站统一的键盘焦点环：2px 荧光绿（A 类动作色），任何可点击元素都用它 */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none font-semibold transition-colors",
    focusRing,
    "disabled:cursor-not-allowed",
    variantClass[variant],
    sizeClass[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, cn("relative overflow-hidden", className))}>
      {children}
      <LinkPending />
    </Link>
  );
}

// 聚焦：边框变绿 + 2px 绿 outline 贴边，指示面积足够；不再用几乎看不见的 ring-lime-300/10
const controlClass =
  "rounded-none border border-white/10 bg-field px-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime-300 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-lime-300 disabled:bg-white/[0.04] disabled:text-zinc-500";

/** 调用方没指定宽度或高度时给默认值，避免 w-full 和 w-16 同时出现打架 */
function sizeDefaults(className: string | undefined, defaultHeight: string) {
  const hasWidth = /(^|\s)(w-|min-w-|max-w-|flex-1)/.test(className ?? "");
  const hasHeight = /(^|\s)(h-|min-h-)/.test(className ?? "");
  return cn(!hasWidth && "w-full", !hasHeight && defaultHeight);
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(controlClass, sizeDefaults(className, props.type === "file" ? "py-2" : "h-11"), className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(controlClass, "control-select", sizeDefaults(className, "h-11"), className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(controlClass, "py-2.5", sizeDefaults(className, "min-h-24"), className)} />;
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
  group = false,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** 内容是单选 / 多选组（里面自带 label）时用 div+role=group 包裹，避免 label 嵌套 label */
  group?: boolean;
}) {
  const inner = (
    <>
      <span className="mb-2 block text-sm font-semibold text-zinc-400">
        {label}
        {required && (
          <>
            {/* 必填是功能标记：玫红与错误文案同族；读屏念「（必填）」而不是「星」 */}
            <span aria-hidden="true" className="ml-0.5 text-rose-300">
              *
            </span>
            <span className="sr-only">（必填）</span>
          </>
        )}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </>
  );
  if (group) {
    return (
      <div className={cn("block", className)} role="group" aria-label={required ? `${label}（必填）` : label}>
        {inner}
      </div>
    );
  }
  return <label className={cn("block", className)}>{inner}</label>;
}

/** 单选组，用于 全包/不包、能/不能 这类二选一 */
export function RadioGroup({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex h-11 cursor-pointer items-center gap-2 border border-white/10 bg-field px-3 text-sm text-zinc-200 has-[:checked]:border-lime-300/60 has-[:checked]:bg-lime-300/[0.08] has-[:checked]:text-white"
        >
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} />
          <span>
            {o.label}
            {o.hint && <span className="ml-1 text-xs text-zinc-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * 页级等宽小标签：左侧 3px 竖条 + 「分区词 / 下一级位置」。词表见 src/lib/eyebrow.ts。
 * tone=amber 只给置顶栏（琥珀 = 置顶身份色）。
 */
export function Eyebrow({ section, detail, tone = "brand", className }: { section: PageWord; detail?: string; tone?: "brand" | "amber"; className?: string }) {
  return <span className={cn("eyebrow", tone === "amber" && "eyebrow-amber", className)}>{detail ? `${section} / ${detail}` : section}</span>;
}

/**
 * 卡片。flush 时去掉内边距，body 变成横向滚动容器，给表格用：表头贴卡头、行 hover 通到卡边。
 * 空态不要传 flush（虚线空态框会贴死在实线卡边上）。meta 是卡头右侧的等宽灰字槽位。
 */
export function Card({
  title,
  actions,
  meta,
  children,
  className,
  flush = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("border border-border bg-card", flush && "card-flush", className)}>
      {(title || actions || meta) && (
        <header className="mc-rule flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">{title && <h2 className="text-base font-bold text-white">{title}</h2>}</div>
          {(actions || meta) && (
            <div className="flex items-center gap-3">
              {meta && <span className="font-mono text-xs text-zinc-500">{meta}</span>}
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={flush ? "overflow-x-auto" : "p-5"}>{children}</div>
    </section>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs font-bold", className ?? "border border-white/10 bg-white/[0.03] text-zinc-400")}>
      {children}
    </span>
  );
}

const alertIcon = {
  info: Info,
  error: XCircle,
  success: CheckCircle2,
  warn: TriangleAlert,
} as const;

/** 四种提示框都带图标（绿色弱下 success 与 warn 同色，靠图标区分）；成功 / 说明是 status，警告 / 错误是 alert */
export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100",
    error: "border-rose-400/25 bg-rose-400/[0.08] text-rose-100",
    success: "border-lime-300/25 bg-lime-300/[0.07] text-lime-100",
    warn: "border-amber-300/25 bg-amber-300/[0.08] text-amber-100",
  }[kind];
  const Icon = alertIcon[kind];
  return (
    <div role={kind === "error" || kind === "warn" ? "alert" : "status"} className={cn("flex items-start gap-2.5 border px-4 py-3 text-sm leading-6", cls)}>
      <Icon className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  eyebrowDetail,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** 分区词，见 src/lib/eyebrow.ts；页词就是页本身时不写 eyebrowDetail */
  eyebrow?: PageWord;
  eyebrowDetail?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow section={eyebrow} detail={eyebrowDetail} className="mb-3" />}
        <h1 className="text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">{title}</h1>
        {description && <div className="mt-2 text-sm leading-6 text-zinc-500">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** 空状态。stack 居中竖排用于列表为空；bar 横排用于一句话提示（例如游客登录提示） */
export function Empty({
  text,
  title,
  action,
  className,
  layout = "stack",
}: {
  text: string;
  title?: string;
  action?: ReactNode;
  className?: string;
  layout?: "stack" | "bar";
}) {
  const bar = layout === "bar";
  return (
    <div className={cn("empty-state", bar && "empty-bar", className)}>
      <span className="empty-mark" aria-hidden="true" />
      <div className={cn("min-w-0", bar && "flex-1")}>
        {title && <p className="text-base font-bold text-zinc-200">{title}</p>}
        <p className={cn("text-sm leading-6 text-zinc-500", !bar && "mx-auto max-w-md")}>{text}</p>
      </div>
      {action && <div className={cn("flex flex-wrap justify-center gap-2", bar ? "shrink-0" : "mt-3")}>{action}</div>}
    </div>
  );
}

export function DescList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1 border-b border-white/[0.08] pb-2.5">
          <dt className="text-xs text-zinc-500">{it.label}</dt>
          <dd className="text-sm text-zinc-100">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 1px 网格分隔的统计块，对应设计稿的 detail-stat */
export function StatGrid({ items, cols = 3 }: { items: Array<{ label: string; value: ReactNode }>; cols?: 2 | 3 | 4 }) {
  const colsClass = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
  return (
    <div className={cn("grid gap-px overflow-hidden border border-white/10 bg-white/10 text-center", colsClass)}>
      {items.map((it) => (
        <div key={it.label} className="detail-stat">
          <span>{it.label}</span>
          <strong>{it.value}</strong>
        </div>
      ))}
    </div>
  );
}

export const tableClass =
  "w-full text-sm text-zinc-200 [&_th]:px-3 [&_th]:py-2.5 [&_th]:whitespace-nowrap [&_th]:text-left [&_th]:font-mono [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-[0.1em] [&_th]:text-zinc-500 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tbody_tr]:border-t [&_tbody_tr]:border-white/[0.08] [&_tbody_tr:hover]:bg-white/[0.02]";

/** 放在 <Card flush> 里的表格：首末列内边距与卡头（px-5）对齐，表头行下有分隔线 */
export const tableFlushClass = cn(
  tableClass,
  "[&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5 [&_thead_tr]:border-b [&_thead_tr]:border-white/10",
);
