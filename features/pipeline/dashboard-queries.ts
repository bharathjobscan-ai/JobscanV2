import { desc, eq, sql } from "drizzle-orm";

import { applications, ingestionRuns, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import type { IngestionRunStatus, PrequalDecision } from "@/lib/config/constants";

/**
 * Reads for the pipeline page (JSV2S1011, 1012, 1038).
 *
 * Rooted at `raw_jobs`, unlike everything in `features/applications/queries.ts`.
 * That is deliberate and necessary: a screened-out job has no application row,
 * so an applications-rooted query cannot see the majority of what the pipeline
 * did.
 */

export type PileCounts = Record<PrequalDecision | "unevaluated", number>;

/**
 * The piles, after pre-qualification.
 *
 * `pass` is counted separately from "has an application" because they can
 * legitimately diverge: a job promoted by hand from review has an application
 * without a `pass` verdict, and that difference is worth being able to see.
 */
export async function countPiles(): Promise<PileCounts & { withApplication: number }> {
  const [row] = await db
    .select({
      pass: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'pass')::int`,
      review: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'review')::int`,
      reject: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'reject')::int`,
      unevaluated: sql<number>`count(*) filter (where ${rawJobs.prequalification} is null)::int`,
    })
    .from(rawJobs);

  const [apps] = await db.select({ n: sql<number>`count(*)::int` }).from(applications);

  return {
    pass: row?.pass ?? 0,
    review: row?.review ?? 0,
    reject: row?.reject ?? 0,
    unevaluated: row?.unevaluated ?? 0,
    withApplication: apps?.n ?? 0,
  };
}

export type RunRow = {
  id: string;
  source: string;
  trigger: string;
  status: IngestionRunStatus;
  fetched: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  error: string | null;
};

/** Run history, newest first (JSV2S1011, JSV2S1012). */
export async function listRuns(limit = 30): Promise<RunRow[]> {
  return db
    .select({
      id: ingestionRuns.id,
      source: ingestionRuns.source,
      trigger: ingestionRuns.trigger,
      status: ingestionRuns.status,
      fetched: ingestionRuns.fetched,
      inserted: ingestionRuns.inserted,
      duplicates: ingestionRuns.duplicates,
      rejected: ingestionRuns.rejected,
      startedAt: ingestionRuns.startedAt,
      finishedAt: ingestionRuns.finishedAt,
      durationMs: ingestionRuns.durationMs,
      error: ingestionRuns.error,
    })
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit);
}

/** Qualified jobs that have not been scored yet — what the next run will do. */
export async function countAwaitingScore(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      sql`${applications.jobScore} is null and ${rawJobs.prequalification} = 'pass'`,
    );
  return row?.n ?? 0;
}

/** Jobs that qualified but never became an application — should be zero. */
export async function countOrphanedPasses(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(sql`${rawJobs.prequalification} = 'pass' and ${applications.id} is null`);
  return row?.n ?? 0;
}
