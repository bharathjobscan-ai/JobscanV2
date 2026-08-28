import { describe, expect, it } from "vitest";

import { jobFingerprint } from "@/features/ingestion/fingerprint";

describe("jobFingerprint", () => {
  const base = {
    company: "Example Ltd",
    title: "Senior Product Manager",
    location: "London, United Kingdom",
  };

  it("is stable for identical input", () => {
    expect(jobFingerprint(base)).toBe(jobFingerprint(base));
  });

  it("ignores case, punctuation and spacing", () => {
    expect(
      jobFingerprint({
        company: "  EXAMPLE   Ltd. ",
        title: "Senior  Product-Manager",
        location: "London,  United Kingdom",
      }),
    ).toBe(jobFingerprint(base));
  });

  it("separates different roles at the same company", () => {
    expect(jobFingerprint({ ...base, title: "Principal Product Manager" })).not.toBe(
      jobFingerprint(base),
    );
  });

  it("separates the same role in different locations", () => {
    expect(jobFingerprint({ ...base, location: "Dublin, Ireland" })).not.toBe(
      jobFingerprint(base),
    );
  });

  it("treats a missing location as its own value", () => {
    expect(jobFingerprint({ company: "A", title: "B" })).toBe(
      jobFingerprint({ company: "A", title: "B", location: null }),
    );
  });
});
