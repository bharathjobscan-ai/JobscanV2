import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { applications, ingestionRuns, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import type { IngestionRunStatus, IngestionTrigger } from "@/lib/config/constants";

/**
 * What became of the jobs each ingestion run brought in (JSV2S1158).
 *
 * The split between stamped and derived is the whole design, and it is not
 * arbitrary:
 *
 * **Stamped on `ingestion_runs` at ingest time** — fetched, inserted,
 * duplicates, rejected-at-validation. These are facts about what the run SAW,
 * and most of them concern rows that never became a `raw_jobs` record. A row
 * the validator refused leaves nothing behind to count later, so if it is not
 * recorded as it happens it is gone. (That is the reasoning already written on
 * the `ingestion_runs` schema.)
 *
 * **Derived here, live** — auto-qualified, force-qualified, needs review,
 * screened out, binned. These describe the CURRENT STATE of jobs that did land,
 * and that state keeps changing long after the run ends: a job is promoted from
 * the review queue on Tuesday, binned on Friday. Stamping them at ingest would
 * freeze a number that is wrong within the hour, and every later action would
 * have to remember to update a counter on a run it knows nothing about.
 *
 * So: counters for what cannot be recovered, derivation for what can.
 */

export type RunOutcome = {
  runId: string;
  source: string;
  trigger: IngestionTrigger;
  status: IngestionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;

  /** Stamped: rows the run handled, including those that never landed. */
  fetched: number;
  inserted: number;
  duplicates: number;
  /** Refused by the validator — no `raw_jobs` row exists for these. */
  rejectedAtValidation: number;

  /** Derived: jobs that landed, by where they are now. */
  landed: number;
  /**
   * True when fetched does not equal landed + duplicates + rejected.
   *
   * The funnel should account for every fetched row. A gap means something was
   * lost between the actor and the database without being counted, which is
   * worth seeing rather than quietly tolerating.
   */
  reconciles: boolean;
  autoQualified: number;
  forceQualified: number;
  needsReview: number;
  screenedOut: number;
  binned: number;
};

export async function getRunOutcomes(limit = 25): Promise<RunOutcome[]> {
  const runs = await db
    .select()
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit);

  if (runs.length === 0) return [];

  /**
   * One grouped query for every run, rather than one query per run.
   *
   * `filter (where ...)` does the counting in Postgres: pulling the jobs back
   * to count them in JavaScript would move thousands of rows across the wire to
   * produce six integers.
   */
  const counts = await db
    .select({
      runId: rawJobs.ingestionRunId,
      landed: sql<number>`count(*)::int`,
      binned: sql<number>`count(*) filter (where ${rawJobs.binnedAt} is not null)::int`,
      // "Auto" and "force" are both promoted jobs; what separates them is
      // whether the GATE said yes or a human overrode it.
      autoQualified: sql<number>`count(*) filter (
        where ${rawJobs.binnedAt} is null
          and ${applications.id} is not null
          and ${rawJobs.prequalification} = 'pass'
      )::int`,
      forceQualified: sql<number>`count(*) filter (
        where ${rawJobs.binnedAt} is null
          and ${applications.id} is not null
          and ${rawJobs.prequalification} is distinct from 'pass'
      )::int`,
      needsReview: sql<number>`count(*) filter (
        where ${rawJobs.binnedAt} is null
          and ${applications.id} is null
          and ${rawJobs.prequalification} = 'review'
      )::int`,
      screenedOut: sql<number>`count(*) filter (
        where ${rawJobs.binnedAt} is null
          and ${applications.id} is null
          and ${rawJobs.prequalification} = 'reject'
      )::int`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(isNotNull(rawJobs.ingestionRunId))
    .groupBy(rawJobs.ingestionRunId);

  const byRun = new Map(counts.map((c) => [c.runId, c]));

  return runs.map((run) => {
    const c = byRun.get(run.id);
    return {
      runId: run.id,
      source: run.source,
      trigger: run.trigger,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      fetched: run.fetched,
      inserted: run.inserted,
      duplicates: run.duplicates,
      rejectedAtValidation: run.rejected,
      landed: c?.landed ?? 0,
      autoQualified: c?.autoQualified ?? 0,
      forceQualified: c?.forceQualified ?? 0,
      needsReview: c?.needsReview ?? 0,
      screenedOut: c?.screenedOut ?? 0,
      binned: c?.binned ?? 0,
      // A run that fetched nothing trivially reconciles; only a real fetch is
      // held to the arithmetic.
      reconciles:
        run.fetched === 0 ||
        run.fetched === (c?.landed ?? 0) + run.duplicates + run.rejected,
    };
  });
}

/**
 * Jobs with no run attribution — everything ingested before runs were recorded.
 *
 * Surfaced rather than hidden: a per-run table that silently omitted most of
 * the corpus would be worse than no table, because the totals would not
 * reconcile with the queue counts and nothing would say why.
 */
export async function countUnattributedJobs(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rawJobs)
    .where(isNull(rawJobs.ingestionRunId));
  return row?.n ?? 0;
}
