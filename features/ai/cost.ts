import {
  computeCost,
  GROUNDING_COST_PER_REQUEST,
  type CostBreakdown,
  type TokenUsage,
} from "@/lib/ai/pricing";
import { AI_TASK_LABELS, type AiTaskType } from "@/lib/config/constants";

/**
 * JSV2S1132 — what one application has cost in AI, per run.
 *
 * `ai_jobs` is the run ledger (ADR-0005): one row per call, carrying the model
 * that answered and the token counts it reported. Cost is derived here rather
 * than stored, so a correction to `MODEL_RATES` applies to history too.
 *
 * The trade that buys: historical runs are re-priced whenever the rate table
 * changes. Acceptable while the rates are recent and the volume is small. If an
 * accurate ledger is ever needed, cost must be stamped at write time instead —
 * deriving it cannot be made retroactively honest.
 */

export type RunCost = {
  id: string;
  taskType: AiTaskType;
  taskLabel: string;
  provider: string | null;
  model: string | null;
  finishedAt: Date | null;
  durationMs: number | null;
  /** True when this run paid for Google Search grounding. */
  grounded: boolean;
  /**
   * Per-request grounding charge actually incurred by this run (JSV2S1131).
   * Zero while the monthly free allowance holds, which is the normal case.
   */
  groundingUsd: number;
  cost: CostBreakdown | null;
};

export type CostGroup = {
  key: string;
  label: string;
  runs: number;
  usd: number;
  /**
   * Distinct models that produced this group's spend.
   *
   * Carried so the cost card can answer "what am I paying for?" and not just
   * "how much?" — SimG defaults to Opus 5, and the decision to move it to
   * Sonnet 5 is only makeable if the model is on screen next to the number.
   */
  models: string[];
};

/**
 * JSV2S1142 — the split the spend decision actually turns on.
 *
 * Coarser than `byTask` on purpose. The question is "is SimG worth running on
 * every generation?", and that needs three buckets, not four: `tailor_cv` and
 * `cover_letter` are folded together because **one CVG call produces both
 * documents**. Splitting them would need two calls, paying for the CVG skill
 * and master resume twice and letting the letter drift from the CV — so the
 * honest presentation is two lines, not three. That trade is recorded on
 * JSV2S1142 and is the user's to reverse.
 */
export const COST_BUCKETS = ["scoring", "documents", "evaluation"] as const;
export type CostBucket = (typeof COST_BUCKETS)[number];

export const COST_BUCKET_LABELS: Record<CostBucket, string> = {
  scoring: "Job scoring",
  documents: "CV + cover letter",
  evaluation: "SimG evaluation",
};

export function bucketFor(taskType: AiTaskType): CostBucket {
  if (taskType === "score") return "scoring";
  if (taskType === "simg") return "evaluation";
  return "documents";
}

export type ApplicationCost = {
  runs: RunCost[];
  totalUsd: number;
  byTask: CostGroup[];
  byModel: CostGroup[];
  /** JSV2S1142 — scoring vs documents vs SimG, with SimG's share of the total. */
  byBucket: CostGroup[];
  /** What fraction of this application's spend went to SimG, 0-1. */
  evaluationShare: number;
  /** Runs whose model is absent from MODEL_RATES — counted, never guessed at. */
  unratedRuns: number;
  /** Runs with usage the provider never reported, so cost is unknowable. */
  unmeasuredRuns: number;
  groundedRuns: number;
  /**
   * What this application's grounded runs WOULD cost if all were billable.
   * A planning figure — `totalUsd` already includes the ones that actually are.
   */
  groundingUsdIfBillable: number;
  /** Grounding actually billed on this application, and already in `totalUsd`. */
  groundingUsdBilled: number;
};

/** Shape stored in `ai_jobs.usage`; every field may be absent on older rows. */
type StoredUsage = Partial<TokenUsage> | null;

function toTokenUsage(usage: StoredUsage): TokenUsage | null {
  if (!usage) return null;
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = usage;
  // A row with no token counts at all is unmeasured, not free.
  if (inputTokens === undefined && outputTokens === undefined) return null;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadTokens: cacheReadTokens ?? 0,
    cacheCreationTokens: cacheCreationTokens ?? 0,
    durationMs: usage.durationMs,
  };
}

