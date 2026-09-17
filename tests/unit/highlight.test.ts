import { describe, expect, it } from "vitest";

import { highlightTerms, termFrequency } from "@/features/prequalification/highlight";

/** JSV2S1152 — the highlight must show exactly what the gate matched. */
describe("highlightTerms", () => {
  it("marks a matched term and leaves the rest untouched", () => {
    const segments = highlightTerms("We build cross-border payments rails.", [
      "payments",
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(
      "We build cross-border payments rails.",
    );
    expect(segments.filter((s) => s.term)).toHaveLength(1);
  });

  it("respects word boundaries — 'pay' must not light up inside 'payroll'", () => {
    const segments = highlightTerms("We run payroll for teams.", ["pay"]);
    expect(segments.some((s) => s.term)).toBe(false);
  });

  it("prefers the longest term where two overlap", () => {
    const segments = highlightTerms("cross-border payments", [
      "payments",
      "cross-border payments",
    ]);
    const marked = segments.filter((s) => s.term);
    expect(marked).toHaveLength(1);
    expect(marked[0].term).toBe("cross-border payments");
  });

  it("matches case-insensitively but reports the canonical term", () => {
    const segments = highlightTerms("PAYMENTS and Payments", ["payments"]);
    const marked = segments.filter((s) => s.term);
    expect(marked).toHaveLength(2);
    expect(marked.every((s) => s.term === "payments")).toBe(true);
    // The posting's own casing is preserved in the visible text.
    expect(marked[0].text).toBe("PAYMENTS");
  });

  it("returns the text whole when there is nothing to match", () => {
    expect(highlightTerms("Nothing here.", [])).toEqual([
      { text: "Nothing here.", term: null },
    ]);
  });

  it("never loses or duplicates text", () => {
    const text = "Payments, settlement and FX. Payments again.";
    const segments = highlightTerms(text, ["payments", "settlement", "fx"]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("ignores single-character noise terms", () => {
    const segments = highlightTerms("A b c payments", ["a", "payments"]);
    expect(segments.filter((s) => s.term).map((s) => s.term)).toEqual(["payments"]);
  });
});

describe("termFrequency", () => {
  it("counts each term's occurrences, most frequent first", () => {
    const segments = highlightTerms("payments, FX, payments, payments and FX", [
      "payments",
      "fx",
    ]);
    expect(termFrequency(segments)).toEqual([
      { term: "payments", count: 3 },
      { term: "fx", count: 2 },
    ]);
  });
});
