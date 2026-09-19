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
 * What the daily fetch asks for (JSV2S1161, decided 2026-09-19).
 *
 * Jobs posted in the last 24 hours, capped PER LOCATION rather than in total.
 *
 * This reverses the 2026-09-18 decision, deliberately and at the owner's
 * request. A total cap divided across locations meant adding a location
 * silently shrank every other location's share; a per-location cap means each
 * city gets a guaranteed look, which is the point of searching eight of them —
 * a shared cap would be consumed by whichever city posts most, and London would
 * starve Manchester, Dublin and Luxembourg of any share at all.
 *
 * The bill is guarded by `estimatedFetchCostUsd` below instead, which is the
 * property the total cap was really protecting.
 */
export const FETCH_DEFAULTS = {
  postedWithinDays: 1,
  /** Per location, per run. 200 x 8 locations = 1,600 results a night. */
  limitPerLocation: 200,
} as const;

/**
 * Apify pay-per-event pricing, as the actor bills it.
 *
 * Held here rather than inline so the guard below and the run ledger cannot
 * disagree about what a fetch costs.
 */
export const APIFY_PRICING = {
  perResultUsd: 0.0004,
  perActorStartUsd: 0.001,
} as const;

/** The owner's stated ceiling for ingestion: under $1 a day (JSV2S1161). */
export const FETCH_DAILY_BUDGET_USD = 1;

/**
 * Worst case for one night: every location returning a full page.
 *
 * At 200 x 8 that is $0.648 — 1,600 results at $0.0004 plus eight actor starts
 * at $0.001. Real runs come in well under it, because a 24-hour window rarely
 * yields 200 product roles in Luxembourg.
 */
export function estimatedFetchCostUsd(
  locations = FETCH_LOCATIONS.length,
  limit = FETCH_DEFAULTS.limitPerLocation,
): number {
  return locations * (limit * APIFY_PRICING.perResultUsd + APIFY_PRICING.perActorStartUsd);
}

/**
 * The guard the total cap used to be.
 *
 * A per-location cap makes a ninth location free to add and invisible in the
 * bill until the invoice arrives. This makes it loud instead: adding a location
 * or raising the cap past the daily budget fails the build, not the wallet.
 */
export function fetchWithinBudget(
  locations = FETCH_LOCATIONS.length,
  limit = FETCH_DEFAULTS.limitPerLocation,
): boolean {
  return estimatedFetchCostUsd(locations, limit) <= FETCH_DAILY_BUDGET_USD;
}

/** Per-location cap. Kept as a function so callers need not know the shape. */
export function limitPerLocation(): number {
  return FETCH_DEFAULTS.limitPerLocation;
}

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
 * Locations searched each night (JSV2S1161, decided 2026-09-19).
 *
 * Eight, each with its own cap. Deliberately city-level rather than
 * country-level: at country level a limit is consumed by whichever city posts
 * most, so "United Kingdom, 200" would return London 200 times over and
 * Manchester never.
 *
 * Deliberately kept explicit rather than derived from
 * `config/prequalification/locations.ts`: that file lists everywhere a job is
 * *acceptable*, which is far wider than everywhere worth paying to search. The
 * gate still accepts a job from Munich or Stockholm that arrives another way.
 *
 * Adding one raises the bill by up to $0.081 a night. `fetchWithinBudget`
 * is what stops that being discovered on an invoice.
 */
export const FETCH_LOCATIONS: readonly string[] = [
  "London, United Kingdom",
  "Manchester, United Kingdom",
  "Amsterdam, Netherlands",
  "Berlin, Germany",
  "Dubai, United Arab Emirates",
  "Dublin, Ireland",
  "Lisboa, Portugal",
  "Luxembourg",
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
  const perLocation = limitPerLocation();
  return FETCH_LOCATIONS.map((location) => ({
    keywords: [...FETCH_KEYWORDS],
    locations: [location],
    postedWithinDays: FETCH_DEFAULTS.postedWithinDays,
    limit: perLocation,
  }));
}

/**
 * How many jobs one scoring pass will attempt, before the ceiling is consulted.
 *
 * A backstop for the case where the budget check itself is wrong: even with a
 * broken ceiling, a single run cannot score more than this.
 */
export const MAX_SCORES_PER_RUN = 60;
