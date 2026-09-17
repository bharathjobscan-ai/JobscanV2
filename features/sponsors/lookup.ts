import { inArray } from "drizzle-orm";

import { sponsorLicences, type SponsorLicence } from "@/db/schema";
import { AMBIGUOUS_NAMES, SPONSOR_ALIASES } from "@/config/sponsors/aliases";
import { db } from "@/lib/db/client";
import { normaliseCore, normaliseName } from "./normalise";
import type { SponsorMatch } from "./prompt";

export type { SponsorMatch, SponsorMatchStatus } from "./prompt";
export { sponsorPromptBlock } from "./prompt";

/**
 * Resolving an employer to a sponsor licence (JSV2S1127).
 *
 * Deterministic by design: the same company resolves to the same licence on
 * every run, and the result is injected into the ScoreG prompt as a fact rather
 * than left for the model to establish by search. That removes both the cost
 * and the variance from the single highest-weighted pillar.
 *
 * The confidence ladder is deliberately conservative. A false `confirmed` is
 * far worse than a `none`: it awards visa points for a licence the employer
 * does not hold, and the user applies for a job they cannot take.
 */

async function queryBy(
  column: typeof sponsorLicences.normalisedName | typeof sponsorLicences.coreName,
  values: string[],
): Promise<SponsorLicence[]> {
  if (values.length === 0) return [];
  return db.select().from(sponsorLicences).where(inArray(column, values));
}

/**
 * The best A-rated match wins when several licences share a name.
 *
 * A company can hold more than one route; the one that matters for a Skilled
 * Worker application is the Skilled Worker route, so it sorts first.
 */
function rank(rows: SponsorLicence[]): SponsorLicence[] {
  return [...rows].sort((a, b) => {
    const score = (r: SponsorLicence) =>
      (/(^|\W)A\s*rating/i.test(r.typeRating ?? "") ? 2 : 0) +
      (/skilled worker/i.test(r.route ?? "") ? 1 : 0);
    return score(b) - score(a);
  });
}

export async function lookupSponsor(company: string): Promise<SponsorMatch> {
  const [any] = await db
    .select({ fetchedAt: sponsorLicences.fetchedAt })
    .from(sponsorLicences)
    .limit(1);

  // An empty table is not evidence of absence. Reporting `none` here would tell
  // ScoreG the employer is not a sponsor purely because nobody ran the refresh.
  if (!any) {
    return {
      status: "unknown",
      matches: [],
      method: "register-empty",
      registerFetchedAt: null,
    };
  }

  const fetchedAt = any.fetchedAt;
  const normalised = normaliseName(company);

  // 1. A confirmed alias. The only path allowed for an ambiguous name.
  const alias = SPONSOR_ALIASES[normalised];
  if (alias) {
    const rows = await queryBy(sponsorLicences.normalisedName, [normaliseName(alias)]);
    if (rows.length > 0) {
      return {
        status: "confirmed",
        matches: rank(rows),
        method: "alias",
        registerFetchedAt: fetchedAt,
      };
    }
  }

  // A name like "Visa" cannot be matched by tokens — the word is the subject of
  // the search, so a prefix match returns visa-services firms, not the employer.
  if (AMBIGUOUS_NAMES.has(normalised)) {
    return {
      status: "none",
      matches: [],
      method: "none",
      registerFetchedAt: fetchedAt,
    };
  }

  // 2. Exact on the registered name.
  const exact = await queryBy(sponsorLicences.normalisedName, [normalised]);
  if (exact.length > 0) {
    return {
      status: "confirmed",
      matches: rank(exact),
      method: "exact",
      registerFetchedAt: fetchedAt,
    };
  }

  // 3. Core match — qualifiers stripped from both sides. Probable, never
  //    confirmed: "NORTHERN TRUST" and "TRUST" must not become the same firm.
  const core = normaliseCore(company);
  const coreRows = await queryBy(sponsorLicences.coreName, [core]);
  if (coreRows.length > 0) {
    return {
      status: "probable",
      matches: rank(coreRows).slice(0, 5),
      method: "core",
      registerFetchedAt: fetchedAt,
    };
  }

  return { status: "none", matches: [], method: "none", registerFetchedAt: fetchedAt };
}
