import { describe, expect, it } from "vitest";

import { measureAts } from "@/features/simg/measure";
import type { SimgEvaluation } from "@/features/simg/types";

const evaluation = {
  baseline: { ats: 70, recruiter: 64, hiringManager: 62 },
  current: {
    ats: { score: 80 },
    recruiter: { score: 74 },
    hiringManager: { score: 68 },
  },
  keywords: {
    mustHaveFound: 8,
    mustHaveTotal: 10,
    missing: ["multi-currency accounts", "transaction banking"],
  },
  recommendations: [],
} as unknown as SimgEvaluation;

const CLEAN_CV = `# Bharath Raghu
bharath@example.com

## Profile
Payments PM across corridors and settlement.
`;

/**
 * JSV2S1145 — a third of the document score is deterministic, so it should be
 * measured rather than taken on the model's word.
 */
describe("measureAts", () => {
  it("counts a previously-missing keyword once an edit supplies it", () => {
    const edited = `${CLEAN_CV}- Launched multi-currency accounts across 14 markets.\n`;
    const m = measureAts(edited, evaluation)!;

    expect(m.recovered).toEqual(["multi-currency accounts"]);
    expect(m.stillMissing).toEqual(["transaction banking"]);
    expect(m.mustHaveFound).toBe(9);
  });

  it("never reports coverage above the total, even if the model miscounted", () => {
    const wrong = {
      ...evaluation,
      keywords: { mustHaveFound: 10, mustHaveTotal: 10, missing: ["transaction banking"] },
    } as unknown as SimgEvaluation;

    const edited = `${CLEAN_CV}- Ran transaction banking integrations.\n`;
    expect(measureAts(edited, wrong)!.mustHaveFound).toBe(10);
  });

  it("respects word boundaries when matching a term", () => {
    // "banking" must not satisfy "transaction banking".
    const edited = `${CLEAN_CV}- Worked in banking.\n`;
    expect(measureAts(edited, evaluation)!.recovered).toEqual([]);
  });

  it("blends parse readiness with coverage, both measured", () => {
    const m = measureAts(CLEAN_CV, evaluation)!;
    // 8 of 10 covered = 80; a clean CV parses at 100. Blend is 90.
    expect(m.parseScore).toBe(100);
    expect(m.lensScore).toBe(90);
  });

  it("reports the delta against SimG's own ATS score", () => {
    const m = measureAts(CLEAN_CV, evaluation)!;
    expect(m.delta).toBe(90 - 80);
  });

  it("returns null rather than inventing a denominator", () => {
    // No must-have total means there is no coverage to measure. Reporting a
    // number here would be arithmetic on a guess.
    const none = { ...evaluation, keywords: undefined } as unknown as SimgEvaluation;
    expect(measureAts(CLEAN_CV, none)).toBeNull();
  });

  it("penalises a CV that has picked up a parse fault", () => {
    const broken = `${CLEAN_CV}\n| Skill | Years |\n| --- | --- |\n| Payments | 9 |\n`;
    const m = measureAts(broken, evaluation)!;
    expect(m.parseScore).toBeLessThan(100);
    expect(m.lensScore).toBeLessThan(90);
  });
});
