import { SPEND_CEILING } from "@/config/pipeline";
import { computeCost, formatUsd, type TokenUsage } from "@/lib/ai/pricing";

/**
 * Spend ceiling arithmetic (JSV2S1137).
 *
 * Pure and database-free so the rule is testable without one — the same split
 * as `features/ai/cost.ts`. The database half is in `./budget-queries.ts`.
 */

export type SpendWindow = {
  spentUsd: number;
  ceilingUsd: number;
  remainingUsd: number;
  /** True once spending has reached or passed the ceiling. */
  exhausted: boolean;
};

export type BudgetStatus = {
  day: SpendWindow;
  month: SpendWindow;
  /** True when either window is exhausted — the run must stop. */
  blocked: boolean;
  reason: string | null;
};

export type PricedRun = { model: string | null; usage: unknown };

/** Shape stored in `ai_jobs.usage`; every field may be absent on older rows. */
function toUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Partial<TokenUsage>;
  if (u.inputTokens === undefined && u.outputTokens === undefined) return null;
  return {
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cacheReadTokens: u.cacheReadTokens ?? 0,
    cacheCreationTokens: u.cacheCreationTokens ?? 0,
  };
}

export function totalCost(runs: readonly PricedRun[]): number {
  return runs.reduce((sum, run) => {
    const usage = toUsage(run.usage);
    if (!usage || !run.model) return sum;
    const cost = computeCost(run.model, usage);
    // An unrated model contributes 0 to the total, which would let an unknown
    // model spend without limit. Counted separately by the caller instead of
    // being silently priced at zero — see `unratedRuns` in cost.ts.
    return sum + cost.totalCost;
  }, 0);
}

function window(spentUsd: number, ceilingUsd: number): SpendWindow {
  return {
    spentUsd: Math.round(spentUsd * 10000) / 10000,
    ceilingUsd,
    remainingUsd: Math.max(0, Math.round((ceilingUsd - spentUsd) * 10000) / 10000),
    exhausted: spentUsd >= ceilingUsd,
  };
}

/**
 * Decide whether the automated run may make another call.
 *
 * Checked *before* each call rather than after, because a ceiling that only
 * notices once it has been crossed is a report, not a limit.
 */
export function budgetStatus(
  todayRuns: readonly PricedRun[],
  monthRuns: readonly PricedRun[],
  ceiling: { dailyUsd: number; monthlyUsd: number } = SPEND_CEILING,
): BudgetStatus {
  const day = window(totalCost(todayRuns), ceiling.dailyUsd);
  const month = window(totalCost(monthRuns), ceiling.monthlyUsd);

  const reason = day.exhausted
    ? `Daily AI spend ceiling reached — ${formatUsd(day.spentUsd)} of ${formatUsd(day.ceilingUsd)}. Unscored jobs stay queued for the next run.`
    : month.exhausted
      ? `Monthly AI spend ceiling reached — ${formatUsd(month.spentUsd)} of ${formatUsd(month.ceilingUsd)}.`
      : null;

  return { day, month, blocked: reason !== null, reason };
}
