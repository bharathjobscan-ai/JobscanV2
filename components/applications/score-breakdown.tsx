import { PILLAR_WEIGHTS, pillarKeyFor, type PillarKey } from "@/config/scoreg";
import type { JobScoreAnalysis, ScoreLineItem } from "@/db/schema";

/**
 * The scoring rubric, itemised so a lost point is traceable to the rule that
 * withheld it (JSV2S1172, brought to the design 2026-09-23).
 *
 * One panel per pillar rather than one table per pillar: the three pillars are
 * read against each other — "which of the three cost me the score?" — and
 * side-by-side panels answer that at a glance where stacked tables make you
 * hold two numbers in your head. The bar is the same fact as the number, read
 * without reading.
 *
 * A component either passed or it cost points, so that is what the right-hand
 * column says: `pass`, or the signed points lost. The raw award survives on the
 * sub-label, because "−25" alone does not tell you out of what.
 *
 * Handles both shapes: line items (current) and the flat map older rows hold.
 */

function isLineItems(
  breakdown: JobScoreAnalysis["breakdown"],
): breakdown is ScoreLineItem[] {
  return Array.isArray(breakdown);
}

/** Green when full marks, red when nothing scored, amber in between. */
function toneFor(awarded: number, max: number) {
  if (max <= 0) return "text-muted";
  const ratio = awarded / max;
  if (ratio >= 0.999) return "text-positive";
  if (ratio <= 0.001) return "text-negative";
  return "text-warning";
}

function barFor(score: number) {
  if (score >= 85) return "bg-positive";
  if (score <= 40) return "bg-negative";
  return "bg-warning";
}

/**
 * One 14px mark per pillar: a stamp, a page, a target.
 *
 * Only drawn for a pillar the rubric names — an unrecognised pillar gets no
 * glyph rather than a guessed one.
 */
function PillarGlyph({ pillar }: { pillar: PillarKey }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };
  if (pillar === "visa") {
    return (
      <svg {...common}>
        <rect x="3" y="1.8" width="10" height="12.4" rx="1.4" />
        <circle cx="8" cy="6.6" r="2.1" />
        <path d="M5.4 11.4h5.2" />
      </svg>
    );
  }
  if (pillar === "resume") {
    return (
      <svg {...common}>
        <path d="M4 1.8h5L12.2 5v9.2H4z" />
        <path d="M9 1.8V5h3.2M5.9 8.4h4.2M5.9 11h4.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" />
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScoreBreakdown({ analysis }: { analysis: JobScoreAnalysis }) {
  const { breakdown } = analysis;
  if (!breakdown) return null;

  // --- Legacy flat map -------------------------------------------------------
  if (!isLineItems(breakdown)) {
    const entries = Object.entries(breakdown);
    if (entries.length === 0) return null;
    return (
      <div className="rounded-md border border-line bg-surface p-5">
        <p className="text-[10px] tracking-[0.14em] text-accent uppercase">
          Score breakdown
        </p>
        <dl className="mt-3 flex flex-col gap-2">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[10rem_1fr] gap-3 text-[13.5px]">
              <dt className="text-faint capitalize">
                {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </dt>
              <dd className="tabular-nums">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11.5px] text-subtle">
          Scored before itemised breakdowns — regenerate for the full working.
        </p>
      </div>
    );
  }

  if (breakdown.length === 0) return null;

  // Preserve the model's ordering within each pillar.
  const pillars: { name: string; key: PillarKey | null; items: ScoreLineItem[] }[] = [];
  for (const item of breakdown) {
    const name = item.pillar || "Score";
    const existing = pillars.find((p) => p.name === name);
    if (existing) existing.items.push(item);
    else pillars.push({ name, key: pillarKeyFor(name), items: [item] });
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="grid gap-px overflow-hidden rounded-md border border-line bg-line"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))" }}
      >
        {pillars.map((pillar) => {
          const awarded = pillar.items.reduce((sum, i) => sum + (i.awarded ?? 0), 0);
          const max = pillar.items.reduce((sum, i) => sum + (i.max ?? 0), 0);
          // Normalised to 100, the way the weighted calculation reads it, so
          // the panel and the arithmetic below cannot show different numbers.
          const score = max > 0 ? Math.round((awarded / max) * 100) : 0;

          return (
            <div key={pillar.name} className="flex flex-col bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[10px] tracking-[0.14em] text-accent uppercase">
                  {pillar.key ? <PillarGlyph pillar={pillar.key} /> : null}
                  {pillar.name}
                </span>
                {pillar.key ? (
                  <span className="text-[11px] whitespace-nowrap text-faint tabular-nums">
                    {Math.round(PILLAR_WEIGHTS[pillar.key] * 100)}% weight
                  </span>
                ) : null}
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span
                  className={`n-display text-[30px] leading-none font-semibold tabular-nums ${toneFor(
                    awarded,
                    max,
                  )}`}
                >
                  {score}
                </span>
                <span className="text-[12px] text-faint tabular-nums">
                  of 100 · {awarded} of {max} points
                </span>
              </div>

              <div className="mt-3 h-1 rounded-full bg-surface-muted">
                <div
                  className={`h-1 rounded-full ${barFor(score)}`}
                  style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
              </div>

              <div className="mt-3.5 border-t border-line">
                {pillar.items.map((item, i) => {
                  const itemAwarded = item.awarded ?? 0;
                  const itemMax = item.max ?? 0;
                  const lost = itemMax - itemAwarded;
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b py-2.5"
                      style={{ borderColor: "var(--hair)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13.5px]">{item.component}</p>
                        <p className="mt-0.5 text-[11.5px] text-faint tabular-nums">
                          {itemAwarded} of {itemMax}
                          {item.reason ? ` · ${item.reason}` : ""}
                        </p>
                      </div>
                      <span
                        className={`text-[13px] whitespace-nowrap tabular-nums ${toneFor(
                          itemAwarded,
                          itemMax,
                        )}`}
                      >
                        {lost <= 0 ? "pass" : `−${lost}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {analysis.exceptions?.length ? (
        <div>
          <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-warning uppercase">
            Overrides applied
          </p>
          {analysis.exceptions.map((exception, i) => (
            <p
              key={i}
              className="border-b py-2.5 text-[13.5px] text-muted"
              style={{ borderColor: "var(--hair)" }}
            >
              {exception}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
