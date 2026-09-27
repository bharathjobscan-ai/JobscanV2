import { describe, expect, it } from "vitest";

import { fixedScoring, type ScoringFacts } from "@/features/scoring/fixed";
import { finaliseScore } from "@/features/scoring/finalise";

const TODAY = new Date("2026-09-22T12:00:00Z");

const base: ScoringFacts = {
  title: "Senior Product Manager",
  country: "united kingdom",
  preferredCity: "London",
  locationRule: "TARGET_COUNTRY",
  isRemote: false,
  experience: { rule: "WITHIN_RANGE", requiredMin: 5, requiredMax: null },
  visaReasonCode: "UNKNOWN",
  watchlistTier: null,
  sponsorStatus: "none",
  source: "linkedin",
  postedAt: "2026-09-21",
  reachability: null,
  today: TODAY,
};

const points = (f: ScoringFacts, name: string) =>
  fixedScoring(f).fixed.find((l) => l.component === name)?.awarded;

/**
 * Each case reproduces what the model itself awarded on a stored score
 * (2026-09-04 to 2026-09-22). The rules are the skill's; these prove the code
 * reads them the way the model did.
 */
describe("fixedScoring — calibrated against the model's own scores", () => {
  it("scores a fetched city 30 and elsewhere in a target country 18", () => {
    expect(points(base, "Location")).toBe(30);
    expect(points({ ...base, preferredCity: null }, "Location")).toBe(18); // Precoro
    expect(points({ ...base, country: "netherlands", preferredCity: null }, "Location")).toBe(18); // BJAK
    expect(points({ ...base, preferredCity: "Lisboa", country: "portugal" }, "Location")).toBe(30); // Thought Machine
    expect(points({ ...base, isRemote: true, locationRule: "REMOTE_TARGET" }, "Location")).toBe(30); // EML
  });

  it("gives the pathway bonus to the skill's five countries only", () => {
    expect(points(base, "Country Pathway")).toBe(10);
    expect(points({ ...base, country: "portugal" }, "Country Pathway")).toBe(0); // Thought Machine
  });

  it("reads the experience requirement the way the model did", () => {
    const both = (min: number | null, max: number | null) => {
      const f = { ...base, experience: { rule: "WITHIN_RANGE", requiredMin: min, requiredMax: max } };
      return [points(f, "Seniority (Years Asked)"), points(f, "Experience Fit")];
    };
    expect(both(5, null)).toEqual([15, 15]); // Kody, Zapp, Thought Machine
    expect(both(5, 8)).toEqual([15, 15]); // EML
    expect(both(8, null)).toEqual([15, 15]); // 1st Formations
    expect(both(3, 5)).toEqual([10, 10]); // Precoro
    expect(both(10, null)).toEqual([10, 10]); // Trip.com
    expect(both(12, null)).toEqual([5, 10]);
    expect(both(15, null)).toEqual([5, 5]);
  });

  it("leaves experience to the model when the gate could not read it", () => {
    const open = fixedScoring({
      ...base,
      experience: { rule: "NOT_STATED", requiredMin: null, requiredMax: null },
    }).open.map((c) => c.name);
    expect(open).toContain("Seniority (Years Asked)");
    expect(open).toContain("Experience Fit");
  });

  it("scores posting age from the date", () => {
    expect(points(base, "Posting Age")).toBe(5); // Thought Machine, posted the day before
    expect(points({ ...base, postedAt: "2026-09-18" }, "Posting Age")).toBe(0); // BJAK, 4 days
    expect(points({ ...base, postedAt: "2026-09-10" }, "Posting Age")).toBe(-5);
    expect(points({ ...base, postedAt: "2026-08-19" }, "Posting Age")).toBe(-10); // Global Payments
    expect(points({ ...base, postedAt: null }, "Posting Age")).toBe(0);
  });

  it("scores reachability 5 when not provided, which is what the model chose most", () => {
    expect(points(base, "Reachability")).toBe(5);
    expect(points({ ...base, reachability: "referral" }, "Reachability")).toBe(15);
  });

  it("settles the UK evidence tier from the register, and Tier A anywhere", () => {
    expect(points(base, "Evidence Tier")).toBe(5); // Precoro: no register entry
    expect(points({ ...base, sponsorStatus: "confirmed" }, "Evidence Tier")).toBe(20);
    expect(points({ ...base, watchlistTier: 5, country: "portugal" }, "Evidence Tier")).toBe(35);
    expect(
      points({ ...base, visaReasonCode: "EXPLICIT_SPONSORSHIP_AVAILABLE", country: "netherlands" }, "Evidence Tier"),
    ).toBe(35);
  });

  it("leaves the evidence tier to the model outside the UK, where a search can still find a register", () => {
    const r = fixedScoring({ ...base, country: "portugal", sponsorStatus: "confirmed" });
    expect(r.open.map((c) => c.name)).toContain("Evidence Tier");
    expect(r.grounded).toBe(true);
  });

  /**
   * Behavioral Signals exist only in search results, so every exception to
   * searching capped the visa pillar: UK jobs (GoCardless fell 65 → 40 on
   * visa) and watchlist tier 4-5 companies. Owner, 2026-09-25: search everywhere.
   */
  it("searches on every score, in every country, watchlisted or not", () => {
    expect(fixedScoring(base).grounded).toBe(true);
    expect(fixedScoring({ ...base, country: "portugal" }).grounded).toBe(true);
    expect(fixedScoring({ ...base, watchlistTier: 5 }).grounded).toBe(true);
  });

  it("always leaves the judgement components to the model", () => {
    const open = fixedScoring(base).open.map((c) => c.name);
    for (const name of [
      "Company Size / HR Infrastructure",
      "Behavioral Signals",
      "Intent Signals",
      "Domain Match",
      "Functional PM Match",
      "Enterprise Scale",
      "Role Alignment",
    ]) {
      expect(open).toContain(name);
    }
  });
});

