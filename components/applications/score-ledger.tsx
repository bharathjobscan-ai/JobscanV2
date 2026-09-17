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
export function ScoreLedgerTable({ ledger }: { ledger: ScoreLedger }) {
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between gap-3 pb-2">
        <span className="text-[10px] font-medium tracking-wide text-accent uppercase">
          How {ledger.stored ?? ledger.computed} was reached
        </span>
        <span className="text-[11px] text-faint">
          Every point starts on the table and is lost, not won
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] gap-3 border-b border-line pb-1.5 text-[10px] tracking-wide text-faint uppercase">
        <span>Deduction</span>
        <span className="text-right">Points</span>
        <span className="text-right">Running</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-baseline gap-3 border-b border-line py-2">
        <span className="font-semibold">Points on the table</span>
        <span />
        <span className="text-right text-base font-semibold tabular-nums">100.0</span>
      </div>

      {ledger.pillars.map((pillar) => (
        <div key={pillar.key}>
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-baseline gap-3 border-b border-line py-2">
            <div className="min-w-0">
              <p className="font-medium">{pillar.label}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {Math.round(pillar.weight * 100)}% of the score · scored{" "}
                {pillar.score} / 100
              </p>
              {/* The bar shows how much of this pillar's weight was lost. */}
              <div className="mt-1.5 h-0.5 bg-surface-muted">
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
              className={`text-right tabular-nums ${
                pillar.lost > 0 ? "text-negative" : "text-positive"
              }`}
            >
              {pillar.lost > 0 ? `−${pillar.lost.toFixed(1)}` : "0.0"}
            </span>
            <span className="text-right tabular-nums text-muted">
              {pillar.running.toFixed(1)}
            </span>
          </div>

          {pillar.items
            .filter((item) => item.lost > 0)
            .map((item) => (
              <div
                key={item.component}
                className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-baseline gap-3 py-1"
              >
                <div className="min-w-0 pl-4">
                  <span className="text-muted">
                    {item.component} — {item.awarded} of {item.max}
                  </span>
                  {item.reason ? (
                    <p className="text-[11px] text-subtle">{item.reason}</p>
                  ) : null}
                </div>
                <span className="text-right text-[11.5px] tabular-nums text-faint">
                  −{item.lost.toFixed(1)}
                </span>
                <span />
              </div>
            ))}
        </div>
      ))}

      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-baseline gap-3 border-t-2 border-foreground/40 pt-2">
        <span className="font-semibold">Job score</span>
        <span />
        <span className="text-right text-lg font-semibold tabular-nums">
          {ledger.computed.toFixed(1)}
        </span>
      </div>

      {/*
        The model's arithmetic contradicting its own breakdown is a real
        finding, not a rounding wobble. Saying so beats showing whichever
        number happens to look better.
      */}
      {!ledger.reconciles ? (
        <p className="mt-2 rounded border border-warning/25 bg-warning-bg px-2 py-1.5 text-[11px] text-warning">
          This breakdown sums to {ledger.computed.toFixed(1)}, but the stored
          score is {ledger.stored}. The model&rsquo;s own arithmetic disagrees
          with its own itemisation — treat both with suspicion and regenerate.
        </p>
      ) : null}
    </div>
  );
}
