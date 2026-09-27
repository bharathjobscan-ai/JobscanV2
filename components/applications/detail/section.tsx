import type { ReactNode } from "react";

/**
 * The two shapes the Nocturnal detail screen repeats (JSV2S1172).
 *
 * Both exist because the design uses them four times each — a serif heading
 * with a faint note opposite it, and a run of panels separated by a single
 * hairline rather than by gaps and borders. Written once so the hairline trick
 * (a divider-coloured background showing through a 1px grid gap) is not
 * re-derived, slightly differently, in every section.
 */

export function SectionHead({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <h2 className="n-display m-0 text-[26px] font-normal">{title}</h2>
      {meta ? <span className="text-[11.5px] text-faint">{meta}</span> : null}
    </div>
  );
}

export function PanelGrid({
  children,
  min = "210px",
  className = "",
}: {
  children: ReactNode;
  /** Narrowest a panel may be before the grid wraps. */
  min?: string;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-md border border-line bg-line ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Panel({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  /** Replaces the default padding — Tailwind cannot resolve two `p-*` classes. */
  className?: string;
}) {
  return (
    <div className={`bg-surface ${className || "p-5"}`}>
      {label ? (
        <p className="text-[10px] tracking-[0.13em] text-faint uppercase">{label}</p>
      ) : null}
      {children}
    </div>
  );
}

/** A label above a fact, as the job-posting grid and the activity row use it. */
export function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "positive" | "warning" | "negative" | "faint";
}) {
  const colour =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-negative"
          : tone === "faint"
            ? "text-faint"
            : "";
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="text-[10px] tracking-[0.12em] text-faint uppercase">{label}</p>
      <p className={`mt-1.5 text-[14px] ${colour}`}>{value}</p>
    </div>
  );
}
