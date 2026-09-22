import type { ReactNode } from "react";

import type { ScoreLedger } from "@/features/scoring/ledger";

/**
 * The weighted calculation — how the three pillars become one number
 * (JSV2S1140, brought to the design 2026-09-23).
 *
 * ScoreG's contract is `(Visa × 0.50) + (Resume × 0.30) + (Relevance × 0.20)`,
 * and this panel is that sentence set as arithmetic: each pillar's own score,
 * its weight, the product it contributes, and the total they sum to. A score
 * you cannot audit is one you cannot argue with.
 *
 * Presentation only — every figure comes from `features/scoring/ledger.ts`,
 * which is pure and separately tested. It previously rendered the same data as
 * a running deduction table; the figures are unchanged, the reading is the
 * design's.
 */

export function ScoreLedgerTable({
  ledger,
  /** The verdict callout the design sets beside the arithmetic. */
  aside,
  /** The model's own arithmetic, as it wrote it. */
  finalCalculation,
}: {
  ledger: ScoreLedger;
  aside?: ReactNode;
  finalCalculation?: string | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <div className="rounded-lg bg-surface px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-[10px] tracking-[0.16em] text-accent uppercase">
            Weighted calculation
          </span>
          <span className="text-[11.5px] text-faint">
            Three pillars, one number, no rounding hidden
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-stretch gap-x-3 gap-y-4">
          {ledger.pillars.map((pillar, i) => (
            <div key={pillar.key} className="flex items-stretch gap-3">
              {i > 0 ? (
                <span className="n-display self-center text-[22px] text-faint">+</span>
              ) : null}
              <div className="min-w-[8.5rem]">
                <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
                  {pillar.label}
                </p>
                <p className="n-mono mt-1.5 text-[13px] tabular-nums">
                  {pillar.score} × {pillar.weight.toFixed(2)}
                </p>
                <p className="n-display mt-1 text-[24px] leading-none tabular-nums">
                  {(pillar.score * pillar.weight).toFixed(1)}
                </p>
              </div>
            </div>
          ))}

          <span className="n-display self-center text-[22px] text-faint">=</span>

          <div className="min-w-[8.5rem] rounded-md border border-accent/40 px-4 py-3">
            <p className="text-[10px] tracking-[0.12em] text-faint uppercase">Job score</p>
            <p
              className="n-display mt-1 text-[31px] leading-none tabular-nums"
              style={{ color: "var(--gold)" }}
            >
              {ledger.computed.toFixed(1)}
            </p>
            <p className="mt-1 text-[11px] text-faint tabular-nums">
              {ledger.totalLost.toFixed(1)} of 100 lost
            </p>
          </div>
        </div>

        {finalCalculation ? (
          <p className="n-mono mt-5 border-t border-line pt-3.5 text-[11.5px] text-faint tabular-nums">
            As the model wrote it: {finalCalculation}
          </p>
        ) : null}

        {/*
          The model's arithmetic contradicting its own breakdown is a real
          finding, not a rounding wobble. Saying so beats showing whichever
          number happens to look better.
        */}
        {!ledger.reconciles ? (
          <p className="mt-3 rounded border border-warning/25 bg-warning-bg px-2.5 py-2 text-[11.5px] text-warning">
            This breakdown sums to {ledger.computed.toFixed(1)}, but the stored
            score is {ledger.stored}. The model&rsquo;s own arithmetic disagrees
            with its own itemisation — treat both with suspicion and regenerate.
          </p>
        ) : null}
      </div>

      {aside ? (
        <div className="rounded-lg border border-line px-5 py-5">{aside}</div>
      ) : null}
    </div>
  );
}
