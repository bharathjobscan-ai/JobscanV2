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
 * The pass bar (JSV2S1060, decided 2026-09-19).
 *
 * **A target, not a gate.** Nothing in the system blocks, retries or
 * regenerates against this number — it changes which verdict is reported and
 * nothing else, and the owner approves every edit before it is merged.
 *
 * That distinction is the decision, not a detail. A hard 90 would create two
 * problems it cannot solve: SimG would be under pressure to INVENT experience
 * to clear the bar, against its own standing rule that recommendations are
 * fixes grounded in the master resume; and the bar sits above the demonstrated
 * ceiling anyway — the Console skill scored the GoCardless CV 84 after seven
 * accepted recommendations and called that a borderline pass. A target above
 * the reference implementation's best result is a target most runs will miss,
 * and a system that auto-regenerated against it would be an unbounded spend
 * loop chasing a number.
 *
 * So: aim at 90, report the gap, stop.
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
