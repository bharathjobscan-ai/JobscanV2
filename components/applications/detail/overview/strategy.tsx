import type { ReactNode } from "react";

/**
 * "Application strategy" — how to play this one.
 *
 * The design shows three rows: approach, outreach, next action. Every line
 * here is assembled in `page.tsx` from something the system actually stores —
 * the band's own advice, the referral record and the reachability line item the
 * scorer wrote. Nothing in this panel is generated copy.
 */
export function StrategyPanel({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  const present = rows.filter((row) => row.value);
  if (present.length === 0) return null;

  return (
    <div className="mt-7 rounded-lg border border-line px-[22px] py-5">
      <p className="text-[10px] tracking-[0.16em] text-accent uppercase">
        Application strategy
      </p>
      <dl className="mt-3.5 grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-x-[18px] gap-y-2.5 text-[13.5px]">
        {present.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-faint">{row.label}</dt>
            <dd className="text-muted">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
