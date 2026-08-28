import { describe, expect, it } from "vitest";

import { isIncomplete, normalizeHeaders, parseUploadRow } from "@/features/ingestion/schema";

const valid = {
  title: "Senior Product Manager",
  company: "Example Ltd",
  source: "linkedin",
  job_url: "https://www.linkedin.com/jobs/view/123",
};

describe("normalizeHeaders", () => {
  it("accepts canonical snake_case unchanged", () => {
    expect(normalizeHeaders({ job_url: "x" })).toEqual({ job_url: "x" });
  });

  it("maps human-friendly headers onto canonical fields", () => {
    const result = normalizeHeaders({
      "Job Title": "PM",
      "Company Name": "Acme",
      URL: "https://example.com",
      JD: "text",
    });
    expect(result).toMatchObject({
      title: "PM",
      company: "Acme",
      job_url: "https://example.com",
      description: "text",
    });
  });
});

describe("parseUploadRow — required fields", () => {
  it("accepts a minimal valid row", () => {
    const result = parseUploadRow(valid);
    expect(result.ok).toBe(true);
  });

  it.each(["title", "company", "source", "job_url"])(
    "rejects a row missing %s",
    (field) => {
      const row: Record<string, unknown> = { ...valid };
      delete row[field];
      const result = parseUploadRow(row);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.field === field)).toBe(true);
      }
    },
  );

  it("rejects an unknown source", () => {
    const result = parseUploadRow({ ...valid, source: "monster" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-http URL", () => {
    const result = parseUploadRow({ ...valid, job_url: "ftp://example.com/job" });
    expect(result.ok).toBe(false);
  });
});

describe("parseUploadRow — coercion", () => {
  it("trims and collapses whitespace", () => {
    const result = parseUploadRow({
      ...valid,
      title: "  Senior   Product    Manager  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe("Senior Product Manager");
  });

  it("preserves paragraph breaks in the description", () => {
    const result = parseUploadRow({
      ...valid,
      description: "First para.\n\nSecond para.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toContain("\n\n");
  });

  it.each([
    ["true", true],
    ["YES", true],
    ["y", true],
    ["1", true],
    ["false", false],
    ["no", false],
    ["0", false],
  ])("reads %s as a boolean", (input, expected) => {
    const result = parseUploadRow({ ...valid, visa_sponsorship_mentioned: input });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visa_sponsorship_mentioned).toBe(expected);
  });

  it("rejects an unreadable boolean rather than guessing", () => {
    const result = parseUploadRow({ ...valid, visa_sponsorship_mentioned: "maybe" });
    expect(result.ok).toBe(false);
  });

  it("accepts an ISO date", () => {
    const result = parseUploadRow({ ...valid, posted_at: "2026-08-20" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.posted_at).toBe("2026-08-20");
  });

  it("rejects ambiguous date formats instead of guessing day/month order", () => {
    for (const input of ["20/08/2026", "08/20/2026", "20-08-2026", "Aug 20 2026"]) {
      const result = parseUploadRow({ ...valid, posted_at: input });
      expect(result.ok, `expected ${input} to be rejected`).toBe(false);
    }
  });

  it("accepts an Excel Date cell", () => {
    const result = parseUploadRow({
      ...valid,
      posted_at: new Date("2026-08-20T00:00:00Z"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.posted_at).toBe("2026-08-20");
  });

  it("collects every problem on a row rather than stopping at the first", () => {
    const result = parseUploadRow({
      title: "",
      company: "Acme",
      source: "nope",
      job_url: "not-a-url",
      posted_at: "31/12/2026",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("isIncomplete", () => {
  it("flags a missing description", () => {
    expect(isIncomplete({ description: null })).toBe(true);
  });

  it("flags a description too short to score against", () => {
    expect(isIncomplete({ description: "PM role in London." })).toBe(true);
  });

  it("passes a real description", () => {
    expect(isIncomplete({ description: "x".repeat(80) })).toBe(false);
  });
});
