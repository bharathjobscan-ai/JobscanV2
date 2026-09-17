/**
 * SimG configuration — JSV2S1058 (mandatory Pass G) and JSV2S1060 (the bar).
 *
 * TS-as-data, like `config/prequalification/`, so the numbers that decide spend
 * and quality are in one readable file rather than inline in a prompt.
 */

/**
 * How the three adversarial lenses combine into the document score.
 *
 * ATS carries less than the human lenses deliberately: half of it is already
 * deterministic (`lib/documents/ats.ts` computes parse readiness), and a CV that
 * parses perfectly but reads generically still does not get an interview.
 * Weights sum to 1 — asserted in tests, because a drift here silently rescales
 * every historical document score.
 */
export const LENS_WEIGHTS = {
  ats: 0.3,
  recruiter: 0.35,
  hiringManager: 0.35,
} as const;

export type LensKey = keyof typeof LENS_WEIGHTS;

export const LENS_LABELS: Record<LensKey, string> = {
  ats: "ATS parse",
  recruiter: "Recruiter · 6 sec",
  hiringManager: "Hiring manager",
};

/**
 * The pass bar. **JSV2S1060 is still Blocked on your decision** — 90 is the
 * aspiration stated in the backlog, used here as a working default so SimG can
 * ship. Changing it changes only which verdict is reported, never a document.
 */
export const TARGET_DOCUMENT_SCORE = 90;

/** Below `TARGET - this`, the verdict is `reject` rather than `borderline`. */
export const BORDERLINE_BAND = 10;

/**
 * Whether SimG runs automatically after a CV/CL generation.
 *
 * This is the switch behind "should I run SimG every time?": it is a third
 * billed call per application, and the per-task cost split in the workspace
 * (`features/ai/cost.ts`, grouped by task type) is what makes the answer
 * measurable rather than a guess.
 */
export const SIMG_AUTOMATIC = true;

/** Guard rail on the worklist, matching the prompt's own instruction. */
export const RECOMMENDATION_BOUNDS = { min: 5, max: 8, maxPoints: 8 } as const;

/** Composite document score from the three lens scores. Deterministic. */
export function compositeScore(lenses: Record<LensKey, number>): number {
  const total =
    lenses.ats * LENS_WEIGHTS.ats +
    lenses.recruiter * LENS_WEIGHTS.recruiter +
    lenses.hiringManager * LENS_WEIGHTS.hiringManager;
  return Math.round(total);
}

export type SimgVerdict = "pass" | "borderline" | "reject";

/**
 * Derived from the composite, never taken from the model — the same rule as
 * `matchCategoryFor`: a pure function of a number cannot be allowed to drift
 * between runs.
 */
export function verdictFor(composite: number): SimgVerdict {
  if (composite >= TARGET_DOCUMENT_SCORE) return "pass";
  if (composite >= TARGET_DOCUMENT_SCORE - BORDERLINE_BAND) return "borderline";
  return "reject";
}
