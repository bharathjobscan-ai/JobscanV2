import { describe, expect, it } from "vitest";

import { isRetryable, isSpendCapError } from "@/features/ingestion/reliability";

/**
 * JSV2S1148, found live 2026-09-21: Gemini refused a manual score with a 429
 * and `status: "RESOURCE_EXHAUSTED"`, and the app retried it three times.
 */
describe("a provider spend cap is not a transient error", () => {
  it("recognises the cap however the provider words it", () => {
    for (const message of [
      "Your project has exceeded its monthly spending cap.",
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
      "You exceeded your current quota, please check your plan and billing details.",
      "Billing is required to use this model.",
    ]) {
      expect(isSpendCapError(new Error(message))).toBe(true);
      expect(isRetryable(new Error(message))).toBe(false);
    }
  });

  /**
   * The string status is the whole trap. `Number("RESOURCE_EXHAUSTED")` is NaN,
   * which failed the numeric branch and fell through to "cannot classify, so
   * retry" — so the cap was retried by accident rather than by decision.
   */
  it("is not fooled by a non-numeric status", () => {
    const err = Object.assign(new Error("exceeded its monthly spending cap"), {
      status: "RESOURCE_EXHAUSTED",
    });
    expect(isRetryable(err)).toBe(false);
  });

  it("still retries an ordinary rate limit", () => {
    const rateLimited = Object.assign(new Error("Too Many Requests"), { status: 429 });
    expect(isSpendCapError(rateLimited)).toBe(false);
    expect(isRetryable(rateLimited)).toBe(true);
  });
});
