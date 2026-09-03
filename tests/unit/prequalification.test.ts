import { describe, expect, it } from "vitest";

import { prequalify } from "@/features/prequalification/engine";
import { evaluateDomain } from "@/features/prequalification/domain";
import { evaluateExperience, extractExperience } from "@/features/prequalification/experience";
import { evaluateLocation } from "@/features/prequalification/location";
import { evaluateRole } from "@/features/prequalification/role";
import { splitSections } from "@/features/prequalification/sections";
import type { PrequalJob } from "@/features/prequalification/types";

const PAYMENTS_JD = `
About the role
You will own the payment orchestration and settlement platform.

Responsibilities
- Own payment orchestration and settlement
- Drive merchant onboarding

Requirements
- 7-10 years of experience in product management
`;

function job(over: Partial<PrequalJob> = {}): PrequalJob {
  return {
    title: "Senior Product Manager, Payments",
    company: "Acme",
    location: "London, United Kingdom",
    description: PAYMENTS_JD,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// PRD §15 — Role
// ---------------------------------------------------------------------------

describe("role filter", () => {
  it("passes a target role", () => {
    expect(evaluateRole("Senior Product Manager - Payments").status).toBe("pass");
  });

  it("fails an excluded role even when the domain is right", () => {
    const result = evaluateRole("Senior Program Manager - Payments");
    expect(result.status).toBe("fail");
    expect(result.rule).toBe("EXCLUDED_ROLE");
  });

  it("fails Product Marketing Manager, which is not a Product Manager", () => {
    expect(evaluateRole("Product Marketing Manager - Payments").status).toBe("fail");
  });

  it("returns unknown for an unrecognised title rather than rejecting", () => {
    // Non-English postings from Berlin, Paris and Lisboa land here.
    const result = evaluateRole("Produktmanager Zahlungsverkehr");
    expect(result.status).toBe("unknown");
    expect(result.rule).toBe("NO_MATCH");
  });

  /** Decided 2026-09-04: a junior title is a contradicting signal, not a gap. */
  it("fails junior titles that contain a target role as a substring", () => {
    for (const title of [
      "Associate Product Manager",
      "APM, Payments",
      "Junior Product Manager - Payments",
      "Graduate Product Manager",
    ]) {
      const result = evaluateRole(title);
      expect(result.status, title).toBe("fail");
      expect(result.rule, title).toBe("JUNIOR_ROLE");
    }
  });

  /** Product Lead is an alias onto Lead Product Manager, not a new entry. */
  it("resolves the Product Lead family onto Lead Product Manager", () => {
    for (const title of [
      "Product Lead - Business Payments",
      "Product Lead, Payments",
      "Lead PM - Payments",
    ]) {
      const result = evaluateRole(title);
      expect(result.status, title).toBe("pass");
      expect(result.matchedRole, title).toBe("lead product manager");
    }
  });

  it("normalises abbreviations and level suffixes", () => {
    expect(evaluateRole("Sr. Product Manager").matchedRole).toBe("senior product manager");
    expect(evaluateRole("Senior Product Manager II").status).toBe("pass");
    expect(evaluateRole("Senior PM, Payments").status).toBe("pass");
  });

  it("records which tier matched", () => {
    expect(evaluateRole("Technical Product Manager").tier).toBe("adjacent");
    expect(evaluateRole("Product Owner").tier).toBe("acceptable");
    expect(evaluateRole("Principal Product Manager").tier).toBe("primary");
  });

  it("reads the title head, so a domain qualifier cannot exclude a good role", () => {
    // "Sales" is excluded, but here it describes the product area, not the job.
    expect(evaluateRole("Senior Product Manager, Sales Platform").status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// PRD §15 — Domain
// ---------------------------------------------------------------------------

describe("domain filter", () => {
  const forTitle = (title: string, description = "") =>
    evaluateDomain(title, splitSections(description));

  it("passes on a Tier-1 title alone", () => {
    expect(forTitle("Senior PM - Payments").status).toBe("pass");
    expect(forTitle("Senior PM - Payment Processing").status).toBe("pass");
  });

  /**
   * The PRD's own test case that could not pass: every fraud keyword was a
   * two-word phrase, so "Fraud & Risk" matched none of them and scored zero.
   */
  it("passes Fraud & Risk, which the source taxonomy could not match", () => {
    const result = forTitle("Senior PM - Fraud & Risk");
    expect(result.status).toBe("pass");
    expect(result.matchedTerms).toContain("fraud");
  });

  it("rejects an unrelated domain", () => {
    expect(forTitle("Senior PM - HR Platform").status).toBe("fail");
  });

  it("does not pass on an incidental mention in a nice-to-have", () => {
    const result = forTitle(
      "Senior Product Manager - SaaS Analytics",
      `Responsibilities\nBuild analytics and reporting products.\n\nNice to have\nPayments experience is a plus.`,
    );
    expect(result.status).not.toBe("pass");
  });

  /**
   * The single worst false positive in the source taxonomy: "Visa" was a
   * Tier-1 payments keyword, and this application searches for jobs offering
   * visa sponsorship.
   */
  it("does not score visa-sponsorship boilerplate as a payments signal", () => {
    const result = forTitle(
      "Senior Product Manager - Analytics",
      `About us\nWe are a global team and offer visa sponsorship for the right candidate.\nSkilled Worker visa applications are welcome.`,
    );
    expect(result.matchedTerms).not.toContain("visa");
    expect(result.status).toBe("fail");
    expect(result.suppressed.some((s) => s.term === "visa")).toBe(true);
  });

  it("still counts Visa when it means the card network", () => {
    const result = forTitle(
      "Senior Product Manager",
      `Responsibilities\nManage Visa and Mastercard scheme rules and interchange.`,
    );
    expect(result.matchedTerms).toContain("visa");
  });

  it("counts a section once, so repetition cannot inflate a score", () => {
    const once = forTitle("Product Manager", "Responsibilities\nOwn settlement.");
    const many = forTitle(
      "Product Manager",
      "Responsibilities\nOwn settlement, payouts, chargebacks, tokenization and merchant onboarding.",
    );
    expect(many.score).toBe(once.score);
  });

  it("weights a Tier-3 match below a Tier-1 one", () => {
    const tier1 = forTitle("Senior PM - Payments");
    const tier3 = forTitle("Senior PM - Crypto");
    expect(tier3.score).toBeLessThan(tier1.score);
    expect(tier3.status).not.toBe("pass");
  });

  it("matches on word boundaries, not substrings", () => {
    // "sca" inside "Scandinavia" must not read as Strong Customer Authentication.
    const result = forTitle("Product Manager", "About us\nWe are the largest team in Scandinavia.");
    expect(result.matchedTerms).not.toContain("sca");
  });
});

// ---------------------------------------------------------------------------
// PRD §15 — Experience
// ---------------------------------------------------------------------------

describe("experience filter", () => {
  it("passes a range around the candidate", () => {
    expect(evaluateExperience("7-10 years of experience required").status).toBe("pass");
  });

  it("passes an open-ended minimum below the candidate", () => {
    expect(evaluateExperience("5+ years of experience").status).toBe("pass");
  });

  it("fails a requirement above the ceiling", () => {
    expect(evaluateExperience("12+ years of experience").status).toBe("fail");
    expect(evaluateExperience("15+ years of experience").status).toBe("fail");
  });

  /** Decided 2026-09-04: silence is not evidence against the candidate. */
  it("passes when no requirement is stated, but records that it was absent", () => {
    const result = evaluateExperience("We are looking for a great product person.");
    expect(result.status).toBe("pass");
    expect(result.rule).toBe("NOT_STATED");
  });

  /** The over-qualification hole: acceptable_min was declared and never used. */
  it("fails a role pitched below the seniority floor", () => {
    const result = evaluateExperience("2+ years of experience in product");
    expect(result.status).toBe("fail");
    expect(result.rule).toBe("BELOW_FLOOR");
  });

  it("parses en-dash ranges, which is what LinkedIn emits", () => {
    expect(extractExperience("3–5 years' experience")).toMatchObject({ min: 3, max: 5 });
  });

  it("parses written numerals and possessives", () => {
    expect(extractExperience("at least five years of experience")).toMatchObject({ min: 5 });
    expect(extractExperience("8 years' experience")).toMatchObject({ min: 8 });
  });

  /** A bare `\d+ years` regex would read a requirement out of company blurb. */
  it("ignores years that are not an experience requirement", () => {
    expect(extractExperience("Founded 10 years ago, we have seen 5 years of growth.")).toBeNull();
  });

  it("takes the lowest stated minimum when a JD gives several", () => {
    const found = extractExperience("8+ years of experience in product, 3+ years experience in payments");
    expect(found?.min).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// PRD §15 — Location
// ---------------------------------------------------------------------------

describe("location filter", () => {
  it("passes target cities and countries", () => {
    expect(evaluateLocation("London", "United Kingdom").status).toBe("pass");
    expect(evaluateLocation("Amsterdam, Netherlands", null).status).toBe("pass");
    expect(evaluateLocation("Dubai, UAE", null).status).toBe("pass");
  });

  it("fails an explicit non-target country", () => {
    expect(evaluateLocation("New York, USA", null).status).toBe("fail");
  });

  it("passes remote with an identifiable target country", () => {
    expect(evaluateLocation("Remote - Germany", null).status).toBe("pass");
  });

  it("passes Remote - Europe, which names no country", () => {
    const result = evaluateLocation("Remote - Europe", null);
    expect(result.status).toBe("pass");
    expect(result.isRemote).toBe(true);
  });

  it("returns unknown for remote with no geography", () => {
    const result = evaluateLocation("Remote", null);
    expect(result.status).toBe("unknown");
  });

  it("returns unknown when no location is given", () => {
    expect(evaluateLocation(null, null).status).toBe("unknown");
  });

  /** Portugal was missing from the source EU list while Lisboa is preferred. */
  it("passes Lisbon, which the source config would have rejected", () => {
    const result = evaluateLocation("Lisbon, Portugal", null);
    expect(result.status).toBe("pass");
    expect(result.preferredCity).toBe("Lisboa");
  });

  it("flags every preferred city, in either spelling", () => {
    expect(evaluateLocation("Lisboa", null).preferredCity).toBe("Lisboa");
    expect(evaluateLocation("Abu Dhabi, United Arab Emirates", null).preferredCity).toBe("Abu Dhabi");
    expect(evaluateLocation("Stockholm, Sweden", null).preferredCity).toBe("Stockholm");
  });

  it("does not flag a non-preferred city in a target country", () => {
    const result = evaluateLocation("Frankfurt, Germany", null);
    expect(result.status).toBe("pass");
    expect(result.preferredCity).toBeNull();
  });

  it("resolves the payments jurisdictions the source list omitted", () => {
    for (const place of ["Tallinn, Estonia", "Vilnius, Lithuania", "Luxembourg"]) {
      expect(evaluateLocation(place, null).status, place).toBe("pass");
    }
  });

  /** An explicit country outranks a bare city: Dublin is also in Ohio. */
  it("does not pass an ambiguous city when the country contradicts it", () => {
    const result = evaluateLocation("Dublin, Ohio, United States", null);
    expect(result.status).toBe("fail");
    expect(result.preferredCity).toBeNull();
  });

  it("passes a multi-location posting when any location is on target", () => {
    expect(evaluateLocation("London, Berlin or New York", null).status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

describe("section splitter", () => {
  it("splits on recognised headings", () => {
    const ids = splitSections(PAYMENTS_JD).map((s) => s.id);
    expect(ids).toContain("responsibilities");
    expect(ids).toContain("requirements");
  });

  it("recognises informal headings", () => {
    const ids = splitSections(
      "What you'll do:\nOwn payments.\n\nWhat we're looking for:\n7+ years.",
    ).map((s) => s.id);
    expect(ids).toContain("responsibilities");
    expect(ids).toContain("requirements");
  });

  it("separates nice-to-have from requirements", () => {
    const ids = splitSections("Requirements\n7 years.\n\nNice to have\nPayments.").map((s) => s.id);
    expect(ids).toContain("nice_to_have");
  });

  /** Roughly half of scraped postings arrive as one unstructured blob. */
  it("falls back to a single body section when nothing is detectable", () => {
    const sections = splitSections(
      "We are hiring a product manager to own payment orchestration and settlement across our platform.",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("body");
  });

  it("returns nothing for an empty description", () => {
    expect(splitSections(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PRD §15 — Combined
// ---------------------------------------------------------------------------

describe("prequalify", () => {
  it("passes when all four filters pass", () => {
    const result = prequalify(job());
    expect(result.decision).toBe("pass");
    expect(result.decidedBy).toBeNull();
  });

  it("rejects on a single failing filter, naming it", () => {
    const result = prequalify(job({ title: "Senior Program Manager, Payments" }));
    expect(result.decision).toBe("reject");
    expect(result.decidedBy).toBe("role");
    expect(result.reason).toContain("excluded");
  });

  it("reviews when a filter is unknown rather than failing", () => {
    const result = prequalify(job({ location: null, country: null }));
    expect(result.decision).toBe("review");
    expect(result.decidedBy).toBe("location");
  });

  it("does not reject a job with no description", () => {
    // Domain cannot be established without a description, so it holds at
    // review rather than failing — an incomplete posting is not a bad one.
    const result = prequalify(job({ description: null, title: "Senior Product Manager, Payments" }));
    expect(result.decision).not.toBe("reject");
  });

  it("carries the config version so stale verdicts are findable", () => {
    expect(prequalify(job()).configVersion).toMatch(/^[0-9a-f]{12}$/);
  });

  it("is deterministic — same input, same verdict", () => {
    const a = prequalify(job());
    const b = prequalify(job());
    expect({ ...a, evaluatedAt: null }).toEqual({ ...b, evaluatedAt: null });
  });

  it("passes the Wise-style Product Lead role end to end", () => {
    const result = prequalify(
      job({ title: "Product Lead - Business Payments", location: "London, United Kingdom" }),
    );
    expect(result.decision).toBe("pass");
    expect(result.location.preferredCity).toBe("London");
  });
});