describe("finaliseScore", () => {
  /** Thought Machine's stored breakdown, with the fixed part now from code. */
  const tm: ScoringFacts = {
    ...base,
    country: "portugal",
    preferredCity: "Lisboa",
    sponsorStatus: "confirmed",
  };

  it("reproduces a stored score when the model's judgement is unchanged", () => {
    const { fixed } = fixedScoring(tm);
    const r = finaliseScore(fixed, {
      breakdown: [
        { pillar: "Visa Intelligence", component: "Evidence Tier", awarded: 20, max: 35 },
        { pillar: "Visa Intelligence", component: "Company Size / HR Infrastructure", awarded: 10, max: 10 },
        { pillar: "Visa Intelligence", component: "Behavioral Signals", awarded: 13, max: 20 },
        { pillar: "Visa Intelligence", component: "Intent Signals", awarded: 5, max: 20 },
        { pillar: "Resume Match", component: "Domain Match", awarded: 50, max: 50 },
        { pillar: "Resume Match", component: "Functional PM Match", awarded: 30, max: 30 },
        { pillar: "Resume Match", component: "Enterprise Scale", awarded: 5, max: 5 },
        { pillar: "Job Relevance", component: "Role Alignment", awarded: 30, max: 30 },
      ],
    });
    // Stored: (48 x 0.50) + (100 x 0.30) + (80 x 0.20) = 70. Reachability is
    // now 5 where the model gave that run 0, so relevance reads 85.
    expect(r.analysis.finalCalculation).toBe("(48 x 0.50) + (100 x 0.30) + (85 x 0.20) = 71");
    expect(r.score).toBe(71);
    expect(r.overrideReject).toBe(false);
  });

  it("ignores a model's attempt to re-score a fixed component", () => {
    const { fixed } = fixedScoring(base);
    const r = finaliseScore(fixed, {
      breakdown: [{ pillar: "Job Relevance", component: "Location", awarded: 0, max: 30 }],
    });
    expect(r.analysis.breakdown).toContainEqual(expect.objectContaining({ component: "Location", awarded: 30 }));
  });

  it("clamps a component to its own maximum", () => {
    const r = finaliseScore(fixedScoring(base).fixed, {
      breakdown: [{ pillar: "Resume Match", component: "Domain Match", awarded: 60, max: 50 }],
    });
    expect(r.analysis.breakdown).toContainEqual(expect.objectContaining({ component: "Domain Match", awarded: 50 }));
  });

  it("matches the model's looser names and sums sub-lines", () => {
    const r = finaliseScore(fixedScoring(base).fixed, {
      breakdown: [
        { pillar: "Visa", component: "Behavioral Signals - Community Sentiment", awarded: 8, max: 8 },
        { pillar: "Visa", component: "Behavioral Signals - Careers Page", awarded: 2, max: 2 },
      ],
    });
    expect(r.analysis.breakdown).toContainEqual(expect.objectContaining({ component: "Behavioral Signals", awarded: 10 }));
  });

  it("reports an unscored component instead of hiding it", () => {
    const r = finaliseScore(fixedScoring(base).fixed, { breakdown: [] });
    expect(r.analysis.exceptions?.some((e) => e.includes("Domain Match"))).toBe(true);
  });

  it("applies the hard overrides", () => {
    const r = finaliseScore(fixedScoring(base).fixed, {
      breakdown: [{ pillar: "Resume Match", component: "Domain Match", awarded: 5, max: 50 }],
    });
    expect(r.overrideReject).toBe(true);
  });
});
