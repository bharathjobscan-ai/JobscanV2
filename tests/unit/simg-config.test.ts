import { describe, expect, it } from "vitest";

import {
  compositeScore,
  LENS_WEIGHTS,
  TARGET_DOCUMENT_SCORE,
  verdictFor,
} from "@/config/simg";

describe("SimG scoring", () => {
  it("weights sum to 1 — a drift here rescales every historical score", () => {
    const sum = Object.values(LENS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("computes the composite the design shows", () => {
    // The mockup's figures: ATS 82, recruiter 74, hiring manager 68 -> 74.
    expect(compositeScore({ ats: 82, recruiter: 74, hiringManager: 68 })).toBe(74);
  });

  it("derives the verdict from the bar, not from the model", () => {
    expect(verdictFor(TARGET_DOCUMENT_SCORE)).toBe("pass");
    expect(verdictFor(TARGET_DOCUMENT_SCORE - 1)).toBe("borderline");
    expect(verdictFor(TARGET_DOCUMENT_SCORE - 10)).toBe("borderline");
    expect(verdictFor(TARGET_DOCUMENT_SCORE - 11)).toBe("reject");
  });
});
