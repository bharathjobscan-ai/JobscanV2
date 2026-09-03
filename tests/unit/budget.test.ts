import { describe, expect, it } from "vitest";

import { budgetStatus, totalCost, type PricedRun } from "@/features/ai/budget";

const CEILING = { dailyUsd: 3, monthlyUsd: 50 };

/** Sonnet 5 is $2/M in, $10/M out — 1M of each is exactly $12. */
const run = (inTok: number, outTok: number, model = "claude-sonnet-5"): PricedRun => ({
  model,
  usage: {
    inputTokens: inTok,
    outputTokens: outTok,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
});

/** ~$0.12 — roughly a real grounded scoring run. */
const scoreRun = () => run(50_000, 2_000);

describe("totalCost", () => {
  it("sums measured runs", () => {
    expect(totalCost([run(1_000_000, 1_000_000)])).toBeCloseTo(12, 6);
  });

  it("ignores runs with no usage rather than guessing", () => {
    expect(totalCost([{ model: "claude-sonnet-5", usage: null }])).toBe(0);
  });

  it("ignores an unrated model rather than inventing a price", () => {
    expect(totalCost([run(1_000_000, 1_000_000, "some-future-model")])).toBe(0);
  });
});

describe("budgetStatus", () => {
  it("allows spending below both ceilings", () => {
    const status = budgetStatus([scoreRun()], [scoreRun()], CEILING);
    expect(status.blocked).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.day.remainingUsd).toBeGreaterThan(0);
  });

  /**
   * The property the ceiling exists for: it must block *before* the call that
   * would cross it, not report afterwards.
   */
  it("blocks once the daily ceiling is reached", () => {
    const today = Array.from({ length: 30 }, scoreRun); // ~$3.60
    const status = budgetStatus(today, today, CEILING);

    expect(status.blocked).toBe(true);
    expect(status.day.exhausted).toBe(true);
    expect(status.reason).toMatch(/[Dd]aily/);
    expect(status.day.remainingUsd).toBe(0);
  });

  it("blocks on the monthly ceiling even when the day is clear", () => {
    const month = Array.from({ length: 500 }, scoreRun); // ~$60
    const status = budgetStatus([], month, CEILING);

    expect(status.blocked).toBe(true);
    expect(status.month.exhausted).toBe(true);
    expect(status.reason).toMatch(/[Mm]onthly/);
  });

  it("reports the daily reason first when both are exhausted", () => {
    const many = Array.from({ length: 500 }, scoreRun);
    expect(budgetStatus(many, many, CEILING).reason).toMatch(/[Dd]aily/);
  });

  it("treats exactly-at-ceiling as exhausted", () => {
    // $3.00 exactly: 250k in ($0.50) + 250k out ($2.50).
    const status = budgetStatus([run(250_000, 250_000)], [], CEILING);
    expect(status.day.spentUsd).toBeCloseTo(3, 6);
    expect(status.blocked).toBe(true);
  });

  it("says nothing is spent when nothing has run", () => {
    const status = budgetStatus([], [], CEILING);
    expect(status.day.spentUsd).toBe(0);
    expect(status.day.remainingUsd).toBe(CEILING.dailyUsd);
    expect(status.blocked).toBe(false);
  });

  it("explains what happens to deferred work, not just that it stopped", () => {
    const today = Array.from({ length: 30 }, scoreRun);
    expect(budgetStatus(today, today, CEILING).reason).toMatch(/next run/i);
  });
});
