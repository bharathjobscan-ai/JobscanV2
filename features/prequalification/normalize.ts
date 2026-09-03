import { PREQUAL_CONFIG } from "@/config/prequalification";

/**
 * Normalisation layer (PRD §11).
 *
 * Everything here produces a *comparison* representation. The original text is
 * never modified — the engine reports matches against the raw job so the UI can
 * show what a posting actually said.
 */

/**
 * Lowercase, strip accents, collapse punctuation and whitespace.
 *
 * Accent folding matters more than it looks: Lisboa, Zürich, München and
 * España all appear both ways in scraped postings, and a keyword table cannot
 * carry every spelling.
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[’‘`´]/g, "'")
    // Commas and pipes survive: `titleHead` needs them to find where the role
    // ends and the domain qualifier begins. Word-boundary matching is unharmed.
    .replace(/[^\p{L}\p{N}\s'+/&.,|-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a phrase occurs in text on word boundaries.
 *
 * Substring matching is not usable here: `sca` appears inside "Scandinavia",
 * `aml` inside "AMLogic", `fx` inside plenty of tickers. Every keyword lookup
 * in the engine goes through this.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  return buildPhraseRegex(phrase).test(haystack);
}

const phraseCache = new Map<string, RegExp>();

function buildPhraseRegex(phrase: string): RegExp {
  const cached = phraseCache.get(phrase);
  if (cached) {
    cached.lastIndex = 0;
    return cached;
  }
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${phrasePattern(phrase)}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  phraseCache.set(phrase, regex);
  return regex;
}

/**
 * Regex source for a keyword phrase.
 *
 * Two accommodations, both measured against real postings rather than guessed:
 *
 * - **Hyphen and space are interchangeable** — "cross-border" vs "cross border".
 * - **The final word may be plural.** A 100-job LinkedIn sample held
 *   "Senior Product Manager- payment" in review because the keyword is
 *   "payments"; the same gap applies to card/cards and wallet/wallets. Only the
 *   last word varies, so "payment processing" is unaffected.
 */
function phrasePattern(phrase: string): string {
  const words = phrase
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const last = words.length - 1;
  const word = words[last];

  // The optional "s" has to work in both directions: the keyword may be plural
  // and the posting singular ("payments" vs "Senior Product Manager- payment"),
  // or the reverse ("payout" vs "payouts"). Words ending in "ss" are left alone
  // so "process" does not become "proces?s?".
  if (/[a-rt-z]s$/i.test(word)) words[last] = `${word.slice(0, -1)}s?`;
  else if (/[a-z]$/i.test(word)) words[last] = `${word}s?`;

  return words.join("[\\s-]+");
}

/** Every index where a phrase occurs, for the proximity checks in `domain.ts`. */
export function phrasePositions(haystack: string, phrase: string): number[] {
  if (!haystack || !phrase) return [];
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])${phrasePattern(phrase)}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(haystack)) !== null) {
    out.push(match.index);
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return out;
}

/**
 * Apply title aliases and strip a trailing level marker.
 *
 * This is where "Product Lead" becomes "lead product manager" — an alias rather
 * than a new entry in the target list, so the configured roles stay exactly as
 * written while the titles people actually post still resolve.
 */
export function normalizeTitle(title: string): string {
  // A title is commonly "Role, Domain" or "Role - Domain"; the qualifier after
  // the separator is domain information, not role information.
  let text = normalizeText(title);

  for (const [pattern, replacement] of PREQUAL_CONFIG.roles.aliases) {
    text = text.replace(new RegExp(pattern.source, pattern.flags), replacement);
  }

  return text.replace(PREQUAL_CONFIG.roles.levelSuffix, "").trim();
}

/**
 * The role-bearing head of a title.
 *
 * "Senior Product Manager, Payments" and "Product Manager - Merchant Growth
 * (Berlin)" both carry the role before the first separator. Splitting lets the
 * role filter read the title without domain words confusing it, which is what
 * PRD §5 means by "primarily use the job title".
 */
export function titleHead(normalizedTitle: string): string {
  return normalizedTitle.split(/\s*[,\-–—|/(]\s*/)[0]?.trim() ?? normalizedTitle;
}
