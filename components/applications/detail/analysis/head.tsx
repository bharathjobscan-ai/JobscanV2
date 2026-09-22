import { PILLAR_WEIGHTS } from "@/config/scoreg";

/**
 * The Analysis tab's own masthead, and its empty state.
 *
 * The design opens every tab the same way: an eyebrow, a serif title, one line
 * of prose that says what you are looking at. The prose here is the rubric's
 * own shape, read out of `config/scoreg.ts`, so it cannot drift from the
 * weights the arithmetic below actually uses.
 */

export function AnalysisHead() {
  const weights = (Object.values(PILLAR_WEIGHTS) as number[])
    .map((w) => `${Math.round(w * 100)}`)
    .join("/");

  return (
    <div>
      <p className="text-[10px] tracking-[0.18em] text-faint uppercase">Analysis</p>
      <h2 className="n-display mt-2 text-[clamp(1.6rem,3vw,2.125rem)] leading-tight font-normal tracking-[-0.02em]">
        Full score analysis
      </h2>
      <p className="mt-2.5 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">
        Three pillars weighted {weights}, itemised so every lost point is
        traceable to the rule that withheld it.
      </p>
    </div>
  );
}

/**
 * No score, said honestly.
 *
 * A gate-qualified application has no breakdown to show, and a zeroed-out one
 * would read as "it scored nothing" — the opposite of what happened (JSV2S1168).
 */
export function AnalysisEmpty({
  gateQualified,
  isIncomplete,
}: {
  gateQualified: boolean;
  isIncomplete: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-6 py-7">
      <p className="n-display text-[19px] font-semibold">
        {gateQualified ? "No arithmetic was run" : "Nothing scored yet"}
      </p>
      <p className="mt-2 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
        {gateQualified
          ? "Every pre-qualification filter passed and the company is a known sponsor, so no scoring call was made and there is no breakdown to show. The gate's working is on the On need tab."
          : isIncomplete
            ? "This posting has no usable description, so it cannot be scored. Paste the job description and generate a score to see the pillars and the arithmetic."
            : "Generate a score to see the three pillars, the itemised deductions and the weighted arithmetic behind them."}
      </p>
    </div>
  );
}
