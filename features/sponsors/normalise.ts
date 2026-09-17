/**
 * Deterministic company-name normalisation for the sponsor register
 * (JSV2S1127).
 *
 * The measured failure this exists to fix: ScoreG searched "Visa Inc" while the
 * register lists "VISA EUROPE LIMITED", found nothing, and dropped the visa
 * pillar 60 → 30, taking the job score 75 → 59. The name was right; the
 * matching was absent.
 *
 * No AI, no embeddings, no network. A fuzzy matcher would make this cheaper to
 * write and impossible to reason about — the whole point of moving the lookup
 * in-house is that the same company resolves to the same licence every time.
 */

/**
 * Legal-form suffixes. Stripped because they are noise for identity: the
 * register's "LIMITED" and a posting's "Ltd" name the same company.
 */
const LEGAL_SUFFIXES = [
  "LIMITED",
  "LTD",
  "PLC",
  "LLP",
  "LP",
  "LLC",
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "GMBH",
  "SARL",
  "BV",
  "NV",
  "AB",
  "AS",
  "SA",
  "SE",
  "PTY",
  "PTE",
  "AG",
];

/**
 * Geographic and structural qualifiers, stripped only at the *second* pass.
 *
 * "VISA EUROPE" and "VISA" are the same employer for sponsorship purposes, but
 * "NORTHERN TRUST" and "TRUST" are not — so this is deliberately a fallback
 * rather than part of the primary key. A match found only after stripping these
 * is reported as `probable`, never `confirmed`.
 */
const QUALIFIERS = [
  "EUROPE",
  "EUROPEAN",
  "UK",
  "GB",
  "BRITAIN",
  "GREAT",
  "ENGLAND",
  "LONDON",
  "INTERNATIONAL",
  "GLOBAL",
  "WORLDWIDE",
  "GROUP",
  "HOLDINGS",
  "HOLDING",
  "SERVICES",
  "SERVICE",
  "SOLUTIONS",
  "TECHNOLOGIES",
  "TECHNOLOGY",
  "SYSTEMS",
  "PARTNERS",
  "VENTURES",
  "ENTERPRISES",
  "OPERATIONS",
];

const LEGAL_SET = new Set(LEGAL_SUFFIXES);
const QUALIFIER_SET = new Set(QUALIFIERS);

/** Ampersand and "and" are the same word; so are "dot com" spellings. */
function canonicaliseWord(word: string): string {
  if (word === "&") return "AND";
  return word;
}

/**
 * Tokens of a company name, with punctuation and legal form removed.
 *
 * Accent folding matters: the register is ASCII, and a posting may carry
 * "Société". Without folding they never match.
 */
export function tokenise(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,'’"()\[\]]/g, "")
    .replace(/[^A-Z0-9&]+/g, " ")
    .split(" ")
    .map(canonicaliseWord)
    .filter((w) => w.length > 0 && !LEGAL_SET.has(w));
}

/** The primary key: the name with legal form removed, nothing else. */
export function normaliseName(name: string): string {
  return tokenise(name).join(" ");
}

/**
 * The fallback key: qualifiers removed too.
 *
 * Never allowed to reduce a name to nothing — "UK Group Limited" would
 * normalise to the empty string and then match every other empty string in the
 * register. If stripping empties it, the primary key stands.
 */
export function normaliseCore(name: string): string {
  const tokens = tokenise(name).filter((w) => !QUALIFIER_SET.has(w));
  return tokens.length > 0 ? tokens.join(" ") : normaliseName(name);
}
