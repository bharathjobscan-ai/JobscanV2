import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { aiJobs, applications, ingestionRuns, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { bucketFor, COST_BUCKET_LABELS, type CostBucket } from "./cost";
import { billableGroundedRunIds } from "./grounding";
import { computeCost, type TokenUsage } from "@/lib/ai/pricing";

/**
 * Total spend across the whole system, to a date (JSV2S1134).
 *
 * Distinct from `features/ai/cost.ts`, which answers "what did THIS application
 * cost". This answers "what has this thing cost me", which is a different
 * question with a different unit: AI is billed per token, Apify per result, and
 * grounding per request against a monthly allowance. Adding them needs all
 * three pricing models in one place, and that place is here.
 *
 * Every rule that could mislead is kept explicit: an unrated model is excluded
 * from the total rather than priced at zero, a run with no reported usage is
 * unmeasured rather than free, and grounding inside its allowance genuinely
 * costs nothing.
 */

export type SpendSlice = {
  key: string;
  label: string;
  usd: number;
  runs: number;
  /** Share of the total, 0-1. Zero when nothing has been spent. */
  share: number;
};

export type SpendSummary = {
  /** Inclusive bounds actually applied, echoed back for the UI to display. */
  from: string | null;
  to: string | null;

  totalUsd: number;
  aiUsd: number;
  ingestionUsd: number;

  /** Resume + cover letter, SimG, ScoreG, Apify — the split the owner asked for. */
  slices: SpendSlice[];

  /** Applications created in the window, for the per-application figure. */
  applications: number;
  /**
   * Applications that actually had AI spent on them.
   *
   * The plain per-application figure divides by EVERY application, including
   * those never scored or tailored — which on a corpus that was mostly
   * backfilled makes the average look far better than the next application
   * will cost. Both numbers are reported so neither can mislead alone.
   */
  processedApplications: number;
  /** Total spend divided by applications that were actually processed. */
  costPerProcessedUsd: number | null;
  /**
   * Total spend divided by applications produced.
   *
   * Null rather than infinite when nothing was produced: a window with spend
   * and no applications has no meaningful per-application cost, and reporting
   * one would be arithmetic rather than information.
   */
  costPerApplicationUsd: number | null;

  /** Jobs ingested in the window, and what each cost to acquire. */
  jobsIngested: number;
  costPerJobUsd: number | null;

  aiRuns: number;
  ingestionRuns: number;
  /** Runs whose model has no rate on file — counted, never guessed at. */
  unratedRuns: number;
  /** Runs the provider reported no usage for, so cost is unknowable. */
  unmeasuredRuns: number;
  groundedRuns: number;
};

/** Inclusive `to`, compared against the start of the following day. */
function dateBounds(from?: string | null, to?: string | null) {
  const start = from ? new Date(`${from}T00:00:00`) : null;
  let end: Date | null = null;
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      end = d;
    }
  }
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end,
  };
}

