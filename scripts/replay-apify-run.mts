process.loadEnvFile(".env.local");

/**
 * Re-ingest an Apify actor run's dataset without paying for it again
 * (JSV2S1170).
 *
 *   npm run ingest:replay              # list recent actor runs
 *   npm run ingest:replay -- <runId>   # re-ingest that run's dataset
 *   npm run ingest:replay -- --failed  # replay every failed ingestion run
 *
 * WHY THIS IS NOT A RETRY QUEUE. The obvious response to a failed fetch is to
 * fetch again — and it is the wrong one here, because a fetch is what costs
 * money. On 2026-09-21 the Berlin and Dublin actor runs both SUCCEEDED and
 * returned 13 and 8 jobs; our own insert threw and discarded them. Re-running
 * the actor would have paid a second time for results already sitting in
 * Apify's storage.
 *
 * Apify keeps a run's dataset after the run ends, and READING a dataset is not
 * a billed event — only the actor start and the results it produces are. So the
 * recovery path is to read what was already bought.
 *
 * The limit is retention: datasets are kept for a fixed window on the free
 * tier, so this recovers a recent failure, not an old one. That is an argument
 * for replaying promptly, not for re-fetching.
 */

import { LINKEDIN_ACTOR } from "@/config/apify";

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error("APIFY_TOKEN is not set.");
  process.exit(1);
}

const API = "https://api.apify.com/v2";
const auth = `token=${encodeURIComponent(token)}`;

type ApifyRun = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  defaultDatasetId: string;
  stats?: { computeUnits?: number };
};

async function recentRuns(limit = 25): Promise<ApifyRun[]> {
  const res = await fetch(
    `${API}/acts/${LINKEDIN_ACTOR.slug}/runs?${auth}&limit=${limit}&desc=true`,
  );
  if (!res.ok) throw new Error(`Apify returned ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data: { items: ApifyRun[] } };
  return body.data.items;
}

async function datasetItems(datasetId: string): Promise<unknown[]> {
  const res = await fetch(`${API}/datasets/${datasetId}/items?${auth}&clean=true`);
  if (!res.ok) throw new Error(`Apify returned ${res.status}: ${await res.text()}`);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? items : [];
}

const args = process.argv.slice(2);
const runs = await recentRuns();

if (args.length === 0) {
  console.log(`${runs.length} recent runs of ${LINKEDIN_ACTOR.title}\n`);
  console.log("RUN ID                     STATUS     STARTED               ITEMS");
  console.log("-".repeat(74));
  for (const run of runs) {
    const items = await datasetItems(run.defaultDatasetId);
    console.log(
      `${run.id.padEnd(26)} ${run.status.padEnd(10)} ${run.startedAt.slice(0, 19)}   ${items.length}`,
    );
  }
  console.log("\nRe-ingest one with:  npm run ingest:replay -- <RUN ID>");
  process.exit(0);
}

const { mapDataset } = await import("@/features/ingestion/sources/apify-linkedin");
const { ingestRows } = await import("@/features/ingestion/ingest");
const { withRun } = await import("@/features/ingestion/runs");

const targets = args[0] === "--failed" ? runs.filter((r) => r.status === "SUCCEEDED") : runs.filter((r) => r.id === args[0]);

if (targets.length === 0) {
  console.error(`No run matching "${args[0]}". Run without arguments to list them.`);
  process.exit(1);
}

for (const run of targets) {
  const items = await datasetItems(run.defaultDatasetId);
  if (items.length === 0) {
    console.log(`${run.id}: dataset is empty or expired — nothing to replay.`);
    continue;
  }

  const mapped = mapDataset(items as never);
  console.log(`${run.id}: ${items.length} items, ${mapped.jobs.length} mapped.`);

  /*
   * Replayed through the SAME path as a live fetch, and recorded as its own
   * ingestion run. A replay that bypassed the ledger would leave the recovered
   * jobs unattributable, which is the problem the run id exists to solve.
   *
   * Cost is stamped as zero: the results were paid for by the original run and
   * counting them twice would overstate spend exactly as badly as missing it.
   */
  const { result, status } = await withRun(
    {
      source: "linkedin",
      trigger: "scheduled",
      params: { replayOf: run.id, datasetId: run.defaultDatasetId, items: items.length },
    },
    async (ledger) => {
      ledger.count("fetched", mapped.jobs.length + mapped.failures.length);
      for (const f of mapped.failures) ledger.fail("map", f.payload, f.error);
      // Cost stays zero: these results were paid for by the original run, and
      // counting them twice would overstate spend exactly as badly as missing
      // it would understate it.
      ledger.log("fetch", "info", `replay of Apify run ${run.id}`, {
        datasetId: run.defaultDatasetId,
      });

      const outcome = await ingestRows(
        mapped.jobs.map((j) => j.row as Record<string, unknown>),
        { trigger: "scheduled", runId: ledger.id },
      );

      ledger.count("inserted", outcome.inserted + outcome.screenedOut);
      ledger.count("duplicates", outcome.duplicate);
      ledger.count("rejected", outcome.rejected);
      return outcome;
    },
  );

  if (!result) {
    console.log(`  replay ${status} — see the run's error`);
    continue;
  }

  console.log(
    `  inserted ${result.inserted} · screened out ${result.screenedOut} · duplicate ${result.duplicate} · rejected ${result.rejected}`,
  );
}

process.exit(0);
