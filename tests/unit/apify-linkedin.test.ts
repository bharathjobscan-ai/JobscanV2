import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bestDescription, htmlToText } from "@/features/ingestion/html-text";
import {
  mapDataset,
  mapJob,
  type ApifyLinkedInJob,
} from "@/features/ingestion/sources/apify-linkedin";
import { prequalify } from "@/features/prequalification/engine";
import { splitSections } from "@/features/prequalification/sections";
import { parseUploadRow } from "@/features/ingestion/schema";

/**
 * Written against a real 100-row dataset from `valig/linkedin-jobs-scraper`,
 * trimmed to six representative records. Company names are real — that is the
 * point — and safe here because these tests never touch the database, and the
 * integration cleanup now requires a fixture URL host as well as a name.
 */
const SAMPLE: ApifyLinkedInJob[] = JSON.parse(
  readFileSync("tests/fixtures/apify-linkedin-sample.json", "utf8"),
);

describe("htmlToText", () => {
  it("turns <br> into line breaks", () => {
    expect(htmlToText("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("keeps a bolded heading on its own line", () => {
    expect(htmlToText("<strong>Requirements<br><br></strong>7+ years")).toBe(
      "Requirements\n\n7+ years",
    );
  });

  it("renders list items as bullets", () => {
    expect(htmlToText("<ul><li>one</li><li>two</li></ul>")).toContain("- one");
  });

  it("decodes the entities scrapers actually emit", () => {
    expect(htmlToText("R&amp;D&nbsp;team&#39;s")).toBe("R&D team's");
    expect(htmlToText("a &amp;nbsp; b")).toContain("a");
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToText("a<br><br><br><br>b")).toBe("a\n\nb");
  });

  it("returns empty for nothing", () => {
    expect(htmlToText(null)).toBe("");
    expect(htmlToText("<p></p>")).toBe("");
  });
});

describe("bestDescription", () => {
  /**
   * The defect this exists for: the actor's `description` has no line breaks at
   * all, so the section splitter finds nothing. Only the HTML carries structure.
   */
  it("prefers HTML because the plain field has lost its structure", () => {
    const job = SAMPLE[0];
    expect(job.description).not.toContain("\n");
    expect(job.descriptionHtml).toMatch(/<br/i);

    const text = bestDescription(job.descriptionHtml, job.description);
    expect(text).toContain("\n");
  });

  it("falls back to plain text when a source gives no HTML", () => {
    expect(bestDescription(null, "just text")).toBe("just text");
    expect(bestDescription("", "  ")).toBeNull();
  });
});

describe("mapJob", () => {
  it("maps every sample record without loss", () => {
    const result = mapDataset(SAMPLE);
    expect(result.failures).toHaveLength(0);
    expect(result.jobs).toHaveLength(SAMPLE.length);
  });

  it("produces rows the existing validator accepts", () => {
    // The adapter's only contract: emit what `parseUploadRow` already validates,
    // so dedupe, validation and persistence are shared with manual upload.
    for (const job of mapDataset(SAMPLE).jobs) {
      const parsed = parseUploadRow(job.row);
      expect(parsed.ok, JSON.stringify(parsed.ok ? {} : parsed.errors)).toBe(true);
    }
  });

  it("carries the LinkedIn job id as the source id, for tier-one dedupe", () => {
    const [first] = mapDataset(SAMPLE).jobs;
    expect(first.sourceJobId).toMatch(/^\d+$/);
    expect(first.row.source_job_id).toBe(first.sourceJobId);
  });

  it("extracts the country from the tail of LinkedIn's location string", () => {
    const mapped = mapJob({
      ...SAMPLE[0],
      location: "London, England, United Kingdom",
    });
    expect("error" in mapped).toBe(false);
    if (!("error" in mapped)) expect(mapped.row.country).toBe("United Kingdom");
  });

  it("keeps the raw payload for reprocessing", () => {
    const [first] = mapDataset(SAMPLE).jobs;
    expect(first.rawPayload).toBeTruthy();
  });

  it("sends unusable records to the DLQ instead of dropping them", () => {
    const result = mapDataset([
      { title: "Senior Product Manager" }, // no company, no url
      { companyName: "Acme", url: "https://x/1" }, // no title
      ...SAMPLE.slice(0, 1),
    ]);
    expect(result.jobs).toHaveLength(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].error).toBeTruthy();
    expect(result.failures[0].payload).toBeTruthy();
  });

  it("claims recruiter reachability only when a recruiter is named", () => {
    const withRecruiter = mapJob({ ...SAMPLE[0], recruiterName: "Jane Harrison" });
    const without = mapJob({ ...SAMPLE[0], recruiterName: "" });
    if (!("error" in withRecruiter)) {
      expect(withRecruiter.row.reachability).toBe("recruiter_contact");
    }
    if (!("error" in without)) expect(without.row.reachability).toBeUndefined();
  });

  /** Absence of the phrase is not evidence of absence — never assert false. */
  it("never claims sponsorship is absent", () => {
    const quiet = mapJob({
      ...SAMPLE[0],
      description: "Nothing about immigration here.",
      descriptionHtml: "",
    });
    if (!("error" in quiet)) {
      expect(quiet.row.visa_sponsorship_mentioned).toBeUndefined();
    }
  });
});

describe("end to end: actor payload through pre-qualification", () => {
  /**
   * The point of converting the HTML. On the plain `description` the splitter
   * sees one line and everything collapses to a single `body` block, discarding
   * the section weighting the domain filter is built on.
   */
  it("recovers real sections from the HTML that the plain text had lost", () => {
    const job = SAMPLE[0];

    const fromPlain = splitSections(job.description);
    expect(fromPlain).toHaveLength(1);
    expect(fromPlain[0].id).toBe("body");

    const fromHtml = splitSections(bestDescription(job.descriptionHtml, job.description));
    expect(fromHtml.length).toBeGreaterThan(1);
    expect(fromHtml.map((s) => s.id)).toContain("company_description");
  });

  it("gives every mapped job a verdict with a readable reason", () => {
    for (const job of mapDataset(SAMPLE).jobs) {
      const verdict = prequalify({
        title: String(job.row.title),
        company: String(job.row.company),
        location: (job.row.location as string) ?? null,
        country: (job.row.country as string) ?? null,
        description: (job.row.description as string) ?? null,
      });

      expect(["pass", "review", "reject"]).toContain(verdict.decision);
      expect(verdict.reason.length).toBeGreaterThan(0);
    }
  });

  it("rejects the mobile-game PM on domain, not on role", () => {
    // Voodoo's "Senior Product Manager - Paper.io 2" is a genuine Senior PM
    // role and must fail on domain alone — the case that proves the domain
    // filter is doing work the role filter cannot.
    const voodoo = SAMPLE.find((j) => j.companyName === "Voodoo");
    expect(voodoo).toBeDefined();

    const mapped = mapJob(voodoo!);
    if ("error" in mapped) throw new Error(mapped.error);

    const verdict = prequalify({
      title: String(mapped.row.title),
      company: String(mapped.row.company),
      location: (mapped.row.location as string) ?? null,
      country: (mapped.row.country as string) ?? null,
      description: (mapped.row.description as string) ?? null,
    });

    expect(verdict.role.status).toBe("pass");
    expect(verdict.decision).not.toBe("pass");
  });
});
