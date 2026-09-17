/**
 * Refresh the local copy of the UK Register of Licensed Sponsors (Workers).
 * JSV2S1127.
 *
 *   npm run sponsors:refresh          # download the current register
 *   npm run sponsors:refresh -- FILE  # load a CSV already on disk
 *
 * The Home Office publishes a dated CSV whose filename changes on every
 * release, so the link is discovered from the landing page rather than
 * hard-coded — a pinned URL would 404 within days and the failure would look
 * like "this employer is not a sponsor".
 *
 * Replace-in-one-transaction, deliberately: a licence that has been revoked
 * must disappear, and an upsert would leave it behind forever.
 */
process.loadEnvFile(".env.local");

import { readFileSync } from "node:fs";

const { sql } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { sponsorLicences } = await import("@/db/schema");
const { normaliseCore, normaliseName } = await import("@/features/sponsors/normalise");
const { parseCsv } = await import("@/features/ingestion/parsers");

const LANDING =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

async function discoverCsvUrl(): Promise<string> {
  const page = await fetch(LANDING, { redirect: "follow" });
  if (!page.ok) throw new Error(`Landing page returned ${page.status}`);
  const html = await page.text();

  // The register is the only .csv asset linked from this page.
  const match = html.match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/[^"' ]+\.csv/i,
  );
  if (!match) {
    throw new Error(
      "No .csv link found on the register landing page. The page layout changed — " +
        "download it by hand and pass the path as an argument.",
    );
  }
  return match[0];
}

/** Header names drift between releases; match on shape, not exact spelling. */
function pick(row: Record<string, string>, ...needles: string[]): string | null {
  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase().replace(/[^a-z]/g, "");
    if (needles.some((n) => k.includes(n))) return value?.trim() || null;
  }
  return null;
}

async function main() {
  const localPath = process.argv[2];

  let csv: string;
  if (localPath) {
    console.log(`Reading ${localPath}`);
    csv = readFileSync(localPath, "utf8");
  } else {
    const url = await discoverCsvUrl();
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download returned ${response.status}`);
    csv = await response.text();
  }

  const rows = parseCsv(Buffer.from(csv, "utf8")) as unknown as Record<string, string>[];
  console.log(`Parsed ${rows.length} rows`);

  const values = rows
    .map((row) => {
      const organisationName = pick(row, "organisation", "name");
      if (!organisationName) return null;
      return {
        organisationName,
        normalisedName: normaliseName(organisationName),
        coreName: normaliseCore(organisationName),
        townCity: pick(row, "town", "city"),
        county: pick(row, "county"),
        typeRating: pick(row, "typerating", "rating"),
        route: pick(row, "route"),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length === 0) {
    throw new Error("No usable rows — refusing to replace the register with nothing.");
  }

  // Sanity floor. The real register carries >100k entries; anything close to
  // empty means the format changed, and replacing a good copy with a broken one
  // would silently turn every sponsor into a non-sponsor.
  if (values.length < 1000) {
    throw new Error(
      `Only ${values.length} rows parsed — expected >100k. Refusing to replace ` +
        `the register. Check the CSV headers.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(sponsorLicences);
    for (let i = 0; i < values.length; i += 1000) {
      await tx.insert(sponsorLicences).values(values.slice(i, i + 1000));
    }
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sponsorLicences);
  console.log(`Register replaced — ${count} licences stored.`);
}

await main();
process.exit(0);
