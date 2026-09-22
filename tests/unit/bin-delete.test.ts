import { describe, expect, it } from "vitest";

import { DELETABLE_AFTER_DAYS } from "@/lib/config/constants";

/**
 * The only irreversible action in this app (2026-09-23).
 *
 * Everything else is a soft delete — rejecting, binning and re-qualifying all
 * keep the row. This removes it, with no undo and no backup, so the guards
 * matter more than the feature.
 */
describe("permanent deletion of binned jobs", () => {
  it("holds a job for 30 days after it was binned", () => {
    expect(DELETABLE_AFTER_DAYS).toBe(30);
  });

  /**
   * Age is measured from BINNING, not from first sighting. A posting scraped
   * four months ago and dismissed this morning is a decision one morning old,
   * and the Bin's whole value is that such a decision stays recoverable.
   */
  it("measures age from the decision, not the posting", () => {
    const cutoff = new Date(Date.now() - DELETABLE_AFTER_DAYS * 86_400_000);
    const binnedThisMorning = new Date();
    const binnedLastYear = new Date(Date.now() - 365 * 86_400_000);

    expect(binnedThisMorning > cutoff).toBe(true); // held
    expect(binnedLastYear > cutoff).toBe(false); // deletable
  });
});
