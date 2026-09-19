import { describe, expect, it } from "vitest";

import { billableGroundedRunIds, groundingUsage,
  shouldGroundScoring,
} from "@/features/ai/grounding";
import { GROUNDING_COST_PER_REQUEST, GROUNDING_FREE_PER_MONTH } from "@/lib/ai/pricing";

/**
 * JSV2S1131. Grounding is the one cost that is not a function of tokens: it
 * bills per request against a shared monthly allowance, which is why the
 * per-application total deliberately excludes it and why this counter exists.
 */
describe("groundingUsage", () => {
  it("costs nothing inside the allowance", () => {
    const usage = groundingUsage(1200);
    expect(usage.billable).toBe(0);
    expect(usage.billableUsd).toBe(0);
    expect(usage.marginalUsd).toBe(0);
    expect(usage.remaining).toBe(GROUNDING_FREE_PER_MONTH - 1200);
  });

  it("warns at 80%, early enough to act before the cliff", () => {
    expect(groundingUsage(GROUNDING_FREE_PER_MONTH * 0.79).warn).toBe(false);
    expect(groundingUsage(GROUNDING_FREE_PER_MONTH * 0.8).warn).toBe(true);
  });

  it("prices the NEXT request once the allowance is gone", () => {
    // The number that makes "should scoring stay grounded?" answerable: inside
    // the allowance the marginal cost is genuinely zero, outside it is not.
    expect(groundingUsage(GROUNDING_FREE_PER_MONTH - 1).marginalUsd).toBe(0);
    expect(groundingUsage(GROUNDING_FREE_PER_MONTH).marginalUsd).toBe(
      GROUNDING_COST_PER_REQUEST,
    );
  });

  it("bills only the overflow, never the whole month", () => {
    const usage = groundingUsage(GROUNDING_FREE_PER_MONTH + 1000);
    expect(usage.billable).toBe(1000);
    expect(usage.billableUsd).toBeCloseTo(1000 * GROUNDING_COST_PER_REQUEST, 6);
    expect(usage.exhausted).toBe(true);
  });

  it("caps the display ratio at 1 rather than overflowing the bar", () => {
    expect(groundingUsage(GROUNDING_FREE_PER_MONTH * 3).ratio).toBe(1);
  });

  it("treats a negative or fractional count as zero-safe", () => {
    expect(groundingUsage(-5).used).toBe(0);
    expect(groundingUsage(10.7).used).toBe(10);
  });
});

/**
 * Billability is a property of a run's POSITION in the month, not the run —
 * the same application costs differently in a month where it lands past 5,000.
 */
describe("billableGroundedRunIds", () => {
  const run = (id: string, minutes: number) => ({
    id,
    finishedAt: new Date(2026, 8, 1, 0, minutes),
  });

  it("bills nothing while the month is inside the allowance", () => {
    const runs = Array.from({ length: 10 }, (_, i) => run(`r${i}`, i));
    expect(billableGroundedRunIds(runs).size).toBe(0);
  });

  it("bills only the requests past the allowance, in time order", () => {
    const runs = Array.from({ length: GROUNDING_FREE_PER_MONTH + 3 }, (_, i) =>
      run(`r${i}`, i),
    );
    const billable = billableGroundedRunIds(runs);

    expect(billable.size).toBe(3);
    // The LAST three chronologically are the ones that cost money.
    expect(billable.has(`r${GROUNDING_FREE_PER_MONTH}`)).toBe(true);
    expect(billable.has("r0")).toBe(false);
  });

  it("orders by finish time, not by the order rows came back", () => {
    const runs = [
      run("late", 5000),
      ...Array.from({ length: GROUNDING_FREE_PER_MONTH }, (_, i) => run(`r${i}`, i)),
    ];
    // "late" is first in the array but last in time, so it is the billable one.
    expect([...billableGroundedRunIds(runs)]).toEqual(["late"]);
  });

  it("sorts a run with no finish time last — billed only if the allowance is gone", () => {
    const inside = billableGroundedRunIds([{ id: "x", finishedAt: null }]);
    expect(inside.size).toBe(0);

    const past = billableGroundedRunIds([
      ...Array.from({ length: GROUNDING_FREE_PER_MONTH }, (_, i) => run(`r${i}`, i)),
      { id: "x", finishedAt: null },
    ]);
    expect([...past]).toEqual(["x"]);
  });
});

/**
 * JSV2S1146. Grounding is the one cost that is not a function of tokens, and
 * this is the switch that decides whether a run pays it.
 */
describe("grounding is skipped only where the register is local", () => {
  it("skips the search for UK postings, in every spelling", () => {
    for (const c of ["United Kingdom", "uk", "England", "  Scotland  ", "GB"]) {
      expect(shouldGroundScoring(c)).toBe(false);
    }
  });

  it("keeps the search everywhere without a local register", () => {
    for (const c of ["Netherlands", "Germany", "United Arab Emirates", "Ireland", "Portugal", "Luxembourg"]) {
      expect(shouldGroundScoring(c)).toBe(true);
    }
  });

  /**
   * Errs towards grounding ON. A missing country is a badly-formatted posting
   * far more often than a UK one, and scoring a non-UK job with neither a
   * register nor a search leaves half the score resting on nothing.
   */
  it("grounds when the country is unknown", () => {
    expect(shouldGroundScoring(null)).toBe(true);
    expect(shouldGroundScoring(undefined)).toBe(true);
    expect(shouldGroundScoring("")).toBe(true);
  });
});
