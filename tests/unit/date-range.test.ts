import { describe, expect, it } from "vitest";

/**
 * JSV2S1153 — the date maths the range picker depends on.
 *
 * Both of these are the classic ways a date filter lies, so they are asserted
 * rather than assumed.
 */
describe("date range semantics", () => {
  it("formats a local date without the UTC day shift", () => {
    // `toISOString()` converts to UTC first, so 1 Jan 00:30 in IST becomes
    // 31 Dec — a whole day wrong for most of the world. Local parts only.
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;

    const justAfterMidnight = new Date(2026, 0, 1, 0, 30);
    expect(iso(justAfterMidnight)).toBe("2026-01-01");

    const lateEvening = new Date(2026, 0, 1, 23, 45);
    expect(iso(lateEvening)).toBe("2026-01-01");
  });

  it("makes the end date inclusive by advancing to the next midnight", () => {
    // A job judged at 14:30 on the end date must be inside the range.
    // Comparing against the end date itself drops everything after midnight.
    const end = new Date("2026-09-17T00:00:00");
    end.setDate(end.getDate() + 1);

    const judgedThatAfternoon = new Date("2026-09-17T14:30:00");
    expect(judgedThatAfternoon < end).toBe(true);

    const judgedNextDay = new Date("2026-09-18T09:00:00");
    expect(judgedNextDay < end).toBe(false);
  });

  it("lays out a Monday-first month grid with the right lead padding", () => {
    // 1 Sep 2026 is a Tuesday, so exactly one blank cell precedes it.
    const first = new Date(2026, 8, 1);
    expect(first.getDay()).toBe(2); // Sunday-indexed: Tuesday
    const lead = (first.getDay() + 6) % 7;
    expect(lead).toBe(1);

    // 1 Mar 2026 is a Sunday — the case that breaks a naive `getDay()` grid,
    // since Sunday must be the LAST column, not the first.
    const march = new Date(2026, 2, 1);
    expect(march.getDay()).toBe(0);
    expect((march.getDay() + 6) % 7).toBe(6);
  });
});
