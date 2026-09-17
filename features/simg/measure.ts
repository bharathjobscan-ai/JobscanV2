import { applyAtsHygiene } from "@/lib/documents/ats";
import type { SimgEvaluation } from "./types";

/**
 * The part of the document score that can be measured rather than estimated
 * (JSV2S1145).
 *
 * SimG's projection is the model's own opinion of what its edits are worth, and
 * without a second billed call there is no way to check it. But the ATS lens —
 * 30% of the composite — rests on two things that are both deterministic:
 *
 * - **Parse readiness**, already computed in code by `lib/documents/ats.ts`.
 * - **Keyword coverage**, which is string matching against the JD's own terms.
 *
 * So roughly a third of the score can be turned from estimate into measurement
 * at zero cost, leaving only the recruiter and hiring-manager lenses as
 * judgement. That is the whole point of this module.
 *
 * Pure: takes the derived CV and the stored evaluation, returns numbers.
 */

export type AtsMeasurement = {
  /** Deterministic parse readiness of the CV as it now stands, 0-100. */
  parseScore: number;
  /** Must-have keywords present now, by string match. */
  mustHaveFound: number;
  mustHaveTotal: number;
  /** Terms SimG reported missing that the accepted edits have since supplied. */
  recovered: string[];
  /** Terms still absent. */
  stillMissing: string[];
  /**
   * The ATS lens, measured.
   *
   * The 50/50 blend of parse readiness and keyword coverage is OUR definition,
   * not SimG's — its own blend is not stated and cannot be recovered. Declaring
   * the blend here means the number is reproducible and arguable, which an
   * opaque one would not be.
   */
  lensScore: number;
  /** Change against SimG's original ATS score. Positive is improvement. */
  delta: number | null;
};

/** Word-boundary match, so "pay" does not count inside "payroll". */
function contains(haystack: string, term: string): boolean {
  const safe = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!safe) return false;
  return new RegExp(`\\b${safe}\\b`, "i").test(haystack);
}

export function measureAts(
  markdown: string,
  evaluation: SimgEvaluation,
): AtsMeasurement | null {
  const keywords = evaluation.keywords;
  // Without a must-have total there is no coverage to measure, and inventing a
  // denominator would be worse than reporting nothing.
  if (!keywords?.mustHaveTotal) return null;

  const { report } = applyAtsHygiene(markdown);
  const missing = keywords.missing ?? [];

  const recovered = missing.filter((term) => contains(markdown, term));
  const stillMissing = missing.filter((term) => !contains(markdown, term));

  // SimG's original count plus whatever the accepted edits have since supplied,
  // capped at the total — a model that miscounted its own baseline must not be
  // able to push coverage above 100%.
  const mustHaveFound = Math.min(
    keywords.mustHaveTotal,
    (keywords.mustHaveFound ?? 0) + recovered.length,
  );

  const coverage = (mustHaveFound / keywords.mustHaveTotal) * 100;
  const lensScore = Math.round(0.5 * report.parseScore + 0.5 * coverage);

  return {
    parseScore: report.parseScore,
    mustHaveFound,
    mustHaveTotal: keywords.mustHaveTotal,
    recovered,
    stillMissing,
    lensScore,
    delta:
      evaluation.current.ats?.score === undefined
        ? null
        : lensScore - evaluation.current.ats.score,
  };
}
