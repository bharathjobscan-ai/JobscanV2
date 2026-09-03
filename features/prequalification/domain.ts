import { PREQUAL_CONFIG, type SectionId, type TierId } from "@/config/prequalification";
import type { DomainTier, RestrictedTerm } from "@/config/prequalification/domains";
import { containsPhrase, normalizeText, phrasePositions } from "./normalize";
import type { JdSection } from "./sections";
import type { DomainResult, DomainSignal } from "./types";

/**
 * Domain filter (PRD §6-§8).
 *
 * The scoring rule the PRD left undefined: **each section contributes its
 * weight once**, multiplied by the best tier matched in that section.
 *
 * Counting once is what stops a keyword-stuffed JD outscoring a genuinely
 * on-domain one — under per-keyword addition, a responsibilities block listing
 * eight payment nouns scores 24 and the pass threshold of 5 stops meaning
 * anything. Tier multiplication is what makes the config's `priority` field
 * actually do something: without it a crypto role and a card-acquiring role
 * score identically.
 */

/** Is a restricted term genuinely on-domain here, or a false friend? */
function restrictedTermApplies(
  text: string,
  rule: RestrictedTerm,
): { ok: boolean; why: string } {
  const positions = phrasePositions(text, rule.term);
  if (positions.length === 0) return { ok: false, why: "not present" };

  for (const at of positions) {
    const window = text.slice(
      Math.max(0, at - rule.windowChars),
      at + rule.term.length + rule.windowChars,
    );

    if (rule.blockedNear?.some((blocker) => containsPhrase(window, blocker))) {
      continue;
    }
    if (!rule.requiresNear || rule.requiresNear.some((n) => containsPhrase(window, n))) {
      return { ok: true, why: "corroborated" };
    }
  }

  return {
    ok: false,
    // The Visa case: on this job feed "visa sponsorship" is far more common
    // than the card network, and counting it would poison every score.
    why: `"${rule.term}" appears but reads as sponsorship or lacks a payments context`,
  };
}

function tierMatchesIn(
  text: string,
  tier: DomainTier,
  restricted: readonly RestrictedTerm[],
): { terms: string[]; suppressed: { term: string; why: string }[] } {
  const terms: string[] = [];
  const suppressed: { term: string; why: string }[] = [];

  for (const keyword of tier.keywords) {
    if (containsPhrase(text, keyword)) terms.push(keyword);
  }

  for (const rule of restricted) {
    if (rule.tier !== tier.id) continue;
    const verdict = restrictedTermApplies(text, rule);
    if (verdict.ok) terms.push(rule.term);
    else if (verdict.why !== "not present") {
      suppressed.push({ term: rule.term, why: verdict.why });
    }
  }

  return { terms, suppressed };
}

export function evaluateDomain(
  title: string,
  sections: readonly JdSection[],
): DomainResult {
  const weights = PREQUAL_CONFIG.sectionWeights;
  const { tiers, restricted, negative, gate } = PREQUAL_CONFIG.domains;

  // The title is a section in its own right, at the heaviest weight.
  const scored: { id: SectionId; text: string }[] = [
    { id: "title", text: normalizeText(title) },
    ...sections.map((s) => ({ id: s.id, text: normalizeText(s.text) })),
  ];

  const signals: DomainSignal[] = [];
  const suppressed: { term: string; why: string }[] = [];
  let score = 0;
  const tierHits = new Map<TierId, number>();

  for (const section of scored) {
    if (!section.text) continue;

    let bestTier: DomainTier | null = null;
    const sectionTerms: { tier: DomainTier; terms: string[] }[] = [];

    for (const tier of tiers) {
      const { terms, suppressed: skipped } = tierMatchesIn(section.text, tier, restricted);
      suppressed.push(...skipped);
      if (terms.length === 0) continue;

      sectionTerms.push({ tier, terms });
      if (!bestTier || tier.priority < bestTier.priority) bestTier = tier;
    }

    if (!bestTier) continue;

    // Section counts once, at the strength of its best tier.
    const weight = (weights[section.id] ?? 0) * bestTier.multiplier;
    score += weight;
    tierHits.set(bestTier.id, (tierHits.get(bestTier.id) ?? 0) + 1);

    for (const { tier, terms } of sectionTerms) {
      for (const term of terms) {
        signals.push({ term, section: section.id, tier: tier.id, weight: tier === bestTier ? weight : 0 });
      }
    }
  }

  // A soft counterweight, not a veto: a strong payments signal still wins, but
  // an HR platform that mentions payouts once should not drift into PASS.
  const wholeText = scored.map((s) => s.text).join(" ");
  const negatives = negative.filter((term) => containsPhrase(wholeText, term));
  if (negatives.length > 0 && score > 0) score = Math.max(0, score - 2);

  const primaryDomain =
    [...tierHits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const matchedTerms = [...new Set(signals.map((s) => s.term))];
  const rounded = Math.round(score * 100) / 100;

  const status =
    rounded >= gate.pass ? "pass" : rounded >= gate.review ? "unknown" : "fail";

  const reason =
    status === "pass"
      ? `Scored ${rounded} on ${primaryDomain ?? "domain"} signals (pass at ${gate.pass}).`
      : status === "unknown"
        ? `Scored ${rounded} — some domain signal, below the ${gate.pass} pass threshold.`
        : negatives.length > 0
          ? `Scored ${rounded}; the posting reads as ${negatives[0]}.`
          : `Scored ${rounded}, below the ${gate.review} review threshold — no meaningful domain signal.`;

  return {
    status,
    primaryDomain,
    score: rounded,
    matchedTerms,
    signals,
    suppressed,
    reason,
  };
}
