/**
 * Give the pre-run-tracking corpus a run of its own (JSV2S1158).
 *
 *   npm run jobs:attribute
 *
 * Jobs ingested before runs were recorded belong to no run, so they cannot
 * appear in the per-run table and its totals do not reconcile with the queue
 * counts. Rather than delete them — they are the corpus the gate was tuned
 * against, and the benchmark still needs them — they are batched under one
 * synthetic run so every job has an origin and new fetches stay separable.
 *
 * The run is labelled `historical_backfill` and says plainly in its own log
 * that it is a retrospective attribution, not a fetch that happened. A
 * synthetic row that looked like a real run would be worse than no row.
 *
 * Idempotent: only jobs with no run are touched, so re-running does nothing.
 */
process.loadEnvFile(".env.local");

const { asc, isNull, sql } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { ingestionRuns, rawJobs } = await import("@/db/schema");

async function main() {
  const orphans = await db
    .select({ id: rawJobs.id, firstSeenAt: rawJobs.firstSeenAt })
    .from(rawJobs)
    .where(isNull(rawJobs.ingestionRunId))
    .orderBy(asc(rawJobs.firstSeenAt));

  if (orphans.length === 0) {
    console.log("Every job already belongs to a run. Nothing to do.");
    return;
  }

  // Dated to the earliest job it covers, so it sorts before later real runs
  // rather than appearing to be the most recent thing that happened.
  const earliest = orphans[0].firstSeenAt ?? new Date();

  const [run] = await db
    .insert(ingestionRuns)
    .values({
      source: "historical_backfill",
      trigger: "backfill",
      status: "succeeded",
      params: {
        note: "Retrospective attribution, not a fetch that occurred.",
        attributedOn: new Date().toISOString(),
      },
      fetched: orphans.length,
      inserted: orphans.length,
      // Unknowable after the fact: duplicates and validation rejections left no
      // row behind, so recording a zero would be a claim rather than a count.
      duplicates: 0,
      rejected: 0,
      logs: [
        {
          stage: "persist",
          level: "info",
          message: `Attributed ${orphans.length} pre-existing jobs to this run. Duplicate and rejection counts are unknowable retrospectively and are recorded as zero, not measured.`,
          at: new Date().toISOString(),
        },
      ],
      startedAt: earliest,
      finishedAt: earliest,
      durationMs: 0,
    })
    .returning({ id: ingestionRuns.id });

  const updated = await db
    .update(rawJobs)
    .set({ ingestionRunId: run.id })
    .where(isNull(rawJobs.ingestionRunId))
    .returning({ id: rawJobs.id });

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(rawJobs)
    .where(isNull(rawJobs.ingestionRunId));

  console.log(`run ${run.id} — historical_backfill`);
  console.log(`attributed ${updated.length} jobs; ${remaining} still unattributed`);
}

await main();
process.exit(0);
