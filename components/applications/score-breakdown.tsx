import type { JobScoreAnalysis, ScoreLineItem } from "@/db/schema";

/**
 * The scoring rubric, itemised so a lost point is traceable to the rule that
 * withheld it.
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

export function ScoreBreakdown({ analysis }: { analysis: JobScoreAnalysis }) {
  const { breakdown } = analysis;
  if (!breakdown) return null;

  // --- Legacy flat map -------------------------------------------------------
  if (!isLineItems(breakdown)) {
    const entries = Object.entries(breakdown);
    if (entries.length === 0) return null;
    return (
      <div>
        <h3 className="mb-1.5 text-xs font-semibold text-muted">Score breakdown</h3>
        <dl className="flex flex-col gap-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[9rem_1fr] gap-2 text-xs">
              <dt className="font-medium capitalize text-muted">
                {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </dt>
              <dd className="tabular-nums">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-[11px] text-subtle">
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
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-muted">Score breakdown</h3>

      {pillars.map((pillar) => {
        const awarded = pillar.items.reduce((sum, i) => sum + (i.awarded ?? 0), 0);
        const max = pillar.items.reduce((sum, i) => sum + (i.max ?? 0), 0);

        return (
          <div key={pillar.name} className="overflow-x-auto">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h4 className="text-xs font-semibold">{pillar.name}</h4>
              <span className={`text-xs font-medium tabular-nums ${toneFor(awarded, max)}`}>
                {awarded}/{max}
              </span>
            </div>

            <table className="w-full border-collapse text-xs">
              <tbody>
                {pillar.items.map((item, i) => {
                  const lost = (item.max ?? 0) - (item.awarded ?? 0);
                  return (
                    <tr key={i} className="border-t border-line align-top">
                      <td className="w-44 py-1.5 pr-2 font-medium">
                        {item.component}
                      </td>
                      <td
                        className={`w-14 py-1.5 pr-2 text-right tabular-nums ${toneFor(
                          item.awarded ?? 0,
                          item.max ?? 0,
                        )}`}
                      >
                        {item.awarded}/{item.max}
                      </td>
                      <td className="py-1.5 text-muted">
                        {item.reason ?? "—"}
                        {lost > 0 ? (
                          <span className="ml-1 text-negative">
                            (−{lost})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {analysis.finalCalculation ? (
        <p className="rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
          {analysis.finalCalculation}
        </p>
      ) : null}

      {analysis.exceptions?.length ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-warning">
            Overrides applied
          </h4>
          <ul className="flex flex-col gap-1 text-xs">
            {analysis.exceptions.map((exception, i) => (
              <li
                key={i}
                className="relative pl-4 before:absolute before:left-0 before:top-[0.5em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-warning"
              >
                {exception}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
