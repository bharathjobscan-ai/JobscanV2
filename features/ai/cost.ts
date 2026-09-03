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
  cost: CostBreakdown | null;
};

export type CostGroup = { key: string; label: string; runs: number; usd: number };

export type ApplicationCost = {
  runs: RunCost[];
  totalUsd: number;
  byTask: CostGroup[];
  byModel: CostGroup[];
  /** Runs whose model is absent from MODEL_RATES — counted, never guessed at. */
  unratedRuns: number;
  /** Runs with usage the provider never reported, so cost is unknowable. */
  unmeasuredRuns: number;
  groundedRuns: number;
  /** What grounding costs once the monthly free allowance is exhausted. */
  groundingUsdIfBillable: number;
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
    const entry = acc.get(key) ?? { key, label: labelOf(key), runs: 0, usd: 0 };
    entry.runs += 1;
    entry.usd += run.cost?.totalCost ?? 0;
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
export function summariseRuns(rows: CostableRun[]): ApplicationCost {
  const runs: RunCost[] = rows.map((row) => {
    const usage = toTokenUsage(row.usage as StoredUsage);
    return {
      id: row.id,
      taskType: row.taskType,
      taskLabel: AI_TASK_LABELS[row.taskType] ?? row.taskType,
      provider: row.provider,
      model: row.model,
      finishedAt: row.finishedAt,
      durationMs: usage?.durationMs ?? null,
      grounded: row.allowedTools === "GoogleSearch",
      cost: usage && row.model ? computeCost(row.model, usage) : null,
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
    unratedRuns: runs.filter((r) => r.cost && !r.cost.rated).length,
    unmeasuredRuns: runs.filter((r) => !r.cost).length,
    groundedRuns,
    groundingUsdIfBillable: groundedRuns * GROUNDING_COST_PER_REQUEST,
  };
}
