/**
 * Audit the curated company lists (JSV2S1162, JSV2S1167).
 *
 * WHY THIS EXISTS. The last hand-written list of company names in this repo had
 * 9 wrong entries out of 24, and nothing found them until a script went looking.
 * These two lists are longer and were transcribed from a research document that
 * contained five overlapping versions of itself.
 *
 * WHAT IT CANNOT DO. It cannot tell you whether a company sponsors. That is the
 * owner's judgement and no script substitutes for it. What it checks is the
 * class of error a script CAN catch, which is every error found last time:
 * collisions, duplicates, names that normalise to nothing, aliases that add
 * nothing, and single words common enough to match an unrelated employer.
 *
 *   npm run companies:audit
 */

import { PAYMENTS_AFFINITY } from "@/config/companies/payments-core";
import { WATCHLIST } from "@/config/companies/watchlist";
import { normaliseName } from "@/features/sponsors/normalise";

type Entry = { name: string; aliases?: readonly string[] };

const problems: string[] = [];
const notes: string[] = [];

/**
 * Single words that would match an employer with an unrelated business.
 * "Hive", "Rally" and "STARK" were dropped from the source file for this.
 */
const RISKY_SINGLE_WORDS = new Set([
  "HIVE", "RALLY", "STARK", "ALAN", "LUNAR", "LEDGER", "ROVER", "NELLY", "HALA",
]);

function audit(label: string, entries: readonly Entry[]) {
  const byKey = new Map<string, string>();
  const seenNames = new Set<string>();

  for (const entry of entries) {
    if (seenNames.has(entry.name)) problems.push(`${label}: "${entry.name}" listed twice`);
    seenNames.add(entry.name);

    const spellings = [entry.name, ...(entry.aliases ?? [])];
    const keys = new Set<string>();

    for (const spelling of spellings) {
      const key = normaliseName(spelling);

      if (!key) {
        problems.push(`${label}: "${spelling}" (${entry.name}) normalises to nothing`);
        continue;
      }

      const owner = byKey.get(key);
      if (owner && owner !== entry.name) {
        problems.push(
          `${label}: "${spelling}" collides with ${owner} — both normalise to "${key}"`,
        );
      }
      byKey.set(key, entry.name);

      if (keys.has(key) && spelling !== entry.name) {
        notes.push(`${label}: alias "${spelling}" adds nothing to ${entry.name}`);
      }
      keys.add(key);

      if (!key.includes(" ") && RISKY_SINGLE_WORDS.has(key)) {
        notes.push(
          `${label}: "${entry.name}" is one common word — an unrelated employer of the same name would match`,
        );
      }
    }
  }

  console.log(`${label}: ${entries.length} companies, ${byKey.size} distinct keys`);
  return byKey;
}

const watchKeys = audit("watchlist", WATCHLIST);
const affinityKeys = audit("affinity", PAYMENTS_AFFINITY);

/**
 * The lists are allowed to overlap — most payments companies sponsor — but a
 * company spelled differently in each is two companies as far as the code is
 * concerned, and only one of the two lookups would ever hit it.
 */
for (const name of new Set(PAYMENTS_AFFINITY.map((e) => e.name))) {
  const inWatchlist = WATCHLIST.some((w) => w.name === name);
  const sameKey = [...watchKeys].some(([k, v]) => v === name && affinityKeys.has(k));
  if (inWatchlist && !sameKey) {
    problems.push(`cross-list: "${name}" is on both lists but does not resolve to the same key`);
  }
}

console.log();
for (const note of notes) console.log(`note    ${note}`);
for (const problem of problems) console.log(`PROBLEM ${problem}`);

console.log();
if (problems.length > 0) {
  console.log(`${problems.length} problem(s). The lists are not safe to rely on.`);
  process.exit(1);
}
console.log(`No problems. ${notes.length} note(s) for the record.`);
