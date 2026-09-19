import {
  AFFINITY_DOMAIN_OUTCOME,
  PAYMENTS_AFFINITY,
  type AffinityEntry,
  type AffinityTier,
} from "@/config/companies/payments-core";
import {
  WATCHLIST,
  WATCHLIST_SKIP_SCORING_TIER,
  type WatchlistEntry,
  type WatchTier,
} from "@/config/companies/watchlist";
import { normaliseName } from "@/features/sponsors/normalise";

/**
 * Curated company lookup (JSV2S1162, JSV2S1167).
 *
 * MATCHES ON THE COMPANY FIELD, NEVER ON DESCRIPTION TEXT. That is not a
 * performance choice, it is the fix for a real collision: "Visa" is a company
 * and "visa sponsorship" is the phrase the gate's other new filter reads, and a
 * matcher that scanned descriptions would fire on every JD mentioning either.
 * `raw_jobs.company` is structured data from the actor; it is the only input.
 *
 * Normalisation is `features/sponsors/normalise.ts`, reused deliberately rather
 * than reimplemented. Three lists resolving the same employer three different
 * ways is how they would start disagreeing.
 *
 * EXACT MATCH ONLY on the normalised key. Nothing fuzzy, no substrings: last
 * time a list of company names was written by hand, 9 of 24 aliases were wrong
 * and only an audit script found it. Substring matching would have hidden those
 * errors behind accidental hits instead of surfacing them.
 */

function index<T extends { name: string; aliases?: readonly string[] }>(
  entries: readonly T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const entry of entries) {
    for (const spelling of [entry.name, ...(entry.aliases ?? [])]) {
      const key = normaliseName(spelling);
      if (key) map.set(key, entry);
    }
  }
  return map;
}

const watchlistIndex = index(WATCHLIST);
const affinityIndex = index(PAYMENTS_AFFINITY);

export type WatchlistMatch = {
  name: string;
  tier: WatchTier;
  /** Whether this hit is strong enough to skip automatic scoring. */
  skipsScoring: boolean;
  note?: string;
};

export function lookupWatchlist(company: string | null | undefined): WatchlistMatch | null {
  if (!company) return null;
  const entry = watchlistIndex.get(normaliseName(company));
  if (!entry) return null;
  return {
    name: entry.name,
    tier: entry.tier,
    skipsScoring: entry.tier >= WATCHLIST_SKIP_SCORING_TIER,
    note: entry.note,
  };
}

export type AffinityMatch = {
  name: string;
  tier: AffinityTier;
  /** What a domain FAIL becomes at this company. */
  domainOutcome: "pass" | "unknown";
};

export function lookupAffinity(company: string | null | undefined): AffinityMatch | null {
  if (!company) return null;
  const entry: AffinityEntry | undefined = affinityIndex.get(normaliseName(company));
  if (!entry) return null;
  return {
    name: entry.name,
    tier: entry.tier,
    domainOutcome: AFFINITY_DOMAIN_OUTCOME[entry.tier],
  };
}

/** Every normalised key, for the audit script. */
export function watchlistKeys(): Map<string, WatchlistEntry> {
  return watchlistIndex;
}

export function affinityKeys(): Map<string, AffinityEntry> {
  return affinityIndex;
}
