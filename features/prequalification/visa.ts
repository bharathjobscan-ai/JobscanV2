import {
  COUNTRY_SIGNAL_TERMS,
  GENERIC_TERMS,
  NEGATION_TERMS,
  NEGATION_WINDOW_WORDS,
  VISA_RULES,
  VISA_RULE_POINTS,
  VISA_SECTION_HEADINGS,
  type VisaReasonCode,
  type VisaRuleCategory,
} from "@/config/prequalification/visa";
import { normalizeText } from "./normalize";
import type { FilterStatus } from "@/lib/config/constants";

/**
 * The visa-language filter (JSV2S1156, ADR-0006 revision 2026-09-19).
 *
 * Deterministic and offline, like every other filter here. It answers one
 * question — does this posting explicitly refuse sponsorship — and refuses to
 * answer any wider one.
 *
 * SILENCE PASSES. Most postings in London, Amsterdam and Berlin say nothing
 * about visas at all, and a filter that read silence as refusal would reject
 * almost the entire intake. Generic right-to-work language passes too: "must
 * have the right to work in the UK" is compatible with a candidate the company
 * can later sponsor, and treating it as refusal is the single most common way
 * this kind of filter goes wrong.
 */

export type VisaCategory = "keep" | "review" | "remove";

export type VisaEvidence = {
  ruleId: string;
  reasonCode: VisaReasonCode;
  category: VisaRuleCategory;
  /** The sentence the rule matched, from the ORIGINAL text, for the UI. */
  text: string;
  confidence: number;
  /** Matched under an immigration heading rather than loose in the body. §4. */
  scoped: boolean;
};

export type VisaResult = {
  status: FilterStatus;
  category: VisaCategory;
  reasonCode: VisaReasonCode;
  evidence: VisaEvidence[];
  /** Country vocabulary found. Recorded, never decisive. §22. */
  countrySignals: string[];
  /** Generic boilerplate present but deliberately not acted on. §16. */
  genericTerms: string[];
  /** §20. Analytics and confidence only — precedence decides the category. */
  score: number;
  confidence: number;
  reason: string;
};

/**
 * Normalisation for pattern matching only. The original text is never modified.
 *
 * Beyond `normalizeText`: apostrophes are dropped so "can't" and "cant" are one
 * string, and hyphens become spaces so "visa-sponsorship" and "visa
 * sponsorship" are one string. Both variants are common in scraped postings and
 * neither is worth doubling every pattern for.
 */
