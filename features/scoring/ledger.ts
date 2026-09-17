import {
  PILLAR_LABELS,
  PILLAR_WEIGHTS,
  pillarKeyFor,
  type PillarKey,
} from "@/config/scoreg";
import type { JobScoreAnalysis, ScoreLineItem } from "@/db/schema";

/**
 * The score as a running deduction (JSV2S1140).
 *
 * ScoreG reports what each component *earned*. The ledger inverts that: every
 * point starts on the table and is lost to a named rule. That reframing is the
 * point of the story — "you scored 54" invites argument; "you lost 35 points
 * because no sponsor evidence was found" tells you what to change.
 *
 * Pure, and derived entirely from data already stored. No new AI call and no
 * new column — this is presentation of `job_score_analysis.breakdown`.
 */

export type LedgerSubItem = {
  component: string;
  awarded: number;
  max: number;
  /** Weighted points this component cost, already scaled by the pillar weight. */
  lost: number;
  reason?: string;
};

export type LedgerPillar = {
  key: PillarKey;
  label: string;
  weight: number;
  /** The pillar's own 0-100 score, from its components. */
  score: number;
  /** Weighted points lost across the whole pillar. */
  lost: number;
  /** Running total after this pillar's deduction. */
  running: number;
  items: LedgerSubItem[];
};

export type ScoreLedger = {
  /** Always 100 — the ledger's premise. */
  startingPoints: number;
  pillars: LedgerPillar[];
  totalLost: number;
  /** 100 minus deductions, which should equal the stored score. */
  computed: number;
  /**
   * The score actually stored on the application.
   *
   * Kept alongside `computed` rather than replacing it: if the two disagree,
   * the model's arithmetic and its own breakdown disagree, and the UI must say
   * so rather than quietly showing whichever is prettier.
   */
  stored: number | null;
  /** True when the ledger reconciles with the stored score, within rounding. */
  reconciles: boolean;
};

function isLineItems(
  breakdown: JobScoreAnalysis["breakdown"],
): breakdown is ScoreLineItem[] {
  return Array.isArray(breakdown);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Build the ledger, or return null when the breakdown cannot support one.
 *
 * Null rather than a half-built ledger is deliberate: a partial deduction table
 * that does not add up to the score is worse than no table, because it looks
 * authoritative.
 */
export function buildLedger(
  analysis: JobScoreAnalysis | null | undefined,
  storedScore: number | null,
): ScoreLedger | null {
  if (!analysis?.breakdown || !isLineItems(analysis.breakdown)) return null;

  const grouped = new Map<PillarKey, ScoreLineItem[]>();
  for (const item of analysis.breakdown) {
    const key = pillarKeyFor(item.pillar ?? "");
    // An unrecognised pillar is skipped, never forced into a bucket — a
    // mis-bucketed line would silently move points between pillars.
    if (!key) continue;
    if (typeof item.awarded !== "number" || typeof item.max !== "number") continue;
    if (item.max <= 0) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  if (grouped.size === 0) return null;

  let running = 100;
  const pillars: LedgerPillar[] = [];

  for (const key of Object.keys(PILLAR_WEIGHTS) as PillarKey[]) {
    const items = grouped.get(key);
    if (!items?.length) continue;

    const weight = PILLAR_WEIGHTS[key];
    const awarded = items.reduce((n, i) => n + i.awarded, 0);
    const max = items.reduce((n, i) => n + i.max, 0);
    const score = (awarded / max) * 100;
    const lost = weight * (100 - score);

    running -= lost;

    pillars.push({
      key,
      label: PILLAR_LABELS[key],
      weight,
      score: round1(score),
      lost: round1(lost),
      running: round1(running),
      items: items.map((i) => ({
        component: i.component,
        awarded: i.awarded,
        max: i.max,
        // Each component's share of the pillar, scaled by the pillar's weight.
        lost: round1(weight * ((i.max - i.awarded) / max) * 100),
        reason: i.reason,
      })),
    });
  }

  if (pillars.length === 0) return null;

  const totalLost = round1(pillars.reduce((n, p) => n + p.lost, 0));
  const computed = round1(100 - totalLost);

  return {
    startingPoints: 100,
    pillars,
    totalLost,
    computed,
    stored: storedScore,
    // A point and a half of slack for rounding; anything wider is a real
    // disagreement between the model's arithmetic and its own breakdown.
    reconciles: storedScore === null || Math.abs(computed - storedScore) <= 1.5,
  };
}
