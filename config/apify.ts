/**
 * Apify actor identity and cost model (JSV2S1019, JSV2S1144).
 *
 * Read from the actor's own API on 2026-09-05 rather than transcribed from the
 * store page, so the numbers are the ones actually billed. Re-check after any
 * price-change notification: Apify publishes these on the actor record, and a
 * stale rate here silently understates spend the same way an out-of-date
 * `MODEL_RATES` would.
 */

/** `valig/linkedin-jobs-scraper`, confirmed against the console URL supplied. */
export const LINKEDIN_ACTOR = {
  id: "RIGGeqD6RqKmlVoQU",
  /** The API accepts `username~name`; the opaque id is the stable identifier. */
  slug: "valig~linkedin-jobs-scraper",
  title: "LinkedIn Jobs Scraper",
} as const;

/**
 * Pay-per-event pricing on the Free tier, 2026-05-16 onward.
 *
 * Two charges, and the per-result one dominates at our volumes. Both are
 * needed: a run that returns nothing still costs a start event, so "we fetched
 * and found no new jobs" is not free.
 */
export const APIFY_PRICING = {
  /** Per dataset item returned. $0.40 per 1,000 results. */
  perResultUsd: 0.0004,
  /**
   * Per actor start, charged once per GB of memory (minimum one). Counted as
   * one here; if the actor is ever given more memory this understates.
   */
  perRunStartUsd: 0.001,
  tier: "FREE",
  /** When this rate table was read from the actor. */
  readAt: "2026-09-05",
} as const;

/**
 * What one fetch costs, before it has run.
 *
 * `limit` is a *ceiling*, not a promise — a search with few matches returns
 * fewer and costs less. This is therefore the worst case, which is the number
 * a budget should be set against.
 */
export function estimateFetchCostUsd(resultsPerRun: number, runs = 1): number {
  return (
    runs * APIFY_PRICING.perRunStartUsd +
    runs * resultsPerRun * APIFY_PRICING.perResultUsd
  );
}