export function normaliseForVisa(value: string | null | undefined): string {
  return normalizeText(value).replace(/['’]/g, "").replace(/-/g, " ").replace(/\s+/g, " ");
}

/** Split into sentences, keeping the original text alongside the normalised. */
function sentences(original: string): { raw: string; norm: string }[] {
  return original
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((raw) => ({ raw: raw.trim(), norm: normaliseForVisa(raw) }))
    .filter((s) => s.norm.length > 0);
}

/**
 * Character ranges that sit under an immigration heading.
 *
 * A window rather than a parsed section, because LinkedIn descriptions arrive
 * with their structure already flattened — `descriptionHtml` is converted to
 * text upstream and headings survive only as bare lines.
 */
function scopedRanges(norm: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const heading of VISA_SECTION_HEADINGS) {
    const re = new RegExp(`\\b${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm)) !== null) {
      ranges.push([m.index, Math.min(norm.length, m.index + 800)]);
    }
  }
  return ranges;
}

/**
 * §17 — a sponsorship noun within a short window of a negation.
 *
 * Exists because no phrase list catches every recruiter's phrasing. Deliberately
 * narrow: the spec suggests 40-60 tokens, which reaches across sentence
 * boundaries and starts matching negations that belong to an unrelated clause.
 */
function negationProximity(norm: string): boolean {
  // Split on anything that is not a letter or digit. Splitting on spaces alone
  // leaves "unable," and "sponsorship." as tokens, which match neither the
  // negation set nor the sponsorship test — so the rule silently never fired on
  // any sentence with punctuation in it, which is most of them.
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  const negations = new Set(NEGATION_TERMS);
  for (let i = 0; i < words.length; i++) {
    if (!/^sponsor(ship|ed|ing)?$/.test(words[i])) continue;
    const from = Math.max(0, i - NEGATION_WINDOW_WORDS);
    const to = Math.min(words.length, i + NEGATION_WINDOW_WORDS + 1);
    for (let j = from; j < to; j++) {
      if (j !== i && negations.has(words[j])) return true;
    }
  }
  return false;
}

export function evaluateVisaLanguage(description: string | null | undefined): VisaResult {
  const original = description ?? "";
  const norm = normaliseForVisa(original);

  if (!norm) {
    return {
      status: "unknown",
      category: "review",
      reasonCode: "UNKNOWN",
      evidence: [],
      countrySignals: [],
      genericTerms: [],
      score: 0,
      confidence: 0,
      reason: "No description to read, so sponsorship language is unknown.",
    };
  }

  const ranges = scopedRanges(norm);
  const inScope = (index: number) => ranges.some(([a, b]) => index >= a && index < b);

  const evidence: VisaEvidence[] = [];
  for (const { raw, norm: sn } of sentences(original)) {
    for (const rule of VISA_RULES) {
      if (!rule.pattern.test(sn)) continue;
      const at = norm.indexOf(sn.slice(0, 40));
      const scoped = at >= 0 && inScope(at);
      evidence.push({
        ruleId: rule.id,
        reasonCode: rule.reasonCode,
        category: rule.category,
        // Trimmed: a matched "sentence" can be a whole unpunctuated paragraph.
        text: raw.length > 320 ? `${raw.slice(0, 317)}...` : raw,
        confidence: Math.min(1, rule.confidence + (scoped ? 0.02 : 0)),
        scoped,
      });
    }
  }

  const has = (c: VisaRuleCategory) => evidence.some((e) => e.category === c);

  // The proximity rule contributes a negative signal but no quotable sentence,
  // so it is folded in as a category rather than as evidence.
  const proximityNegative = !has("negative") && negationProximity(norm);

  const negative = has("negative") || proximityNegative;
  const roleBlock = has("role_block");
  const citizenshipBlock = has("citizenship_block");
  const positive = has("positive");
  const conditional = has("conditional");

  const countrySignals = Object.values(COUNTRY_SIGNAL_TERMS)
    .flat()
    .filter((t) => new RegExp(`\\b${t}\\b`).test(norm));

  const genericTerms = GENERIC_TERMS.filter((t) => new RegExp(`\\b${t}\\b`).test(norm));

  const score = evidence.reduce((sum, e) => sum + VISA_RULE_POINTS[e.category], 0);

  /**
   * §19 — a posting that both offers and refuses goes to review.
   *
   * Deliberately beats the negative rules. Boilerplate footers and role-level
   * statements contradict each other often enough that resolving it in code
   * would mean guessing which one is about THIS job, and the cost of guessing
   * wrong in the removing direction is a job we never see again.
   */
  if ((negative || roleBlock) && (positive || conditional)) {
    return finish(
      "review",
      "unknown",
      "CONTRADICTORY",
      "The posting both offers and refuses sponsorship — read it before deciding.",
    );
  }

  if (negative) {
    return finish(
      "remove",
      "fail",
      "EXPLICIT_NO_SPONSORSHIP",
      proximityNegative && !has("negative")
        ? "Sponsorship is named alongside a negation, closely enough to read as a refusal."
        : "The posting explicitly states that sponsorship is not available.",
    );
  }

  if (roleBlock) {
    return finish(
      "remove",
      "fail",
      "ROLE_NOT_SPONSORABLE",
      "The posting states that this role is not eligible for sponsorship.",
    );
  }

  if (citizenshipBlock) {
    return finish(
      "remove",
      "fail",
      "CITIZENSHIP_RESTRICTION",
      "The posting restricts the role to citizens or nationals, which no sponsorship can satisfy.",
    );
  }

  if (positive) {
    return finish(
      "keep",
      "pass",
      "EXPLICIT_SPONSORSHIP_AVAILABLE",
      "The posting explicitly offers visa sponsorship.",
    );
  }

  if (conditional) {
    return finish(
      "review",
      "unknown",
      "CONDITIONAL_SPONSORSHIP",
      "Sponsorship is offered conditionally — worth reading, not worth discarding.",
    );
  }

  if (has("existing_auth") || has("permanent_auth")) {
    return finish(
      "review",
      "unknown",
      "EXISTING_AUTHORIZATION_REQUIRED",
      "Existing work authorisation is mentioned, with no explicit refusal to sponsor.",
    );
  }

  if (has("citizenship_pref")) {
    return finish(
      "review",
      "unknown",
      "CITIZENSHIP_RESTRICTION",
      "Citizenship is preferred rather than required.",
    );
  }

  if (has("local_only")) {
    return finish(
      "review",
      "unknown",
      "LOCAL_CANDIDATES_ONLY",
      "Local residence is requested, which is not the same as refusing sponsorship.",
    );
  }

  if (genericTerms.length > 0) {
    return finish(
      "review",
      "pass",
      "GENERIC_RIGHT_TO_WORK",
      "Only generic right-to-work boilerplate, which is not evidence either way.",
    );
  }

  return finish(
    "review",
    "pass",
    "UNKNOWN",
    "The posting says nothing about sponsorship, which is not a refusal.",
  );

  function finish(
    category: VisaCategory,
    status: FilterStatus,
    reasonCode: VisaReasonCode,
    reason: string,
  ): VisaResult {
    // Only the evidence that argues for the verdict actually reached, so the
    // review screen shows the sentence the decision rests on rather than every
    // immigration phrase in the posting.
    const relevant = evidence.filter((e) => e.reasonCode === reasonCode);
    const shown = relevant.length > 0 ? relevant : evidence;
    return {
      status,
      category,
      reasonCode,
      evidence: shown.slice(0, 4),
      countrySignals: [...new Set(countrySignals)],
      genericTerms,
      score,
      confidence: shown.length > 0 ? Math.max(...shown.map((e) => e.confidence)) : 0,
      reason,
    };
  }
}
