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

export type PipelineSummary = PileCounts & {
  withApplication: number;
  /** Qualified but unscored — what the next run will do. */
  awaitingScore: number;
  /** Qualified with no application. Should always be zero. */
  orphanedPasses: number;
};

/**
 * Every headline number in one round trip.
 *
 * Previously five separate queries. On a serverless pool of one connection that
 * is five sequential round trips to a database on another continent for a page
 * that shows six numbers — and it was a meaningful part of why the app froze
 * under navigation. Counting is cheap; connecting is not.
 */
export async function getPipelineSummary(): Promise<PipelineSummary> {
  const [row] = await db
    .select({
      pass: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'pass')::int`,
      review: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'review')::int`,
      reject: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'reject')::int`,
      unevaluated: sql<number>`count(*) filter (where ${rawJobs.prequalification} is null)::int`,
      withApplication: sql<number>`count(${applications.id})::int`,
      awaitingScore: sql<number>`count(*) filter (
        where ${rawJobs.prequalification} = 'pass' and ${applications.jobScore} is null
      )::int`,
      orphanedPasses: sql<number>`count(*) filter (
        where ${rawJobs.prequalification} = 'pass' and ${applications.id} is null
      )::int`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id));

  return {
    pass: row?.pass ?? 0,
    review: row?.review ?? 0,
    reject: row?.reject ?? 0,
    unevaluated: row?.unevaluated ?? 0,
    withApplication: row?.withApplication ?? 0,
    awaitingScore: row?.awaitingScore ?? 0,
    orphanedPasses: row?.orphanedPasses ?? 0,
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
