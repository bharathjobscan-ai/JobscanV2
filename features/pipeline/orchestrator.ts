import { and, asc, eq, isNull } from "drizzle-orm";

import { MAX_SCORES_PER_RUN } from "@/config/pipeline";
import { applications, rawJobs } from "@/db/schema";
import { getBudgetStatus } from "@/features/ai/budget-queries";
import { enqueueTask, TaskBlocked } from "@/features/ai/tasks";
import { isolate, withRetry } from "@/features/ingestion/reliability";
import { db } from "@/lib/db/client";
import type { BudgetStatus } from "@/features/ai/budget";

/**
 * Scheduled scoring pass (JSV2S1136).
 *
 * Takes jobs that passed pre-qualification and have no score, and scores them —
 * the step that turns "jobs arrived overnight" into "a ranked board in the
 * morning". Deliberately does **not** generate documents: that decision stays a
 * button press, so the expensive path keeps a human in it.
 *
 * Three properties matter more than throughput here:
 *
 * - **Idempotent.** The selector is "pre-qualified and unscored", so a run that
 *   dies halfway re-runs safely and never double-charges for the same job.
 * - **Budget-aware.** The ceiling is checked *before* each call, not after.
 * - **Isolated.** One job that fails to score cannot end the run.
 */

export type ScoringOutcome = {
  applicationId: string;
  title: string;
  company: string;
  status: "scored" | "failed" | "blocked" | "skipped";
  score?: number | null;
  reason?: string;
};

export type ScoringPassResult = {
  eligible: number;
  attempted: number;
  scored: number;
  failed: number;
  /** Jobs left unscored because the ceiling tripped. They wait for the next run. */
  deferred: number;
  budget: BudgetStatus;
  stoppedEarly: boolean;
  outcomes: ScoringOutcome[];
};

export type ScoringPassOptions = {
  limit?: number;
  /** Select and report, but make no calls and spend nothing. */
  dryRun?: boolean;
};

/**
 * Jobs eligible for automated scoring.
 *
 * The `prequalification = 'pass'` join is load-bearing. A manual upload creates
 * an application whatever its verdict (ADR-0006), so without this filter the
 * nightly run would score jobs the gate had already screened out — which is the
 * exact spend the gate exists to prevent.
 */
async function selectEligible(limit: number) {
  return db
    .select({
      applicationId: applications.id,
      title: rawJobs.title,
      company: rawJobs.company,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        isNull(applications.jobScore),
        eq(rawJobs.prequalification, "pass"),
        eq(applications.status, "ready_to_apply"),
      ),
    )
    .orderBy(asc(applications.createdAt))
    .limit(limit);
}

export async function runScoringPass(
  options: ScoringPassOptions = {},
): Promise<ScoringPassResult> {
  const limit = Math.min(options.limit ?? MAX_SCORES_PER_RUN, MAX_SCORES_PER_RUN);
  const eligible = await selectEligible(limit);

  const outcomes: ScoringOutcome[] = [];
  let scored = 0;
  let failed = 0;
  let stoppedEarly = false;

  let budget = await getBudgetStatus();

  for (const job of eligible) {
    if (budget.blocked) {
      stoppedEarly = true;
      break;
    }

    if (options.dryRun) {
      outcomes.push({ ...job, status: "skipped", reason: "dry run" });
      continue;
    }

    // Retried because a 429 or a 5xx from the provider is transient and the job
    // is still worth scoring; `isRetryable` refuses to retry a 4xx, so a bad
    // request fails once rather than three times.
    const result = await isolate(() =>
      withRetry(() => enqueueTask(job.applicationId, "score"), { attempts: 3 }),
    );

    if (result.ok) {
      scored += 1;
      outcomes.push({ ...job, status: "scored" });
    } else if (result.error instanceof TaskBlocked) {
      // No usable description. Not a failure of the run — the job simply cannot
      // be scored until someone adds one.
      outcomes.push({ ...job, status: "skipped", reason: result.error.message });
    } else {
      failed += 1;
      outcomes.push({ ...job, status: "failed", reason: result.error.message });
    }

    // Re-read after every call rather than estimating: the ceiling must reflect
    // what was actually billed, including a run that cost more than expected.
    budget = await getBudgetStatus();
  }

  const attempted = outcomes.filter((o) => o.status !== "blocked").length;
  const deferred = eligible.length - attempted;

  for (const job of eligible.slice(attempted)) {
    outcomes.push({
      ...job,
      status: "blocked",
      reason: budget.reason ?? "Spend ceiling reached.",
    });
  }

  return {
    eligible: eligible.length,
    attempted,
    scored,
    failed,
    deferred,
    budget,
    stoppedEarly,
    outcomes,
  };
}
