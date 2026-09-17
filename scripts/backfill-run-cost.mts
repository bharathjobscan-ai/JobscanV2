/**
 * Price the ingestion runs that predate the cost column (JSV2S1144).
 *
 *   npm run runs:backfill-cost
 *
 * `cost_usd` is stamped at close so a later price change cannot rewrite what
 * was actually billed. Runs recorded before the column existed have no stamp,
 * and would read as "free" forever.
 *
 * Backfilling them is defensible only because both inputs are known facts
 * rather than estimates: the result count is stamped on each run, and the rate
 * in `config/apify.ts` was read on 2026-09-05 and has not changed since — every
 * affected run happened after that date. If the rate had moved in between, the
 * honest answer would be to leave them null.
 *
 * Free sources are skipped, not zeroed: a manual upload costs nothing, and a
 * stamped zero would claim that had been measured.
 *
 * Idempotent — only runs with no cost are touched.
 */
process.loadEnvFile(".env.local");

const { and, eq, isNull } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { ingestionRuns } = await import("@/db/schema");
const { APIFY_PRICING, estimateFetchCostUsd } = await import("@/config/apify");

/** Sources that bill. Anything else is genuinely free and stays null. */
const BILLABLE = new Set(["linkedin"]);

async function main() {
  const runs = await db
    .select({
      id: ingestionRuns.id,
      source: ingestionRuns.source,
      fetched: ingestionRuns.fetched,
      startedAt: ingestionRuns.startedAt,
    })
    .from(ingestionRuns)
    .where(isNull(ingestionRuns.costUsd));

  const billable = runs.filter((r) => BILLABLE.has(r.source));

  console.log(
    `${runs.length} unpriced runs; ${billable.length} on a billable source ` +
      `(rate read ${APIFY_PRICING.readAt})`,
  );

  for (const run of billable) {
    // Priced on results RETURNED, which is what `fetched` records, plus the
    // start event that bills whether or not anything came back.
    const cost = estimateFetchCostUsd(run.fetched);

    await db
      .update(ingestionRuns)
      .set({ costUsd: cost.toFixed(6) })
      .where(and(eq(ingestionRuns.id, run.id), isNull(ingestionRuns.costUsd)));

    console.log(
      `  ${run.source.padEnd(12)} ${run.startedAt.toISOString().slice(0, 10)} ` +
        `${String(run.fetched).padStart(4)} results -> $${cost.toFixed(4)}  ${run.id.slice(0, 8)}`,
    );
  }

  const skipped = runs.length - billable.length;
  if (skipped > 0) {
    console.log(`\n${skipped} left null — free sources, not zero-cost ones.`);
  }
}

await main();
process.exit(0);
