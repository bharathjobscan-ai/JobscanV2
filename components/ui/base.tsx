import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "neutral" | "positive" | "warning" | "negative" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted border-line",
  positive: "bg-positive-bg text-positive border-positive/25",
  warning: "bg-warning-bg text-warning border-warning/25",
  negative: "bg-negative-bg text-negative border-negative/25",
  info: "bg-info-bg text-info border-info/25",
};

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  meta,
  action,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-sm font-semibold tracking-tight truncate">{title}</h2>
        {meta ? <span className="text-xs text-subtle shrink-0">{meta}</span> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const buttonClass = {
  primary: `${BUTTON_BASE} border-transparent bg-accent text-background hover:opacity-85`,
  secondary: `${BUTTON_BASE} border-line-strong bg-surface hover:bg-surface-muted`,
  ghost: `${BUTTON_BASE} border-transparent text-muted hover:bg-surface-muted hover:text-foreground`,
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonClass }) {
  return <button {...props} className={`${buttonClass[variant]} ${className}`} />;
}

export function LinkButton({
  variant = "secondary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonClass }) {
  return <Link {...props} className={`${buttonClass[variant]} ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-subtle">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";
