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
      <dt className="text-[10px] tracking-[0.12em] text-faint uppercase">{label}</dt>
      <dd className={`n-display mt-1.5 text-[21px] font-semibold tabular-nums ${colour}`}>
        {value}
      </dd>
    </div>
  );
}

/** A dotted list, as the design draws gaps and preparation. */
function DotList({ items, tone }: { items: string[]; tone: string }) {
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={i}
          className="grid grid-cols-[8px_minmax(0,1fr)] gap-3 border-b py-2.5"
          style={{ borderColor: "var(--hair)" }}
        >
          <span
            aria-hidden
            className="mt-[0.55em] size-[5px] rounded-full"
            style={{ background: tone }}
          />
          <span className="text-[13.5px] text-muted">{item}</span>
        </div>
      ))}
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
    <div className="flex flex-col gap-5">
      <dl className="flex flex-wrap gap-x-12 gap-y-4">
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
        <div className="flex items-start gap-2.5">
          <Badge tone={verdictTone}>Verdict</Badge>
          <p className="text-[13.5px] text-muted">{summary.verdict}</p>
        </div>
      ) : null}

      {summary.companyCategory ? (
        <p className="text-[13.5px]">
          <span className="text-faint">Classified as </span>
          <span>{summary.companyCategory}</span>
          {summary.emphasis ? (
            <span className="text-muted"> — {summary.emphasis}</span>
          ) : null}
        </p>
      ) : null}

      {summary.keywords?.missing?.length ? (
        <div>
          <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-warning uppercase">
            Keywords not covered
          </p>
          <p className="pt-2.5 text-[13px] text-muted">
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
        <details className="border-t border-line pt-3">
          <summary className="flex cursor-pointer items-center justify-between gap-4 text-[13.5px] text-muted hover:text-foreground">
            Gaps &amp; interview preparation
            <span className="n-mono text-[11.5px] text-faint">
              {gaps.length} gap{gaps.length === 1 ? "" : "s"}
              {prep.length > 0 ? ` · ${prep.length} to prepare` : ""}
            </span>
          </summary>

          <div className="mt-4 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {gaps.length > 0 ? (
              <div>
                <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-negative uppercase">
                  Gaps
                </p>
                <DotList items={gaps} tone="var(--negative)" />
              </div>
            ) : null}

            {prep.length > 0 ? (
              <div>
                <p className="border-b border-line pb-2 text-[10px] tracking-[0.14em] text-positive uppercase">
                  Prepare before interview
                </p>
                <DotList items={prep} tone="var(--positive)" />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
