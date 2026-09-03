import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { detectShape, normaliseUpload } from "@/features/ingestion/shapes";
import { parseUploadRow } from "@/features/ingestion/schema";

const APIFY = JSON.parse(
  readFileSync("tests/fixtures/apify-linkedin-sample.json", "utf8"),
) as Record<string, unknown>[];

const TEMPLATE = [
  {
    title: "Senior Product Manager",
    company: "Acme",
    source: "linkedin",
    job_url: "https://example.com/1",
  },
];

describe("detectShape", () => {
  it("recognises a real Apify export", () => {
    expect(detectShape(APIFY)).toBe("apify_linkedin");
  });

  it("recognises the upload template", () => {
    expect(detectShape(TEMPLATE)).toBe("template");
  });

  /** A sheet using `companyName` but with `source` is still a template. */
  it("does not mistake a template with friendly headers for an export", () => {
    expect(
      detectShape([{ companyName: "Acme", source: "linkedin", job_url: "https://x/1" }]),
    ).toBe("template");
  });

  it("treats an empty file as a template rather than throwing", () => {
    expect(detectShape([])).toBe("template");
  });
});

describe("normaliseUpload", () => {
  it("maps an Apify export into rows the validator accepts", () => {
    const { shape, records, failures } = normaliseUpload(APIFY);

    expect(shape).toBe("apify_linkedin");
    expect(failures).toHaveLength(0);
    expect(records).toHaveLength(APIFY.length);

    for (const record of records) {
      const parsed = parseUploadRow(record);
      expect(parsed.ok, JSON.stringify(parsed.ok ? {} : parsed.errors)).toBe(true);
    }
  });

  /**
   * The reason the backfill shares the adapter's mapper: a job uploaded from an
   * export and the same job fetched nightly must dedupe against each other.
   */
  it("recovers the structured description the plain field had lost", () => {
    const [first] = normaliseUpload(APIFY).records;
    expect(String(first.description)).toContain("\n");
  });

  it("passes a template through untouched", () => {
    const { shape, records } = normaliseUpload(TEMPLATE);
    expect(shape).toBe("template");
    expect(records).toEqual(TEMPLATE);
  });

  it("reports unmappable export rows instead of dropping them", () => {
    const { records, failures } = normaliseUpload([
      ...APIFY.slice(0, 1),
      { descriptionHtml: "<p>x</p>", applyType: "EXTERNAL", companyName: "" },
    ]);
    expect(records).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });
});
