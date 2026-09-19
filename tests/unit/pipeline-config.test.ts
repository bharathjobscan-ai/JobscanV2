import { describe, expect, it } from "vitest";

import {
  FETCH_DAILY_BUDGET_USD,
  FETCH_DEFAULTS,
  FETCH_LOCATIONS,
  dailyFetchPlan,
  estimatedFetchCostUsd,
  fetchWithinBudget,
} from "@/config/pipeline";

/**
 * JSV2S1161. The per-location cap is what the owner asked for, and it is also
 * the shape that lets the bill grow without anyone noticing — a ninth location
 * is one line in an array and $0.08 a night. These tests are the noticing.
 */
describe("daily fetch plan", () => {
  it("fetches every location at its own cap", () => {
    const plan = dailyFetchPlan();
    expect(plan).toHaveLength(FETCH_LOCATIONS.length);
    for (const p of plan) {
      expect(p.locations).toHaveLength(1);
      expect(p.limit).toBe(FETCH_DEFAULTS.limitPerLocation);
      expect(p.postedWithinDays).toBe(1);
    }
    // One call per location: the actor takes a single location string, so a
    // grouped run is not expressible and must not be silently attempted.
    expect(new Set(plan.map((p) => p.locations?.[0])).size).toBe(FETCH_LOCATIONS.length);
  });

  it("stays inside the stated daily budget", () => {
    expect(estimatedFetchCostUsd()).toBeCloseTo(0.648, 3);
    expect(fetchWithinBudget()).toBe(true);
    expect(estimatedFetchCostUsd()).toBeLessThanOrEqual(FETCH_DAILY_BUDGET_USD);
  });

  it("refuses a configuration that would breach the budget", () => {
    // 16 locations at 200 is $1.30 a night — the case this guard exists for.
    expect(fetchWithinBudget(16, 200)).toBe(false);
  });
});
