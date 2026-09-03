/**
 * Scoring weights and gates (JSV2S1037).
 *
 * Every number here is meant to be tuned once real LinkedIn volume exists.
 * Changing one is a config edit; no engine code reads a literal.
 */

import type { IngestionTrigger } from "@/lib/config/constants";

export type SectionId =
  | "title"
  | "responsibilities"
  | "requirements"
  | "summary"
  | "company_description"
  | "nice_to_have"
  | "body";

/**
 * How much a domain signal is worth by where it appears.
 *
 * `body` is the fallback bucket for a job description with no detectable
 * headings — roughly half of scraped postings. It is weighted at the
 * `requirements` level: enough that an unstructured but genuinely relevant JD
 * can still qualify alongside its title, not so much that it can carry a job
 * on its own.
 */
export const SECTION_WEIGHTS: Record<SectionId, number> = {
  title: 5,
  responsibilities: 3,
  requirements: 2,
  summary: 1,
  company_description: 1,
  nice_to_have: 0.5,
  body: 2,
};

/**
 * Domain gate.
 *
 * With section-once, tier-multiplied scoring the maximum is ~14.5, and a
 * Tier-1 title match alone is exactly 5. So `pass: 5` means "the title is
 * on-domain, or two body sections agree", and `review: 2` means "something
 * relevant was said somewhere".
 */
export const DOMAIN_GATE = {
  /**
   * Lowered from 5 to 3 on 2026-09-04, measured against a 100-job London
   * sample. At 5 only two jobs qualified and GoCardless sat in the review
   * queue; at 3, fourteen qualify and Wise's own identity-linking role is
   * caught. The trade is accepted knowingly: Trip.com, a company-formation
   * firm and an insurance platform also get through, and are rejected by the
   * score rather than by the gate.
   */
  pass: 3,
  review: 1,
} as const;

/**
 * Experience tolerance (JSV2S1054).
 *
 * `floor` is the fix for the PRD's over-qualification hole: it declared
 * `acceptable_min: 5` and then never used it in any rule, so a JD asking for
 * "2+ years" passed a 9-year candidate. A stated requirement below the floor
 * now fails.
 *
 * `ceiling` resolves the PRD's own contradiction — page 10 said a 10+ year
 * requirement should be UNKNOWN while page 11's `acceptable_max: 12` implied
 * PASS. One rule: at or under the ceiling passes, above it fails.
 */
export const EXPERIENCE = {
  candidateYears: 9,
  /**
   * Whether a posting that states no years requirement may still qualify.
   *
   * True since 2026-09-04. Most senior postings never state a number — 7 of 100
   * in the London sample, including Global Payments at a domain score of 8.5 —
   * and holding all of them for manual review is a standing tax on the commonest
   * JD style. Silence is not evidence against the candidate. A requirement that
   * *is* stated and falls outside the range still fails.
   */
  unstatedPasses: true,
  /** A requirement below this reads as too junior for the candidate. */
  floor: 5,
  /** The first requirement level that is out of reach: 12+ years fails. */
  ceiling: 12,
} as const;

/**
 * Which ingestion triggers gate.
 *
 * **All of them, since 2026-09-04.** The original rule exempted manual uploads
 * on the reasoning that a hand-curated file is a deliberate act. That held for a
 * ten-row sheet and fails completely for the real use: a one-time Apify backfill
 * of thirty days across eleven cities is thousands of rows, and exempting it
 * would create thousands of applications — precisely the flood the gate exists
 * to prevent.
 *
 * Nothing is lost by gating: a screened-out job keeps its `raw_jobs` row and
 * waits in the review queue, one click from becoming an application.
 */
export const GATING_TRIGGERS: readonly IngestionTrigger[] = [
  "manual_upload",
  "scheduled",
  "backfill",
];