function inWindow(column: Parameters<typeof gte>[0], start: Date | null, end: Date | null) {
  const clauses = [];
  if (start) clauses.push(gte(column, start));
  if (end) clauses.push(lt(column, end));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function getSpendSummary(
  from?: string | null,
  to?: string | null,
): Promise<SpendSummary> {
  const { start, end } = dateBounds(from, to);

  const [aiRows, runRows, appRow, jobRow, monthlyGrounded] = await Promise.all([
    db
      .select({
        id: aiJobs.id,
        taskType: aiJobs.taskType,
        model: aiJobs.model,
        usage: aiJobs.usage,
        allowedTools: aiJobs.allowedTools,
        finishedAt: aiJobs.finishedAt,
      })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.status, "succeeded"),
          isNotNull(aiJobs.finishedAt),
          inWindow(aiJobs.finishedAt, start, end),
        ),
      ),

    db
      .select({ costUsd: ingestionRuns.costUsd, source: ingestionRuns.source })
      .from(ingestionRuns)
      .where(and(isNotNull(ingestionRuns.costUsd), inWindow(ingestionRuns.startedAt, start, end))),

    db
      .select({
        n: sql<number>`count(*)::int`,
        processed: sql<number>`count(*) filter (where exists (
          select 1 from ${aiJobs} aj
          where aj.application_id = ${applications.id} and aj.status = 'succeeded'
        ))::int`,
      })
      .from(applications)
      .where(inWindow(applications.createdAt, start, end)),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(rawJobs)
      .where(inWindow(rawJobs.firstSeenAt, start, end)),

    // Grounding bills against a MONTHLY allowance, so billability cannot be
    // decided from a window that is not a month. The month's runs are read in
    // full and the window is applied afterwards.
    db
      .select({ id: aiJobs.id, finishedAt: aiJobs.finishedAt })
      .from(aiJobs)
      .where(and(eq(aiJobs.allowedTools, "GoogleSearch"), eq(aiJobs.status, "succeeded"))),
  ]);

  const billableGrounding = billableGroundedRunIds(monthlyGrounded);

  const byBucket = new Map<CostBucket, { usd: number; runs: number }>();
  let aiUsd = 0;
  let unratedRuns = 0;
  let unmeasuredRuns = 0;
  let groundedRuns = 0;

  for (const row of aiRows) {
    const usage = row.usage as Partial<TokenUsage> | null;
    const measured =
      usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined);

    if (!measured || !row.model) {
      unmeasuredRuns += 1;
      continue;
    }

    const cost = computeCost(row.model, {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheCreationTokens: usage.cacheCreationTokens ?? 0,
    });
    if (!cost.rated) unratedRuns += 1;

    const grounded = row.allowedTools === "GoogleSearch";
    if (grounded) groundedRuns += 1;
    const groundingUsd =
      grounded && billableGrounding.has(row.id) ? 0.014 : 0;

    const total = cost.totalCost + groundingUsd;
    aiUsd += total;

    const bucket = bucketFor(row.taskType);
    const entry = byBucket.get(bucket) ?? { usd: 0, runs: 0 };
    entry.usd += total;
    entry.runs += 1;
    byBucket.set(bucket, entry);
  }

  const ingestionUsd = runRows.reduce((n, r) => n + Number(r.costUsd ?? 0), 0);
  const totalUsd = aiUsd + ingestionUsd;

  const slices: SpendSlice[] = [
    ...(["scoring", "documents", "evaluation"] as CostBucket[]).map((key) => {
      const e = byBucket.get(key) ?? { usd: 0, runs: 0 };
      return {
        key,
        label: COST_BUCKET_LABELS[key],
        usd: e.usd,
        runs: e.runs,
        share: totalUsd > 0 ? e.usd / totalUsd : 0,
      };
    }),
    {
      key: "ingestion",
      label: "Apify fetch",
      usd: ingestionUsd,
      runs: runRows.length,
      share: totalUsd > 0 ? ingestionUsd / totalUsd : 0,
    },
  ];

  const applicationCount = appRow[0]?.n ?? 0;
  const processedCount = appRow[0]?.processed ?? 0;
  const jobCount = jobRow[0]?.n ?? 0;

  return {
    from: from ?? null,
    to: to ?? null,
    totalUsd,
    aiUsd,
    ingestionUsd,
    slices,
    applications: applicationCount,
    costPerApplicationUsd: applicationCount > 0 ? totalUsd / applicationCount : null,
    processedApplications: processedCount,
    costPerProcessedUsd: processedCount > 0 ? totalUsd / processedCount : null,
    jobsIngested: jobCount,
    costPerJobUsd: jobCount > 0 ? totalUsd / jobCount : null,
    aiRuns: aiRows.length,
    ingestionRuns: runRows.length,
    unratedRuns,
    unmeasuredRuns,
    groundedRuns,
  };
}
