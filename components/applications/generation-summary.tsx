import { Badge } from "@/components/ui/base";
import type { GenerationSummary as Summary } from "@/lib/ai/types";

/**
 * The CVG output summary for a generated document.
 *
 * Shown in place of the document body: the .docx is the deliverable, so the
 * screen should answer what changed, how the match moved, and what is still
 * missing — not reproduce a resume you are about to download.
 */

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "warning" | "negative";
}) {
  const colour =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-negative"
          : "";
  return (
    <div>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${colour}`}>{value}</dd>
    </div>
  );
}

function coverage(found?: number, total?: number) {
  if (found === undefined || total === undefined || total === 0) return null;
  const ratio = found / total;
  return {
    text: `${found}/${total}`,
    tone: ratio >= 0.8 ? "positive" : ratio >= 0.5 ? "warning" : "negative",
  } as const;
}

export function GenerationSummary({ summary }: { summary: Summary }) {
  const mustHave = coverage(
    summary.keywords?.mustHaveFound,
    summary.keywords?.mustHaveTotal,
  );
  const goodToHave = coverage(
    summary.keywords?.goodToHaveFound,
    summary.keywords?.goodToHaveTotal,
  );

  const uplift =
    summary.matchBefore !== undefined && summary.matchAfter !== undefined
      ? summary.matchAfter - summary.matchBefore
      : null;

  const verdictTone = /reject/i.test(summary.verdict ?? "")
    ? "negative"
    : /borderline/i.test(summary.verdict ?? "")
      ? "warning"
      : "positive";

  const gaps = summary.gaps ?? [];
  // Renamed from `gapBridging` on 2026-09-05 (JSV2S1063). The fallback keeps
  // documents generated before the rename rendering.
  const prep = summary.interviewPrep ?? summary.gapBridging ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {summary.matchAfter !== undefined ? (
          <Stat
            label="JD match"
            value={
              summary.matchBefore !== undefined
                ? `${summary.matchBefore}% → ${summary.matchAfter}%`
                : `${summary.matchAfter}%`
            }
            tone={
              summary.matchAfter >= 85
                ? "positive"
                : summary.matchAfter >= 70
                  ? "warning"
                  : "negative"
            }
          />
        ) : null}
        {uplift !== null ? (
          <Stat
            label="Uplift"
            value={`${uplift >= 0 ? "+" : ""}${uplift} pts`}
            tone={uplift > 0 ? "positive" : undefined}
          />
        ) : null}
        {mustHave ? (
          <Stat label="Must-have keywords" value={mustHave.text} tone={mustHave.tone} />
        ) : null}
        {goodToHave ? (
          <Stat
            label="Good-to-have keywords"
            value={goodToHave.text}
            tone={goodToHave.tone}
          />
        ) : null}
      </dl>

      {summary.verdict ? (
        <div className="flex items-start gap-2">
          <Badge tone={verdictTone}>Verdict</Badge>
          <p className="text-xs">{summary.verdict}</p>
        </div>
      ) : null}

      {summary.companyCategory ? (
        <div className="text-xs">
          <span className="text-subtle">Classified as </span>
          <span className="font-medium">{summary.companyCategory}</span>
          {summary.emphasis ? (
            <span className="text-muted"> — {summary.emphasis}</span>
          ) : null}
        </div>
      ) : null}

      {summary.keywords?.missing?.length ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-warning">
            Keywords not covered
          </h4>
          <p className="text-xs text-muted">
            {summary.keywords.missing.join(" · ")}
          </p>
        </div>
      ) : null}

      {/*
        Gaps and interview preparation are read once and then in the way, so
        they sit behind a disclosure like the score analysis does — need to
        know, not always on screen.

        `interviewPrep` with a `gapBridging` fallback: the field was renamed on
        2026-09-05 (JSV2S1063) and documents generated before that still carry
        the old name. Reading only the new one silently emptied this section.
      */}
      {gaps.length > 0 || prep.length > 0 ? (
        <details className="border-t border-line pt-2.5">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-foreground">
            Gaps &amp; interview preparation
            <span className="ml-1.5 text-subtle">
              ({gaps.length} gap{gaps.length === 1 ? "" : "s"}
              {prep.length > 0 ? ` · ${prep.length} to prepare` : ""})
            </span>
          </summary>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {gaps.length > 0 ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-negative">Gaps</h4>
                <ul className="flex flex-col gap-1 text-xs">
                  {gaps.map((gap, i) => (
                    <li
                      key={i}
                      className="relative pl-4 before:absolute before:left-0 before:top-[0.5em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-negative"
                    >
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {prep.length > 0 ? (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-info">
                  Prepare before interview
                </h4>
                <ul className="flex flex-col gap-1 text-xs">
                  {prep.map((item, i) => (
                    <li
                      key={i}
                      className="relative pl-4 before:absolute before:left-0 before:top-[0.5em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-info"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
