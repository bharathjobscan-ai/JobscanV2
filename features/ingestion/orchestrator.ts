import { and, eq, isNotNull } from "drizzle-orm";

import { dailyFetchPlan } from "@/config/pipeline";
import { rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { ingestRows } from "./ingest";
import { isolate } from "./reliability";
import { withRun } from "./runs";
import { ApifyLinkedInAdapter } from "./sources/apify-linkedin";
import type { FetchParams, JobSourceAdapter } from "./sources/types";

/**
 * The ingestion orchestrator (JSV2S1017, JSV2S1035).
 *
 * Until now the nightly job scored but never fetched — `scripts/daily-run.mts`
 * carried a literal `const ingestion = []` and a comment saying the fetcher did
 * not exist. Every real fetch so far has been a script run by hand. This is
 * what makes the scheduled pipeline actually collect anything.
 *
 * Four properties matter more than throughput:
 *
 * - **One run row per location.** A partial night — London fetched, Berlin
 *   timed out — has to be legible afterwards, and a single run row covering all
 *   three would report `partial` without saying which.
 * - **Isolated.** One location failing cannot cost the others (JSV2S1013).
 * - **Costed.** Each run stamps what it spent, so the night has a price
 *   (JSV2S1144).
 * - **Deduped before paying.** Job ids already held are sent as `skipJobId`, so
 *   the actor does not bill for records `ingest.ts` would discard anyway.
 */

export type LocationOutcome = {
  location: string;
  runId: string | null;
  status: "fetched" | "failed" | "skipped";
  fetched: number;
  landed: number;
  duplicates: number;
  qualified: number;
  costUsd: number;
  reason?: string;
};

export type IngestionPassResult = {
  configured: boolean;
  locations: LocationOutcome[];
  totalFetched: number;
  totalLanded: number;
  totalQualified: number;
  totalCostUsd: number;
};

/**
 * Source-native ids already stored, so the actor can skip them.
 *
 * The only dedupe that saves money: `ingest.ts` dedupes after the results have
 * been paid for, this happens before. Scoped to the source, since ids are only
 * unique within one.
 */
async function knownJobIds(source: string): Promise<string[]> {
  const rows = await db
    .select({ id: rawJobs.sourceJobId })
    .from(rawJobs)
    .where(and(eq(rawJobs.source, source), isNotNull(rawJobs.sourceJobId)));
  return rows.map((r) => r.id).filter((id): id is string => Boolean(id));
}

async function fetchOneLocation(
  adapter: JobSourceAdapter,
  params: FetchParams,
  skipJobIds: string[],
  dryRun: boolean,
): Promise<LocationOutcome> {
  const location = params.locations?.[0] ?? "unknown";

  if (dryRun) {
    return {
      location,
      runId: null,
      status: "skipped",
      fetched: 0,
      landed: 0,
      duplicates: 0,
      qualified: 0,
      costUsd: 0,
      reason: `dry run — would ask for ${params.limit} results`,
    };
  }

  const { result, runId, status } = await withRun(
    {
      source: adapter.source,
      trigger: "scheduled",
      // The id list is long and uninteresting; its size is the useful fact.
      params: { ...params, skipJobIds: skipJobIds.length },
    },
    async (run) => {
      const fetched = await adapter.fetch({ ...params, skipJobIds });

      run.count("fetched", fetched.jobs.length + fetched.failures.length);
      for (const f of fetched.failures) run.fail("map", f.payload, f.error);
      if (fetched.costUsd !== undefined) run.spend(fetched.costUsd);
      run.log("fetch", "info", `${location}: ${fetched.jobs.length} mappable`, {
        skipped: skipJobIds.length,
      });

      if (fetched.jobs.length === 0) {
        return { fetched, outcome: null };
      }

      const outcome = await ingestRows(
        fetched.jobs.map((j) => j.row as Record<string, unknown>),
        { trigger: "scheduled", runId: run.id },
      );

      // `inserted` here means rows PERSISTED; IngestResult splits landed rows
      // into qualified and screened-out, and both created a raw_jobs row.
      run.count("inserted", outcome.inserted + outcome.screenedOut);
      run.count("duplicates", outcome.duplicate);
      run.count("rejected", outcome.rejected);

      return { fetched, outcome };
    },
  );

  if (status === "failed" || !result) {
    return {
      location,
      runId,
      status: "failed",
      fetched: 0,
      landed: 0,
      duplicates: 0,
      qualified: 0,
      costUsd: 0,
      reason: "the fetch threw; see the run's error",
    };
  }

  const { fetched, outcome } = result;
  return {
    location,
    runId,
    status: "fetched",
    fetched: fetched.jobs.length + fetched.failures.length,
    landed: outcome ? outcome.inserted + outcome.screenedOut : 0,
    duplicates: outcome?.duplicate ?? 0,
    qualified: outcome?.inserted ?? 0,
    costUsd: fetched.costUsd ?? 0,
  };
}

/**
 * Fetch every configured location and pre-qualify what comes back.
 *
 * Deliberately does NOT score or generate. Pre-qualification is deterministic
 * and free; everything downstream of it costs money and stays behind a button
 * while `AUTOMATED_SCORING_ENABLED` is false.
 */
export async function runIngestionPass(
  options: { dryRun?: boolean } = {},
): Promise<IngestionPassResult> {
  const adapter = new ApifyLinkedInAdapter();

  if (!adapter.isConfigured()) {
    // A missing credential is a clean skip, not a 3am stack trace.
    return {
      configured: false,
      locations: [],
      totalFetched: 0,
      totalLanded: 0,
      totalQualified: 0,
      totalCostUsd: 0,
    };
  }

  const plan = dailyFetchPlan();
  // Read once for the whole pass rather than per location: the list is the same
  // each time, and it only grows as the pass proceeds.
  const skipJobIds = options.dryRun ? [] : await knownJobIds(adapter.source);

  const locations: LocationOutcome[] = [];
  for (const params of plan) {
    // Sequential, not parallel. Three concurrent actor runs would triple the
    // peak spend rate and give the budget no chance to be consulted between
    // them, for a saving of seconds on a job nobody is waiting for.
    const attempt = await isolate(() =>
      fetchOneLocation(adapter, params, skipJobIds, options.dryRun ?? false),
    );

    locations.push(
      attempt.ok
        ? attempt.value
        : {
            location: params.locations?.[0] ?? "unknown",
            runId: null,
            status: "failed",
            fetched: 0,
            landed: 0,
            duplicates: 0,
            qualified: 0,
            costUsd: 0,
            reason: attempt.error.message,
          },
    );
  }

  return {
    configured: true,
    locations,
    totalFetched: locations.reduce((n, l) => n + l.fetched, 0),
    totalLanded: locations.reduce((n, l) => n + l.landed, 0),
    totalQualified: locations.reduce((n, l) => n + l.qualified, 0),
    totalCostUsd: locations.reduce((n, l) => n + l.costUsd, 0),
  };
}
