import type { ScoreLedger } from "@/features/scoring/ledger";

/**
 * "How this score was reached" — the deduction ledger (JSV2S1140).
 *
 * Every point starts on the table and is lost to a named rule. That framing is
 * the story's whole purpose: a total invites argument, an itemised deduction
 * tells you which rule to attack.
 *
 * Presentation only — every figure comes from `features/scoring/ledger.ts`,
 * which is pure and separately tested.
 */

const ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-baseline gap-4";

export function ScoreLedgerTable({ ledger }: { ledger: ScoreLedger }) {
  return (
    <div className="rounded-lg bg-surface px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-[10px] tracking-[0.16em] text-accent uppercase">
          How {ledger.stored ?? ledger.computed} was reached
        </span>
        <span className="text-[11.5px] text-faint">
          Every point starts on the table and is lost, not won
        </span>
      </div>

      <div className={`${ROW} pt-4 pb-2 text-[10px] tracking-[0.12em] text-faint uppercase`}>
        <span>Deduction</span>
        <span className="text-right">Points</span>
        <span className="text-right">Running</span>
      </div>

      <div className={`${ROW} border-t border-line py-3`}>
        <span className="text-[14px]">Points on the table</span>
        <span />
        <span className="n-display text-right text-[19px] tabular-nums">100.0</span>
      </div>

      {ledger.pillars.map((pillar) => (
        <div key={pillar.key}>
          <div className={`${ROW} border-t border-line py-3`}>
            <div className="min-w-0">
              <p className="text-[14px]">{pillar.label}</p>
              <p className="mt-0.5 text-[12px] text-faint">
                {Math.round(pillar.weight * 100)}% of the score · scored {pillar.score} / 100
              </p>
              {/* The bar shows how much of this pillar's weight was lost. */}
              <div className="mt-2 h-0.5 bg-surface-muted">
                <div
                  className={`h-0.5 ${
                    pillar.score <= 40
                      ? "bg-negative"
                      : pillar.score >= 85
                        ? "bg-positive"
                        : "bg-warning"
                  }`}
                  style={{ width: `${Math.min(100, 100 - pillar.score)}%` }}
                />
              </div>
            </div>
            <span
              className={`n-display text-right text-[19px] tabular-nums ${
                pillar.lost > 0 ? "text-negative" : "text-positive"
              }`}
            >
              {pillar.lost > 0 ? `−${pillar.lost.toFixed(1)}` : "0.0"}
            </span>
            <span className="n-display text-right text-[19px] text-muted tabular-nums">
              {pillar.running.toFixed(1)}
            </span>
          </div>

          {pillar.items
            .filter((item) => item.lost > 0)
            .map((item) => (
              <div key={item.component} className={`${ROW} py-1.5`}>
                <div className="min-w-0 pl-4">
                  <span className="text-[13px] text-muted">
                    {item.component} — {item.awarded} of {item.max}
                  </span>
                  {item.reason ? (
                    <p className="text-[11.5px] text-subtle">{item.reason}</p>
                  ) : null}
                </div>
                <span className="text-right text-[12px] text-faint tabular-nums">
                  −{item.lost.toFixed(1)}
                </span>
                <span />
              </div>
            ))}
        </div>
      ))}

      <div className={`${ROW} mt-2 border-t-2 border-foreground/40 pt-3.5`}>
        <span className="n-display text-[17px] font-semibold">Job score</span>
        <span />
        <span
          className="n-display text-right text-[31px] tabular-nums"
          style={{ color: "var(--gold)" }}
        >
          {ledger.computed.toFixed(1)}
        </span>
      </div>

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
  );
}
