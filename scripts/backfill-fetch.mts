/**
 * A one-off wider fetch (2026-09-21).
 *
 *   npm run ingest:backfill -- --days 7            # a week, per location
 *   npm run ingest:backfill -- --days 7 --dry      # cost estimate, no spend
 *   npm run ingest:backfill -- --days 7 --limit 300
 *
 * DELIBERATELY NOT A CONFIG CHANGE. Setting `FETCH_DEFAULTS.postedWithinDays`
 * to 7 would work once and then keep working every night until somebody
 * remembered to change it back — and the symptom of forgetting is a larger
 * bill, which is the kind of mistake that goes unnoticed for a month. The
 * nightly schedule stays at 24 hours; this widens the window for one run.
 *
 * COST IS NOT SEVEN TIMES A DAY'S. Jobs already stored are passed to the actor
 * as `skipJobId`, so a re-returned posting is skipped at the source and never
 * billed — only genuinely new jobs cost anything. The ceiling is still the
 * per-location cap.
 *
 * The actor's window is an enum — 24 hours, a week, a month — so any value
 * between 2 and 7 resolves to a week, and 8 to 30 resolves to a month.
 */
import process from "node:process";

process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : undefined;
};

const days = flag("days") ?? 7;
const limitPerLocation = flag("limit");
const dryRun = args.includes("--dry");

if (!Number.isFinite(days) || days < 1 || days > 30) {
  console.error("--days must be between 1 and 30 (the actor's window is an enum).");
  process.exit(1);
}

const { runIngestionPass } = await import("@/features/ingestion/orchestrator");
const { FETCH_LOCATIONS, FETCH_DEFAULTS, estimatedFetchCostUsd } = await import(
  "@/config/pipeline"
);

const limit = limitPerLocation ?? FETCH_DEFAULTS.limitPerLocation;
const window = days <= 1 ? "24 hours" : days <= 7 ? "a week" : "a month";

console.log(
  `${dryRun ? "DRY RUN — " : ""}${FETCH_LOCATIONS.length} locations · posted within ${window} · ` +
    `up to ${limit} each`,
);
console.log(
  `Worst case $${estimatedFetchCostUsd(FETCH_LOCATIONS.length, limit).toFixed(3)} — ` +
    `jobs already stored are skipped at the actor and cost nothing.\n`,
);

const pass = await runIngestionPass({ dryRun, postedWithinDays: days, limitPerLocation });

if (!pass.configured) {
  console.error("APIFY_TOKEN is not set — nothing fetched.");
  process.exit(1);
}

console.log("LOCATION                            STATUS    FETCHED  LANDED  DUPES  QUALIFIED");
console.log("-".repeat(84));
for (const l of pass.locations) {
  console.log(
    `${l.location.padEnd(35)} ${l.status.padEnd(9)} ${String(l.fetched).padStart(7)} ` +
      `${String(l.landed).padStart(7)} ${String(l.duplicates).padStart(6)} ${String(l.qualified).padStart(10)}`,
  );
  if (l.reason) console.log(`    ${l.reason}`);
}

console.log(
  `\nfetched ${pass.totalFetched} · landed ${pass.totalLanded} · qualified ${pass.totalQualified} · ` +
    `cost $${pass.totalCostUsd.toFixed(4)}`,
);
console.log(
  "\nThe nightly schedule is unchanged at 24 hours — this widened the window for one run only.",
);
process.exit(0);
