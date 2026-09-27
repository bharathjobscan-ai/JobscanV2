import { sql } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";

/**
 * The visa verdict, shared by the city table's column and its filter.
 *
 * The column and the filter were written against the same three-way rule and
 * must stay identical: a filter that disagrees with the cell beside it is worse
 * than no filter at all. One of these is TypeScript over a loaded row and the
 * other is SQL over the whole table, so they cannot literally be one
 * expression — they are kept adjacent instead, and a change to either is a
 * change to both.
 *
 * A tier-4 watchlist hit is confirmation, `gate_qualified` means every filter
 * passed at a known sponsor, and everything else is the absence of evidence
 * rather than evidence of absence — hence "no evidence", not "no sponsorship".
 */
export const VISA_STATUSES = ["confirmed", "gate_qualified", "none"] as const;

export type VisaStatus = (typeof VISA_STATUSES)[number];

export const VISA_LABELS: Record<VisaStatus, string> = {
  confirmed: "Confirmed",
  gate_qualified: "Gate qualified",
  none: "No evidence",
};

export function visaStatusOf(item: {
  watchlistTier: number | null;
  matchCategory: string | null;
}): VisaStatus {
  if (item.watchlistTier !== null && item.watchlistTier >= 4) return "confirmed";
  if (item.matchCategory === "gate_qualified") return "gate_qualified";
  return "none";
}

const tier = sql`(${rawJobs.prequalificationDetail}->'watchlist'->>'tier')::int`;

/** The SQL twin of `visaStatusOf`. Change one, change the other. */
export function visaStatusPredicate(status: VisaStatus) {
  switch (status) {
    case "confirmed":
      return sql`${tier} >= 4`;
    case "gate_qualified":
      return sql`coalesce(${tier}, 0) < 4 and ${applications.matchCategory} = 'gate_qualified'`;
    case "none":
      return sql`coalesce(${tier}, 0) < 4 and coalesce(${applications.matchCategory}, '') <> 'gate_qualified'`;
  }
}

/** 1-5 when the company is on the sponsorship watchlist, else null. */
export const watchlistTierSql = sql<number | null>`${tier}`;
