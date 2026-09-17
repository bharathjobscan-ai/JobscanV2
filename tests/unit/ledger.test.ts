import { describe, expect, it } from "vitest";

import { buildLedger } from "@/features/scoring/ledger";
import type { JobScoreAnalysis } from "@/db/schema";

/**
 * JSV2S1140. The worked example is the design's own: a visa pillar scoring
 * 30/100 at 50% weight loses 35 points and takes the score to 65.
 */
const analysis: JobScoreAnalysis = {
  breakdown: [
    { pillar: "Visa Intelligence", component: "Structural Eligibility", awarded: 25, max: 50 },
    { pillar: "Visa Intelligence", component: "Behavioral Signals", awarded: 0, max: 30 },
    { pillar: "Visa Intelligence", component: "Intent Signals", awarded: 5, max: 20 },
    { pillar: "Resume Match", component: "Domain Match", awarded: 50, max: 50 },
    { pillar: "Resume Match", component: "Functional PM Match", awarded: 20, max: 30 },
    { pillar: "Resume Match", component: "Seniority", awarded: 8, max: 20 },
    { pillar: "Job Relevance", component: "Location", awarded: 30, max: 30 },
    { pillar: "Job Relevance", component: "Reachability", awarded: 5, max: 15 },
    { pillar: "Job Relevance", component: "Posting Age", awarded: 20, max: 25 },
    { pillar: "Job Relevance", component: "Role Alignment", awarded: 28, max: 30 },
  ],
};

describe("buildLedger", () => {
  it("starts every score at 100 and deducts", () => {
    const ledger = buildLedger(analysis, 54)!;
    expect(ledger.startingPoints).toBe(100);
    expect(ledger.pillars[0].running).toBeLessThan(100);
  });

  it("weights each pillar's loss — the visa pillar is half the score", () => {
    const ledger = buildLedger(analysis, 54)!;
    const visa = ledger.pillars.find((p) => p.key === "visa")!;

    // 30/100 of the visa pillar earned, so 70 lost x 0.50 = 35 points.
    expect(visa.score).toBe(30);
    expect(visa.lost).toBe(35);
    expect(visa.running).toBe(65);
  });

  it("keeps the running total in pillar order", () => {
    const ledger = buildLedger(analysis, 54)!;
    const runnings = ledger.pillars.map((p) => p.running);
    expect(runnings).toEqual([...runnings].sort((a, b) => b - a));
    expect(ledger.computed).toBe(runnings[runnings.length - 1]);
  });

  it("sub-item losses sum to the pillar's loss", () => {
    const ledger = buildLedger(analysis, 54)!;
    for (const pillar of ledger.pillars) {
      const sum = pillar.items.reduce((n, i) => n + i.lost, 0);
      expect(sum).toBeCloseTo(pillar.lost, 1);
    }
  });

  it("flags a breakdown that disagrees with the stored score", () => {
    // The model's own arithmetic contradicting its own breakdown must be
    // visible, not smoothed over by showing whichever number looks better.
    expect(buildLedger(analysis, 54)!.reconciles).toBe(true);
    expect(buildLedger(analysis, 91)!.reconciles).toBe(false);
    expect(buildLedger(analysis, 91)!.stored).toBe(91);
  });

  it("skips a pillar it cannot recognise rather than mis-bucketing it", () => {
    const odd: JobScoreAnalysis = {
      breakdown: [
        ...(analysis.breakdown as never[]),
        { pillar: "Vibes", component: "Unknown", awarded: 0, max: 100 },
      ],
    };
    const ledger = buildLedger(odd, 54)!;
    expect(ledger.pillars).toHaveLength(3);
    expect(ledger.computed).toBe(buildLedger(analysis, 54)!.computed);
  });

  it("returns null rather than a ledger that cannot be trusted", () => {
    expect(buildLedger(null, 50)).toBeNull();
    expect(buildLedger({}, 50)).toBeNull();
    // The legacy flat map cannot support a deduction table.
    expect(buildLedger({ breakdown: { visa: 30 } }, 50)).toBeNull();
    // Nothing recognisable.
    expect(
      buildLedger({ breakdown: [{ pillar: "Vibes", component: "x", awarded: 1, max: 2 }] }, 50),
    ).toBeNull();
  });

  it("ignores a zero-max component instead of dividing by zero", () => {
    const ledger = buildLedger(
      {
        breakdown: [
          { pillar: "Visa Intelligence", component: "Bad", awarded: 0, max: 0 },
          { pillar: "Visa Intelligence", component: "Good", awarded: 50, max: 100 },
        ],
      },
      50,
    )!;
    expect(Number.isFinite(ledger.computed)).toBe(true);
    expect(ledger.pillars[0].items).toHaveLength(1);
  });

  it("awards no deduction for a perfect pillar", () => {
    const ledger = buildLedger(
      { breakdown: [{ pillar: "Resume Match", component: "All", awarded: 30, max: 30 }] },
      100,
    )!;
    expect(ledger.pillars[0].lost).toBe(0);
    expect(ledger.totalLost).toBe(0);
  });
});
