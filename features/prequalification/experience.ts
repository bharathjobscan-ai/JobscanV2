import { PREQUAL_CONFIG } from "@/config/prequalification";
import { normalizeText } from "./normalize";
import type { ExperienceResult } from "./types";

/**
 * Experience filter (PRD §9).
 *
 * Two corrections to the source spec:
 *
 * 1. **`acceptable_min` was declared and never used.** A JD asking "2+ years"
 *    set a minimum a 9-year candidate clears, so an Associate-level posting
 *    passed. It is now a floor: a requirement below it fails.
 * 2. **Pages 10 and 11 contradicted each other** on a 10+ year requirement —
 *    UNKNOWN on one page, PASS by implication on the other. One rule now: at or
 *    under the ceiling passes, above it fails.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20,
};

const NUMBER = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)";

/**
 * Patterns are anchored to experience wording on purpose.
 *
 * A bare `\d+ years` regex extracts from "founded 10 years ago", "5 years of
 * growth" and "10 years in market" — all common in the company blurb, and all
 * of which would silently set a requirement the posting never made.
 */
const PATTERNS: readonly { re: RegExp; kind: "range" | "min" }[] = [
  // "7-10 years", "3–5 years' experience" (LinkedIn emits en-dashes)
  { re: new RegExp(`${NUMBER}\\s*(?:-|to)\\s*${NUMBER}\\+?\\s*(?:\\+)?\\s*years?`, "gi"), kind: "range" },
  // "minimum 8 years", "at least 5 years"
  { re: new RegExp(`(?:minimum|min\\.?|at least|no less than)\\s*(?:of\\s*)?${NUMBER}\\+?\\s*years?`, "gi"), kind: "min" },
  // "7+ years", "8 or more years"
  { re: new RegExp(`${NUMBER}\\s*(?:\\+|or more|plus)\\s*years?`, "gi"), kind: "min" },
  // "10 years of experience", "5 years' experience"
  { re: new RegExp(`${NUMBER}\\s*years?'?s?\\s*(?:of\\s*)?(?:relevant\\s*|professional\\s*|hands-on\\s*|proven\\s*)?experience`, "gi"), kind: "min" },
];

/** Words that must sit near a bare "N years" for it to count as a requirement. */
const EXPERIENCE_CONTEXT =
  /(experience|exp\b|track record|background|working|worked|building|managing|product management|in product)/i;

const CONTEXT_WINDOW = 80;

function toNumber(token: string): number | null {
  const digits = Number.parseInt(token, 10);
  if (Number.isFinite(digits)) return digits;
  return WORD_NUMBERS[token.toLowerCase()] ?? null;
}

type Extracted = { min: number; max: number | null; phrase: string };

/**
 * Pull every stated requirement out of the text.
 *
 * A JD often states several ("5+ years in product, 3+ in payments"). The
 * *lowest* minimum is the one that governs entry — the others are qualifiers on
 * subsets of the role, and treating the highest as the bar would reject jobs
 * the candidate is plainly eligible for.
 */
export function extractExperience(text: string): Extracted | null {
  const haystack = normalizeText(text);
  if (!haystack) return null;

  const found: Extracted[] = [];

  for (const { re, kind } of PATTERNS) {
    const regex = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(haystack)) !== null) {
      const around = haystack.slice(
        Math.max(0, match.index - CONTEXT_WINDOW),
        match.index + match[0].length + CONTEXT_WINDOW,
      );
      if (!EXPERIENCE_CONTEXT.test(around)) continue;

      const first = toNumber(match[1]);
      if (first === null) continue;

      if (kind === "range") {
        const second = toNumber(match[2] ?? "");
        found.push({ min: first, max: second ?? null, phrase: match[0].trim() });
      } else {
        found.push({ min: first, max: null, phrase: match[0].trim() });
      }
    }
  }

  if (found.length === 0) return null;
  return found.reduce((lowest, next) => (next.min < lowest.min ? next : lowest));
}

export function evaluateExperience(text: string): ExperienceResult {
  const { candidateYears, floor, ceiling, unstatedPasses } = PREQUAL_CONFIG.experience;
  const found = extractExperience(text);

  if (!found) {
    return {
      // `rule` stays NOT_STATED whatever the status, so the workspace can show
      // that the requirement was absent rather than confirmed.
      status: unstatedPasses ? "pass" : "unknown",
      rule: "NOT_STATED",
      candidateYears,
      requiredMin: null,
      requiredMax: null,
      matchedPhrase: null,
      // PRD §9: do not assume a requirement that is not present — which cuts
      // both ways. An absent requirement is not evidence against the candidate.
      reason: unstatedPasses
        ? "The posting states no experience requirement, so nothing contradicts the candidate."
        : "The posting states no experience requirement.",
    };
  }

  const base = {
    candidateYears,
    requiredMin: found.min,
    requiredMax: found.max,
    matchedPhrase: found.phrase,
  };

  if (found.min >= ceiling) {
    return {
      ...base,
      status: "fail",
      rule: "ABOVE_CEILING",
      reason: `Requires ${found.min}+ years, at or above the ${ceiling}-year ceiling for ${candidateYears} years of experience.`,
    };
  }

  // The over-qualification guard. A stated range topping out below the floor is
  // a junior role however the title is worded.
  const statedTop = found.max ?? found.min;
  if (statedTop < floor) {
    return {
      ...base,
      status: "fail",
      rule: "BELOW_FLOOR",
      reason: `Asks for ${found.max ? `${found.min}-${found.max}` : `${found.min}+`} years, below the ${floor}-year floor — too junior.`,
    };
  }

  return {
    ...base,
    status: "pass",
    rule: "WITHIN_RANGE",
    reason: `Requires ${found.max ? `${found.min}-${found.max}` : `${found.min}+`} years; candidate has ${candidateYears}.`,
  };
}
