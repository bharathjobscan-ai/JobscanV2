import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * SPONSOR_LICENCES (JSV2S1127) — a local copy of the UK Register of Licensed
 * Sponsors (Workers), published by the Home Office.
 *
 * Held locally because the register is a CSV, not indexed pages, so WebSearch
 * cannot query it — which is why ScoreG could not confirm a licence it was
 * looking straight at. A local lookup is free, instant, deterministic and
 * accurate, and it lets Google Search grounding be dropped from scoring
 * (~$0.09 per run in added cache).
 *
 * Refreshed wholesale by `scripts/refresh-sponsor-register.mts`; rows are never
 * edited in place. `fetchedAt` is what makes a stale copy visible instead of
 * silently authoritative — an old register that has since revoked a licence
 * would otherwise report `confirmed` forever.
 */
export const sponsorLicences = pgTable(
  "sponsor_licences",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** The registered legal name, exactly as the register spells it. */
    organisationName: text("organisation_name").notNull(),

    /**
     * `normaliseName` of the above — legal form removed, nothing else. The
     * primary lookup key, indexed because every score does this query.
     */
    normalisedName: text("normalised_name").notNull(),

    /**
     * `normaliseCore` — qualifiers removed too. The fallback key that resolves
     * "Visa Inc" to "VISA EUROPE LIMITED". A match here is `probable`, never
     * `confirmed`, because stripping qualifiers can conflate distinct firms.
     */
    coreName: text("core_name").notNull(),

    townCity: text("town_city"),
    county: text("county"),

    /** e.g. "Worker (A rating)" — the rating is the part that matters. */
    typeRating: text("type_rating"),
    /** e.g. "Skilled Worker", "Global Business Mobility". */
    route: text("route"),

    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sponsor_licences_normalised_idx").on(t.normalisedName),
    index("sponsor_licences_core_idx").on(t.coreName),
  ],
);

export type SponsorLicence = typeof sponsorLicences.$inferSelect;
export type NewSponsorLicence = typeof sponsorLicences.$inferInsert;
