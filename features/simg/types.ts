import type { LensKey } from "@/config/simg";

/**
 * SimG — the adversarial evaluation of a generated CV (JSV2S1058).
 *
 * Stored as one jsonb blob on the `application_documents` row for the resume
 * version it evaluated. That placement is the whole invalidation strategy:
 * regenerate the CV and you get a new row with no evaluation, so a worklist can
 * never be applied to a document it did not read.
 */

export const RECOMMENDATION_KINDS = ["modify", "insert", "delete"] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

/**
 * `accepted` is applied, not staged — the CV the user reads and downloads
 * already reflects it (their decision, 2026-09-05). It stays reversible because
 * the original markdown is never overwritten: the current CV is *derived* by
 * replaying the accepted set over it, so undo is a recompute rather than a
 * revert, and no version history is needed.
 */
export const RECOMMENDATION_STATES = ["pending", "accepted", "discarded"] as const;
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];

export type SimgRecommendation = {
  id: string;
  lens: LensKey;
  kind: RecommendationKind;
  /** Composite points this edit adds. Additive by construction — see SIMG.md. */
  points: number;
  text: string;
  detail: string;
  section?: string;
  /** Exact existing text. Required for modify and delete. */
  before: string | null;
  /** Exact replacement text. Required for modify and insert. */
  after: string | null;
  /** Exact text to insert after. Required for insert. */
  anchorAfter: string | null;
  /** True when the edit asserts experience the master resume does not evidence. */
  requiresConfirmation: boolean;
  confirm: string | null;
  state: RecommendationState;
};

export type LensResult = { score: number; note?: string };

export type SimgEvaluation = {
  /** The master resume scored against this JD — what an untailored CV would get. */
  baseline: Record<LensKey, number>;
  current: Record<LensKey, LensResult>;
  keywords?: {
    mustHaveFound?: number;
    mustHaveTotal?: number;
    goodToHaveFound?: number;
    goodToHaveTotal?: number;
    missing?: string[];
  };
  recommendations: SimgRecommendation[];
  /** Narrative the structured fields cannot carry. */
  markdown?: string;
  model?: string | null;
  provider?: string | null;
  evaluatedAt?: string;
  /**
   * Recommendations the model returned that were thrown away, and why.
   *
   * Never silent: an edit whose `before` is not present in the CV cannot be
   * applied, and dropping it quietly would show the user a worklist item that
   * does nothing when clicked.
   */
  rejected?: { id: string; reason: string }[];
};