function group(
  runs: RunCost[],
  keyOf: (run: RunCost) => string | null,
  labelOf: (key: string) => string,
): CostGroup[] {
  const acc = new Map<string, CostGroup>();
  for (const run of runs) {
    const key = keyOf(run);
    if (!key) continue;
    const entry = acc.get(key) ?? {
      key,
      label: labelOf(key),
      runs: 0,
      usd: 0,
      models: [],
    };
    entry.runs += 1;
    entry.usd += run.cost?.totalCost ?? 0;
    if (run.model && !entry.models.includes(run.model)) entry.models.push(run.model);
    acc.set(key, entry);
  }
  return [...acc.values()].sort((a, b) => b.usd - a.usd);
}

/** One `ai_jobs` row, narrowed to what costing needs. */
export type CostableRun = {
  id: string;
  taskType: AiTaskType;
  provider: string | null;
  model: string | null;
  allowedTools: string | null;
  usage: unknown;
  finishedAt: Date | null;
};

/**
 * Pure aggregation, split from the query so it is testable without a database.
 * Every rule that could silently mislead lives here: an unknown model is
 * excluded from the total rather than priced at zero, and a run with no
 * reported usage is unmeasured rather than free.
 */
export function summariseRuns(
  rows: CostableRun[],
  /**
   * Grounded runs that fell past the monthly free allowance (JSV2S1131).
   *
   * Passed in rather than derived here, because billability depends on the
   * whole month's ordering and this function only ever sees one application.
   * Omitted means "assume inside the allowance", which is right for the unit
   * suite and for any caller that has not looked the month up.
   */
  billableGroundingIds?: ReadonlySet<string>,
): ApplicationCost {
  const runs: RunCost[] = rows.map((row) => {
    const usage = toTokenUsage(row.usage as StoredUsage);
    const grounded = row.allowedTools === "GoogleSearch";
    // Grounding bills per request, not per token, so it is added on top of the
    // token cost rather than being part of it.
    const groundingUsd =
      grounded && billableGroundingIds?.has(row.id) ? GROUNDING_COST_PER_REQUEST : 0;
    const tokenCost = usage && row.model ? computeCost(row.model, usage) : null;

    return {
      id: row.id,
      taskType: row.taskType,
      taskLabel: AI_TASK_LABELS[row.taskType] ?? row.taskType,
      provider: row.provider,
      model: row.model,
      finishedAt: row.finishedAt,
      durationMs: usage?.durationMs ?? null,
      grounded,
      groundingUsd,
      cost: tokenCost
        ? { ...tokenCost, totalCost: tokenCost.totalCost + groundingUsd }
        : null,
    };
  });

  const groundedRuns = runs.filter((r) => r.grounded).length;

  return {
    runs,
    totalUsd: runs.reduce((sum, r) => sum + (r.cost?.totalCost ?? 0), 0),
    byTask: group(
      runs,
      (r) => r.taskType,
      (key) => AI_TASK_LABELS[key as AiTaskType] ?? key,
    ),
    byModel: group(
      runs,
      (r) => r.model,
      (key) => key,
    ),
    byBucket: group(
      runs,
      (r) => bucketFor(r.taskType),
      (key) => COST_BUCKET_LABELS[key as CostBucket],
    ),
    evaluationShare: (() => {
      const total = runs.reduce((sum, r) => sum + (r.cost?.totalCost ?? 0), 0);
      if (total <= 0) return 0;
      const simg = runs
        .filter((r) => bucketFor(r.taskType) === "evaluation")
        .reduce((sum, r) => sum + (r.cost?.totalCost ?? 0), 0);
      return simg / total;
    })(),
    unratedRuns: runs.filter((r) => r.cost && !r.cost.rated).length,
    unmeasuredRuns: runs.filter((r) => !r.cost).length,
    groundedRuns,
    groundingUsdIfBillable: groundedRuns * GROUNDING_COST_PER_REQUEST,
    groundingUsdBilled: runs.reduce((sum, r) => sum + r.groundingUsd, 0),
  };
}
