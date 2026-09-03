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
const { runScoringPass } = await import("@/features/pipeline/orchestrator");
const { getBudgetStatus } = await import("@/features/ai/budget-queries");
const { listRecentlyScored } = await import("@/features/pipeline/queries");

const dryRun = process.argv.includes("--dry");

/**
 * Ingestion is not wired yet — it needs the Apify adapter (JSV2S1019), which is
 * waiting on the actor's payload shape. Scoring runs over whatever is already
 * pre-qualified, so the pipeline is useful before the fetcher exists and the
 * digest reports honestly that nothing was fetched.
 */
const ingestion: IngestionSummary[] = [];

const scoring = await runScoringPass({ dryRun });

const digest = renderDigest({
  date: new Date(),
  ingestion,
  scoring,
  topScores: await listRecentlyScored(5),
});

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) appendFileSync(summaryPath, `${digest}\n`);
console.log(digest);

// A failed provider call should turn the run red so Actions emails about it; a
// tripped spend ceiling should not, because that is the system working.
if (scoring.failed > 0) {
  console.error(`\n${scoring.failed} job(s) failed to score.`);
  process.exit(1);
}

const budget = await getBudgetStatus();
if (budget.blocked) console.warn(`\n${budget.reason}`);

process.exit(0);
