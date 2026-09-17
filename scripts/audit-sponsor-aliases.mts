/**
 * Check every SPONSOR_ALIASES entry against the loaded register (JSV2S1127).
 *
 *   npm run sponsors:audit
 *
 * `config/sponsors/aliases.ts` says an entry may only be added once confirmed
 * against the register, and a wrong alias is worse than none: it reports
 * `confirmed` for a licence the employer does not hold, which is the one false
 * positive the visa pillar must never produce. This is how that rule is kept
 * honest as the register changes underneath it — companies do lose licences.
 *
 * Run it after every `npm run sponsors:refresh`.
 */
process.loadEnvFile(".env.local");

const { ilike, or } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { sponsorLicences } = await import("@/db/schema");
const { SPONSOR_ALIASES } = await import("@/config/sponsors/aliases");
const { normaliseName } = await import("@/features/sponsors/normalise");

for (const [brand, legal] of Object.entries(SPONSOR_ALIASES)) {
  const target = normaliseName(legal);
  const exact = await db
    .select({ name: sponsorLicences.organisationName })
    .from(sponsorLicences)
    .where(ilike(sponsorLicences.normalisedName, target))
    .limit(1);

  if (exact.length > 0) {
    console.log(`OK       ${brand.padEnd(14)} -> ${legal}`);
    continue;
  }

  // What IS in the register under this brand?
  const candidates = await db
    .select({ name: sponsorLicences.organisationName, route: sponsorLicences.route })
    .from(sponsorLicences)
    .where(
      or(
        ilike(sponsorLicences.organisationName, `${brand}%`),
        ilike(sponsorLicences.organisationName, `%${brand}%`),
      ),
    )
    .limit(6);

  console.log(`MISSING  ${brand.padEnd(14)} -> ${legal}`);
  for (const c of candidates) console.log(`           candidate: ${c.name}`);
  if (candidates.length === 0) console.log("           (nothing in the register)");
}

process.exit(0);
