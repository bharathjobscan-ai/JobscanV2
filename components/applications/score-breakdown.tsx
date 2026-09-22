import { PILLAR_WEIGHTS, pillarKeyFor } from "@/config/scoreg";
import type { JobScoreAnalysis, ScoreLineItem } from "@/db/schema";

/**
 * The scoring rubric, itemised so a lost point is traceable to the rule that
 * withheld it.
 *
 * One panel per pillar rather than one table per pillar (JSV2S1172): the three
 * pillars are read against each other — "which of the three cost me the score?"
 * — and side-by-side panels answer that at a glance where stacked tables make
 * you hold two numbers in your head.
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

/** The pillar's share of the final score, where the rubric names a known one. */
function weightOf(name: string): string | null {
  const key = pillarKeyFor(name);
  return key ? `${Math.round(PILLAR_WEIGHTS[key] * 100)}% of the score` : null;
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
  const pillars: { name: string; items: ScoreLineItem[] }[] = [];
  for (const item of breakdown) {
    const name = item.pillar || "Score";
    const existing = pillars.find((p) => p.name === name);
    if (existing) existing.items.push(item);
    else pillars.push({ name, items: [item] });
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
          const weight = weightOf(pillar.name);

          return (
            <div key={pillar.name} className="flex flex-col bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] tracking-[0.14em] text-accent uppercase">
                  {pillar.name}
                </span>
                {weight ? (
                  <span className="text-[11px] whitespace-nowrap text-faint">{weight}</span>
                ) : null}
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span
                  className={`n-display text-[30px] leading-none font-semibold tabular-nums ${toneFor(
                    awarded,
                    max,
                  )}`}
                >
                  {awarded}
                </span>
                <span className="text-[12px] text-faint tabular-nums">
                  of {max} · {max - awarded} lost
                </span>
              </div>

              <div className="mt-3.5 border-t border-line">
                {pillar.items.map((item, i) => {
                  const lost = (item.max ?? 0) - (item.awarded ?? 0);
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b py-2.5"
                      style={{ borderColor: "var(--hair)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13.5px]">{item.component}</p>
                        {item.reason ? (
                          <p className="mt-0.5 text-[11.5px] text-faint">{item.reason}</p>
                        ) : null}
                      </div>
                      <span
                        className={`text-[13px] whitespace-nowrap tabular-nums ${toneFor(
                          item.awarded ?? 0,
                          item.max ?? 0,
                        )}`}
                      >
                        {item.awarded}/{item.max}
                        {lost > 0 ? (
                          <span className="ml-1.5 text-negative">−{lost}</span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {analysis.finalCalculation ? (
        <p className="n-mono rounded-md bg-surface-muted px-3 py-2 text-[11.5px] tabular-nums">
          {analysis.finalCalculation}
        </p>
      ) : null}

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
