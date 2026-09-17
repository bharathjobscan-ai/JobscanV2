import {
  GROUNDING_COST_PER_REQUEST,
  GROUNDING_FREE_PER_MONTH,
} from "@/lib/ai/pricing";

/**
 * Google Search grounding usage against the monthly free allowance
 * (JSV2S1131).
 *
 * Grounding is the one cost in this system that is **not** a function of
 * tokens: it bills per request, 5,000 free per month across Gemini 3.x, then
 * $14 per 1,000. That is why `features/ai/cost.ts` computes
 * `groundingUsdIfBillable` but does not add it to any total — inside the
 * allowance it genuinely costs nothing, and adding it would overstate spend.
 *
 * The consequence is that the per-application figure is honest only while the
 * allowance holds, and silently understates the moment it does not. This module
 * is what makes that boundary visible instead of a surprise on an invoice.
 *
 * Pure so it is testable without a database; the query lives in
 * `budget-queries.ts`.
 */

export type GroundingUsage = {
  /** Grounded requests made this calendar month. */
  used: number;
  free: number;
  remaining: number;
  /** Requests already past the allowance, which are genuinely billed. */
  billable: number;
  billableUsd: number;
  /** 0-1 through the allowance, capped at 1 for display. */
  ratio: number;
  /** True once past 80% — early enough to act before the cliff. */
  warn: boolean;
  exhausted: boolean;
  /**
   * Cost of the NEXT grounded request. Zero inside the allowance — the number
   * that makes "should scoring stay grounded?" (JSV2S1146) a real question.
   */
  marginalUsd: number;
};

export const GROUNDING_WARN_RATIO = 0.8;

/**
 * Which grounded runs this month actually cost money (JSV2S1131).
 *
 * The allowance is consumed in time order, so the first 5,000 grounded requests
 * of a calendar month are free and everything after is billed. That makes
 * "is this run billable?" a property of its *position* in the month, not of the
 * run itself — the same application costs a different amount in January than in
 * a month where it happens to be request 5,001.
 *
 * Returned as a set of ids so a per-application total can price only its own
 * runs, without the caller having to re-derive the month's ordering.
 */
export function billableGroundedRunIds(
  monthlyGroundedRuns: readonly { id: string; finishedAt: Date | null }[],
): Set<string> {
  const ordered = [...monthlyGroundedRuns].sort((a, b) => {
    // A run with no finish time cannot be placed in the month's order; sorting
    // it last means it is only ever billed if the allowance is already gone,
    // which is the conservative reading.
    const at = a.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return at - bt;
  });

  return new Set(ordered.slice(GROUNDING_FREE_PER_MONTH).map((r) => r.id));
}

export function groundingUsage(used: number): GroundingUsage {
  const safe = Math.max(0, Math.trunc(used));
  const remaining = Math.max(0, GROUNDING_FREE_PER_MONTH - safe);
  const billable = Math.max(0, safe - GROUNDING_FREE_PER_MONTH);
  const ratio = Math.min(1, safe / GROUNDING_FREE_PER_MONTH);

  return {
    used: safe,
    free: GROUNDING_FREE_PER_MONTH,
    remaining,
    billable,
    billableUsd: billable * GROUNDING_COST_PER_REQUEST,
    ratio,
    warn: ratio >= GROUNDING_WARN_RATIO,
    exhausted: remaining === 0,
    marginalUsd: remaining > 0 ? 0 : GROUNDING_COST_PER_REQUEST,
  };
}
