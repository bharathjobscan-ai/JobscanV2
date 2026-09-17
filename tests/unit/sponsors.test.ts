import { describe, expect, it } from "vitest";

import { AMBIGUOUS_NAMES, SPONSOR_ALIASES } from "@/config/sponsors/aliases";
import { normaliseCore, normaliseName, tokenise } from "@/features/sponsors/normalise";
import { sponsorPromptBlock, type SponsorMatch } from "@/features/sponsors/prompt";

/**
 * JSV2S1127. The case that drove this: scoring Visa searched "Visa Inc" while
 * the register lists "VISA EUROPE LIMITED", found nothing, and dropped the
 * score 75 → 59 on a company that does in fact sponsor.
 */
describe("normaliseName", () => {
  it("strips the legal form so Ltd and Limited are the same company", () => {
    expect(normaliseName("Monzo Bank Limited")).toBe("MONZO BANK");
    expect(normaliseName("Monzo Bank Ltd.")).toBe("MONZO BANK");
    expect(normaliseName("MONZO BANK LTD")).toBe("MONZO BANK");
  });

  it("folds accents — the register is ASCII and postings are not", () => {
    expect(normaliseName("Société Générale")).toBe("SOCIETE GENERALE");
  });

  it("treats & and 'and' as the same word", () => {
    expect(normaliseName("Marks & Spencer")).toBe(normaliseName("Marks and Spencer"));
  });

  it("drops punctuation that only ever differs by house style", () => {
    expect(normaliseName("O'Neill's (UK) Ltd")).toBe("ONEILLS UK");
  });

  it("closes up a dot rather than splitting on it", () => {
    // "U.K." must become "UK", not "U K" — so "Checkout.com" becomes one token.
    // The brand-to-legal-entity jump is the alias table's job, not the
    // tokeniser's, and SPONSOR_ALIASES carries CHECKOUTCOM for exactly this.
    expect(normaliseName("Checkout.com")).toBe("CHECKOUTCOM");
    expect(normaliseName("U.K. Payments Ltd")).toBe("UK PAYMENTS");
    expect(SPONSOR_ALIASES[normaliseName("Checkout.com")]).toBe("CHECKOUT LTD");
  });

  it("keeps qualifiers — they are only stripped by the fallback key", () => {
    expect(normaliseName("Visa Europe Limited")).toBe("VISA EUROPE");
  });
});

describe("normaliseCore", () => {
  it("strips qualifiers so a posting's brand reaches the legal entity", () => {
    expect(normaliseCore("Visa Europe Limited")).toBe("VISA");
    expect(normaliseCore("Google UK Limited")).toBe("GOOGLE");
    expect(normaliseCore("Amazon UK Services Ltd")).toBe("AMAZON");
  });

  it("never reduces a name to nothing", () => {
    // "UK Group Limited" is all qualifiers. Emptying it would make it match
    // every other all-qualifier name in the register.
    expect(normaliseCore("UK Group Limited")).toBe("UK GROUP");
    expect(normaliseCore("Global Holdings Ltd")).toBe("GLOBAL HOLDINGS");
  });

  it("does not conflate firms that merely share a token", () => {
    expect(normaliseCore("Northern Trust")).not.toBe(normaliseCore("Trust"));
  });
});

describe("tokenise", () => {
  it("removes only legal suffixes, wherever they appear", () => {
    expect(tokenise("Wise Payments Limited")).toEqual(["WISE", "PAYMENTS"]);
  });

  it("keeps digits, which distinguish real companies", () => {
    expect(tokenise("Studio 54 Ltd")).toEqual(["STUDIO", "54"]);
  });
});

describe("the ambiguous-name guard", () => {
  it("lists Visa — the word is the subject of the search, not just the employer", () => {
    expect(AMBIGUOUS_NAMES.has("VISA")).toBe(true);
  });

  it("routes every ambiguous name through a verified alias", () => {
    // An ambiguous name may only ever resolve via SPONSOR_ALIASES. If one has
    // no alias it can never match, which is safe but useless — so the pairing
    // is asserted rather than assumed.
    expect(SPONSOR_ALIASES.VISA).toBe("VISA EUROPE LIMITED");
  });

  it("keys every alias in normalised form, or the lookup will never find it", () => {
    for (const key of Object.keys(SPONSOR_ALIASES)) {
      expect(normaliseName(key)).toBe(key);
    }
  });
});

describe("sponsorPromptBlock", () => {
  const base = {
    matches: [],
    method: "none" as const,
    registerFetchedAt: new Date("2026-09-01T00:00:00Z"),
  };

  it("distinguishes 'not a sponsor' from 'we did not check'", () => {
    const empty = sponsorPromptBlock({
      ...base,
      status: "unknown",
      method: "register-empty",
      registerFetchedAt: null,
    } as SponsorMatch);
    expect(empty).toMatch(/could NOT be checked/i);
    expect(empty).toMatch(/Do not infer absence/i);

    const absent = sponsorPromptBlock({ ...base, status: "none" } as SponsorMatch);
    expect(absent).toMatch(/real absence/i);
  });

  it("tells the model not to search — that is the cost saving", () => {
    expect(sponsorPromptBlock({ ...base, status: "none" } as SponsorMatch)).toMatch(
      /do not search/i,
    );
  });

  it("marks a core match probable rather than confirmed", () => {
    const probable = sponsorPromptBlock({
      ...base,
      status: "probable",
      method: "core",
      matches: [
        {
          id: "1",
          organisationName: "VISA EUROPE LIMITED",
          normalisedName: "VISA EUROPE",
          coreName: "VISA",
          townCity: "London",
          county: null,
          typeRating: "Worker (A rating)",
          route: "Skilled Worker",
          fetchedAt: new Date(),
        },
      ],
    } as SponsorMatch);

    expect(probable).toMatch(/PROBABLE/);
    expect(probable).not.toMatch(/CONFIRMED/);
    expect(probable).toContain("VISA EUROPE LIMITED");
    expect(probable).toContain("Worker (A rating)");
  });
});
