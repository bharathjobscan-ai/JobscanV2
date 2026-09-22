import { describe, expect, it } from "vitest";

import { DUPLICATE_TASK_WINDOW_MS } from "@/lib/config/constants";

/**
 * JSV2S1174, from a real duplicate on 2026-09-23: Generate CV + CL ran twice,
 * three minutes apart, and cost $0.2577 the second time.
 */
describe("the duplicate-task window", () => {
  /**
   * The existing in-flight check could not have caught it. Providers run
   * inline and synchronously (ADR-0005), so a task never sits in `queued` —
   * it goes from nothing to `succeeded`, and a guard looking for a running row
   * has nothing to see. The window looks at what FINISHED instead.
   */
  it("covers the gap the real duplicate fell through", () => {
    const realGapMs = 3 * 60 * 1000 + 16 * 1000;
    expect(DUPLICATE_TASK_WINDOW_MS).toBeGreaterThan(realGapMs);
  });

  it("is short enough that a deliberate retry is only a wait away", () => {
    expect(DUPLICATE_TASK_WINDOW_MS).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});
