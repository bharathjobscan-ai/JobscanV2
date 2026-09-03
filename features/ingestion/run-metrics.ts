import type { IngestionRunStatus } from "@/lib/config/constants";

/**
 * JSV2S1012 — the ingestion funnel, and the rule for turning it into a status.
 *
 * Kept free of database imports so `npm test` can exercise the rule without one.
 */

export type RunMetrics = {
  fetched: number;
  inserted: number;
  duplicates: number;
  updated: number;
  reposted: number;
  rejected: number;
};

export const ZERO_METRICS: RunMetrics = {
  fetched: 0,
  inserted: 0,
  duplicates: 0,
  updated: 0,
  reposted: 0,
  rejected: 0,
};

/**
 * Derive the run's outcome from what actually happened (JSV2S1013).
 *
 * `partial` exists so a run that landed 40 of 50 rows is not reported as a
 * success that quietly lost ten, nor as a failure that found nothing. A
 * duplicate counts as landed: the row is in the database, which is the only
 * thing "landed" can usefully mean.
 */
export function statusFor(
  metrics: RunMetrics,
  runFailed: boolean,
): IngestionRunStatus {
  if (runFailed) return "failed";
  if (metrics.rejected > 0) {
    const landed =
      metrics.inserted + metrics.duplicates + metrics.updated + metrics.reposted;
    return landed > 0 ? "partial" : "failed";
  }
  return "succeeded";
}
