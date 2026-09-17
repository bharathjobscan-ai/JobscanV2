/**
 * The nightly pipeline (JSV2S1016, 1017, 1136).
 *
 *   npm run pipeline:daily            # fetch, pre-qualify, score
 *   npm run pipeline:daily -- --dry   # select and report, spend nothing
 *
 * Runs on GitHub Actions rather than Vercel: a scoring pass over tens of jobs
 * will not fit in a serverless function timeout, and Actions has no such limit.
 * Writes its report to $GITHUB_STEP_SUMMARY when present, stdout otherwise.
 *
 * Run with `tsx`, which honours the `@/` path alias. Plain node cannot resolve
 * it, and the alternative — moving the pipeline behind an HTTP route — would
 * reintroduce the timeout this design exists to avoid.
 */
import { appendFileSync } from "node:fs";
import process from "node:process";

// Type-only import: erased at build time, so it cannot pull the database
// client in before the environment is loaded.
import type { IngestionSummary } from "@/features/pipeline/digest";

process.loadEnvFile(".env.local");

const { renderDigest } = await import("@/features/pipeline/digest");
const { runIngestionPass } = await import("@/features/ingestion/orchestrator");
const { runScoringPass } = await import("@/features/pipeline/orchestrator");
const { getBudgetStatus } = await import("@/features/ai/budget-queries");
const { listRecentlyScored } = await import("@/features/pipeline/queries");

const dryRun = process.argv.includes("--dry");

/**
 * Ingestion, wired 2026-09-18 (JSV2S1017).
 *
 * This was a literal empty array with a comment saying the fetcher did not
 * exist. It does now, so the nightly job fetches as well as scores — and every
 * live fetch before today was a script run by hand.
 *
 * Fetching runs even while scoring is paused: pre-qualification is
 * deterministic and free, and the point of the pause is to stop paying for AI
 * on data still being cleaned, not to stop collecting jobs.
 */
const pass = await runIngestionPass({ dryRun });

const ingestion: IngestionSummary[] = pass.locations.map((l) => ({
  source: `linkedin · ${l.location}`,
  status: l.status,
  fetched: l.fetched,
  inserted: l.qualified,
  duplicates: l.duplicates,
  // Landed but gated: the difference between what persisted and what qualified.
  screenedOut: Math.max(0, l.landed - l.qualified),
  rejected: 0,
  errors: l.reason ? [l.reason] : [],
}));

if (!pass.configured) {
  console.log("APIFY_TOKEN is not set — ingestion skipped, scoring will still run.");
}

const scoring = await runScoringPass({ dryRun });

const digest = renderDigest({
  date: new Date(),
  ingestion,
  scoring,
  topScores: await listRecentlyScored(5),
});

// The night's ingestion spend, stated plainly. Apify bills per result, so this
// is the one number that grows with the fetch plan (JSV2S1144).
const costLine = pass.configured
  ? `\nIngestion cost: $${pass.totalCostUsd.toFixed(4)} across ${pass.locations.length} location(s), ${pass.totalFetched} fetched, ${pass.totalLanded} landed, ${pass.totalQualified} qualified.`
  : "";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) appendFileSync(summaryPath, `${digest}${costLine}\n`);
console.log(digest + costLine);

// A failed provider call should turn the run red so Actions emails about it; a
// tripped spend ceiling should not, because that is the system working.
if (scoring.failed > 0) {
  console.error(`\n${scoring.failed} job(s) failed to score.`);
  process.exit(1);
}

const budget = await getBudgetStatus();
if (budget.blocked) console.warn(`\n${budget.reason}`);

process.exit(0);
