import { describe, expect, it } from "vitest";

import { evaluateVisaLanguage } from "@/features/prequalification/visa";
import { lookupAffinity, lookupWatchlist } from "@/features/companies/lookup";
import { prequalify } from "@/features/prequalification/engine";

/**
 * JSV2S1156. The REMOVE / REVIEW / KEEP cases are §25 of the owner's
 * specification, used verbatim so the implementation is tested against what was
 * asked for rather than against what was built.
 *
 * The cases after those are ours, and they are the ones that matter: every one
 * is a way this filter could quietly destroy the intake.
 */

const verdict = (jd: string) => evaluateVisaLanguage(jd).category;

describe("visa language — REMOVE", () => {
  it.each([
    "We are unable to offer visa sponsorship for this position.",
    "Visa sponsorship is not available.",
    "We do not provide visa sponsorship.",
    "The company cannot sponsor work visas.",
    "Applicants must have the right to work in the UK without requiring sponsorship.",
    "Candidates must not require sponsorship now or in the future.",
    "This role is not eligible for Skilled Worker sponsorship.",
  ])("removes: %s", (jd) => {
    expect(verdict(jd)).toBe("remove");
  });

  it("names the rule and quotes the sentence it rejected on", () => {
    const r = evaluateVisaLanguage(
      "About us. We build payments. Please note that we are unable to offer visa sponsorship for this position. Apply today.",
    );
    expect(r.category).toBe("remove");
    expect(r.reasonCode).toBe("EXPLICIT_NO_SPONSORSHIP");
    expect(r.evidence[0].text).toContain("unable to offer visa sponsorship");
    // The whole JD is never dumped as evidence — only the sentence that decided.
    expect(r.evidence[0].text).not.toContain("Apply today");
  });

  it("catches a refusal no phrase list anticipated, by proximity", () => {
    // §17. The wording is the spec's own example.
    expect(
      verdict(
        "We are currently unable, due to company policy, to offer any form of visa sponsorship to applicants.",
      ),
    ).toBe("remove");
  });
});

describe("visa language — KEEP", () => {
  it.each([
    "We can sponsor your Skilled Worker visa.",
    "Visa sponsorship is available to eligible candidates.",
    "We offer visa sponsorship for this position.",
    "Employer sponsorship available.",
  ])("keeps: %s", (jd) => {
    expect(verdict(jd)).toBe("keep");
  });
});

describe("visa language — REVIEW", () => {
  it.each([
    "Candidates must have the right to work in the UK.",
    "Eligible candidates must already have the right to work in the UK.",
    "Candidates must be based in London.",
    "UK residents preferred.",
    "Visa sponsorship may be available for eligible candidates.",
    "Sponsorship considered on a case-by-case basis.",
  ])("reviews: %s", (jd) => {
    expect(verdict(jd)).toBe("review");
  });
});

/**
 * The failure mode this filter exists to avoid.
 *
 * Silence is the majority case in London, Amsterdam and Berlin. If it did not
 * pass, the gate would reject nearly the whole intake on its first night — the
 * Axon rejection, one filter over and several hundred times larger.
 */
describe("silence and boilerplate pass the gate", () => {
  it("passes a posting that says nothing about visas", () => {
    const r = evaluateVisaLanguage(
      "Senior Product Manager, Payments. You will own the acquiring roadmap and work with schemes and PSPs.",
    );
    expect(r.category).toBe("review");
    expect(r.reasonCode).toBe("UNKNOWN");
    expect(r.status).toBe("pass");
  });

  it("passes generic right-to-work boilerplate, and says that is what it is", () => {
    const r = evaluateVisaLanguage("You must have the right to work in the United Kingdom.");
    expect(r.status).toBe("pass");
    expect(r.genericTerms).toContain("right to work");
  });

  it("holds a substantive but ambiguous statement for a human", () => {
    const r = evaluateVisaLanguage("Local candidates only, please.");
    expect(r.category).toBe("review");
    expect(r.status).toBe("unknown");
  });

  it("never removes on the bare word visa", () => {
    expect(verdict("Visa and Mastercard scheme experience is essential.")).not.toBe("remove");
  });

  it("never removes on a bare work permit mention", () => {
    expect(verdict("We will help with your work permit paperwork.")).not.toBe("remove");
  });
});

describe("contradictions go to review, not to removal", () => {
  it("reviews a posting that both offers and refuses", () => {
    const r = evaluateVisaLanguage(
      "Visa sponsorship may be available. Applicants requiring visa sponsorship will not be considered.",
    );
    expect(r.category).toBe("review");
    expect(r.reasonCode).toBe("CONTRADICTORY");
  });
});

