import type { FetchParams } from "@/features/ingestion/sources/types";

/**
 * Scheduled pipeline configuration (JSV2S1016, 1020, 1136, 1137).
 *
 * Every number here was a decision, not a default. Changing one is a config
 * edit; no orchestration code reads a literal.
 */

/**
 * Master switch for unattended AI spend — PAUSED 2026-09-05 by the owner.
 *
 * "Till the data is all uploaded, cleaned and MVP2 is live, no need of
 * automated AI usage. Only I will initiate a call every time I need, through a
 * button click on the dashboard."
 *
 * While this is `false` the scheduled scoring pass selects nothing and spends
 * nothing. Ingestion still runs — fetching and pre-qualifying are deterministic
 * and free, and the point of the pause is to stop paying for AI on data that is
 * still being cleaned, not to stop collecting jobs.
 *
 * Everything reachable from a button in the workspace is unaffected. This gates
 * the cron, not the user.
 */
export const AUTOMATED_SCORING_ENABLED = false;

/**
 * Spend ceiling for the automated run (JSV2S1137, decided 2026-09-04).
 *
 * Checked before each scoring call against measured cost in `ai_jobs.usage`.
 * When it trips, automated scoring stops and the run reports why; jobs that
 * went unscored keep `prequalification = 'pass'` with no score and are picked
 * up by the next run, so nothing is lost.
 *
 * **Manual generation is never blocked by this.** The ceiling exists because a
 * cron has nobody in the loop, not because the spend itself is wrong.
 *
 * Sized against the expected $2.50-$6/day at 11 locations x 30 results, and
 * well below what a runaway would cost. The realistic runaway is not volume but
 * a bug — uncalibrated pre-qualification thresholds, an idempotency failure
 * re-scoring the same jobs nightly, or near-duplicates slipping dedupe. All
 * three would be caught, but only the morning after.
 */
export const SPEND_CEILING = {
  dailyUsd: 3,
  monthlyUsd: 50,
} as const;

/**
 * What the daily fetch asks for (JSV2S1020, decided 2026-09-04).
 *
 * One fetch per location, jobs posted in the last 24 hours, capped at 30
 * results each. The cap is a cost control on two axes at once: the actor bills
 * per result, and every result is a candidate for a billed scoring call.
 */
export const FETCH_DEFAULTS = {
  postedWithinDays: 1,
  limitPerLocation: 30,
} as const;

/**
 * The first live fetch (JSV2S1020, decided 2026-09-17).
 *
 * One location, ten results — roughly half a cent. Proves the whole chain
 * against real actor output (input schema, mapping, the gate, run attribution,
 * the per-run metrics table) before any of it is trusted with volume. The
 * actor's input field names were wrong until today and nothing caught it,
 * which is the argument for proving before scaling.
 */
export const PROBE_FETCH = {
  locations: ["London, United Kingdom"],
  limit: 10,
  postedWithinDays: 7,
} as const;

/**
 * Locations searched each night.
 *
 * The eleven preferred cities, plus region-level remote searches so a job
 * advertised as "Remote - Europe" is not missed for naming no city. Kept
 * explicit rather than derived from `config/prequalification/locations.ts`:
 * that file lists everywhere a job is *acceptable*, which is much wider than
 * everywhere worth paying to search.
 */
export const FETCH_LOCATIONS: readonly string[] = [
  "London, United Kingdom",
  "Manchester, United Kingdom",
  "Dublin, Ireland",
  "Berlin, Germany",
  "Amsterdam, Netherlands",
  "Stockholm, Sweden",
  "Lisbon, Portugal",
  "Barcelona, Spain",
  "Paris, France",
  "Dubai, United Arab Emirates",
  "Abu Dhabi, United Arab Emirates",
];

/**
 * Search terms — titles only, no domain words. Re-confirmed 2026-09-17.
 *
 * The owner wants payments roles rather than generic PM roles, which is an
 * argument for putting "payments" in the query. It stays out anyway, for one
 * reason: a term in the SEARCH filters at the SOURCE, and anything dropped
 * there never reaches the review queue, so it can be neither audited nor
 * recovered. The domain gate filters afterwards, reads the whole description,
 * and shows its working.
 *
 * The price of that choice is known rather than assumed — roughly 82% of
 * fetched jobs are screened out — and is accepted in exchange for being able to
 * see what was rejected and why.
 *
 * `titleExclude` is deliberately left empty. Mining the 95-job corpus for title
 * words that appear only in rejects produced seven candidates, all ambiguous
 * ("core", "products", "enterprise"). Excluding on that evidence would lose
 * jobs silently, at source, where nothing can show you what went.
 */
export const FETCH_KEYWORDS: readonly string[] = [
  "Product Manager",
  "Senior Product Manager",
  "Lead Product Manager",
  "Principal Product Manager",
  "Product Owner",
];

/** One `FetchParams` per location, for the orchestrator to run through. */
export function dailyFetchPlan(): FetchParams[] {
  return FETCH_LOCATIONS.map((location) => ({
    keywords: [...FETCH_KEYWORDS],
    locations: [location],
    postedWithinDays: FETCH_DEFAULTS.postedWithinDays,
    limit: FETCH_DEFAULTS.limitPerLocation,
  }));
}

/**
 * How many jobs one scoring pass will attempt, before the ceiling is consulted.
 *
 * A backstop for the case where the budget check itself is wrong: even with a
 * broken ceiling, a single run cannot score more than this.
 */
export const MAX_SCORES_PER_RUN = 60;
