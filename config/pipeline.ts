import type { FetchParams } from "@/features/ingestion/sources/types";

/**
 * Scheduled pipeline configuration (JSV2S1016, 1020, 1136, 1137).
 *
 * Every number here was a decision, not a default. Changing one is a config
 * edit; no orchestration code reads a literal.
 */

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
 * Search terms.
 *
 * Deliberately titles only, not domain keywords. The domain filter reads the
 * whole job description and does it better than a search box can; asking
 * LinkedIn for "payments" as well would narrow the funnel before
 * pre-qualification ever sees it, and the point of a cheap deterministic gate
 * is that it can afford to look at everything the role search returns.
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