describe("Gulf vocabulary", () => {
  it("reviews rather than removes on NOC and transferable-visa language", () => {
    expect(verdict("Candidates must hold a transferable visa with NOC.")).toBe("review");
  });

  it("removes where the role is reserved for UAE nationals", () => {
    expect(verdict("This opportunity is open to UAE nationals only.")).toBe("remove");
  });

  it("does not remove on a general Emiratisation commitment", () => {
    expect(
      verdict("We are proud of our Emiratisation programme and hire across the region."),
    ).not.toBe("remove");
  });
});

describe("company lists", () => {
  it("matches a watchlist company through legal-form noise", () => {
    expect(lookupWatchlist("Adyen N.V.")?.tier).toBe(5);
    expect(lookupWatchlist("Wise Ltd")?.name).toBe("Wise");
  });

  it("grades who may skip scoring", () => {
    expect(lookupWatchlist("Adyen")?.skipsScoring).toBe(true);
    // Tier 3 still becomes an application — it just gets scored.
    expect(lookupWatchlist("bunq")?.skipsScoring).toBe(false);
  });

  it("keeps Visa and Mastercard off the watchlist", () => {
    expect(lookupWatchlist("Visa")).toBeNull();
    expect(lookupWatchlist("Mastercard")).toBeNull();
  });

  it("separates payments-core from a payments arm", () => {
    expect(lookupAffinity("Adyen")?.domainOutcome).toBe("pass");
    expect(lookupAffinity("Booking.com")?.domainOutcome).toBe("unknown");
  });

  it("returns nothing for an unlisted company", () => {
    expect(lookupAffinity("Some Unlisted GmbH")).toBeNull();
    expect(lookupWatchlist("Some Unlisted GmbH")).toBeNull();
  });
});

describe("the gate as a whole", () => {
  const job = (over: Partial<Parameters<typeof prequalify>[0]> = {}) => ({
    title: "Senior Product Manager, Payments",
    company: "Some Unlisted GmbH",
    location: "London, United Kingdom",
    country: "United Kingdom",
    description:
      "You will own the acquiring roadmap, working with PSPs, card schemes, settlement and chargebacks. 7-10 years of product experience.",
    ...over,
  });

  it("rejects when the posting refuses sponsorship, naming the visa filter", () => {
    const r = prequalify(
      job({
        description: `${job().description} We are unable to offer visa sponsorship for this position.`,
      }),
    );
    expect(r.decision).toBe("reject");
    expect(r.decidedBy).toBe("visa");
    expect(r.visa.evidence[0].text).toContain("unable to offer visa sponsorship");
  });

  it("passes a posting that is simply silent about visas", () => {
    expect(prequalify(job()).decision).toBe("pass");
  });

  /**
   * JSV2S1167. Without this, a generic title at a payments company is rejected
   * on domain and never seen again — the exact jobs worth most.
   */
  it("admits a generic posting at a payments-core company", () => {
    const generic = job({
      company: "Adyen",
      title: "Senior Product Manager",
      description: "You will lead a product team and own a roadmap. 7-10 years experience.",
    });
    const r = prequalify(generic);
    expect(r.domain.rawStatus).toBe("fail");
    expect(r.domain.status).toBe("pass");
    expect(r.domain.affinity?.name).toBe("Adyen");
    expect(r.decision).toBe("pass");
  });

  it("holds the same posting for a read at a company with only a payments arm", () => {
    const r = prequalify(
      job({
        company: "Booking.com",
        title: "Senior Product Manager",
        description: "You will lead a product team and own a roadmap. 7-10 years experience.",
      }),
    );
    expect(r.domain.status).toBe("unknown");
    expect(r.decision).toBe("review");
  });

  it("rejects a generic posting at a company on neither list", () => {
    const r = prequalify(
      job({
        title: "Senior Product Manager",
        description: "You will lead a product team and own a roadmap. 7-10 years experience.",
      }),
    );
    expect(r.domain.status).toBe("fail");
    expect(r.decision).toBe("reject");
    expect(r.decidedBy).toBe("domain");
  });

  /** The affinity override is scoped to domain — it is not a gate bypass. */
  it("still rejects a payments-core company in a non-target country", () => {
    const r = prequalify(
      job({
        company: "Adyen",
        title: "Senior Product Manager",
        description: "You will lead a product team. 7-10 years experience.",
        location: "Austin, Texas",
        country: "United States",
      }),
    );
    expect(r.decision).toBe("reject");
    expect(r.decidedBy).toBe("location");
  });

  it("records the watchlist without letting it decide anything", () => {
    const r = prequalify(job({ company: "Adyen" }));
    expect(r.watchlist?.skipsScoring).toBe(true);
    // A watchlist miss changes no verdict.
    expect(prequalify(job()).decision).toBe("pass");
    expect(prequalify(job()).watchlist).toBeNull();
  });
});
