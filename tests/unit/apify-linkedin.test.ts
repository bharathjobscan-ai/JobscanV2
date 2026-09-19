import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { bestDescription, htmlToText } from "@/features/ingestion/html-text";
import { APIFY_PRICING, estimateFetchCostUsd } from "@/config/apify";
import {
  ACTOR_MAX_LIMIT,
  buildInput,
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

  /**
   * The adapter no longer guesses at sponsorship at all (ADR-0006 revision,
   * 2026-09-19). It used to flag on bare "right to work" and "work permit" —
   * exactly the generic phrases the visa filter must never act on — and two
   * sponsorship detectors with opposite thresholds can only disagree. The
   * column survives for manual uploads, where a human is asserting it.
   */
  it("makes no sponsorship claim of its own", () => {
    for (const description of [
      "Nothing about immigration here.",
      "You must have the right to work in the UK.",
      "Visa sponsorship is available.",
    ]) {
      const mapped = mapJob({ ...SAMPLE[0], description, descriptionHtml: "" });
      if (!("error" in mapped)) {
        expect(mapped.row.visa_sponsorship_mentioned).toBeUndefined();
      }
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

/**
 * The actor's input schema, asserted by field NAME.
 *
 * These exist because the adapter shipped with three of four field names wrong
 * — `title`/`rows`/`publishedAt` instead of `keywords`/`limit`/`datePosted`.
 * Apify ignores unknown input keys silently, so there was no error to catch:
 * the run simply used defaults, and `limitPerLocation` was inert while the
 * actor billed per result. Only an assertion on the exact names catches that.
 *
 * Verified 2026-09-05 against build `default` of actor RIGGeqD6RqKmlVoQU.
 */
describe("buildInput — the actor's schema", () => {
  const base = { keywords: ["Product Manager"], locations: ["London"], limit: 30 };

  it("uses the field names the actor actually declares", () => {
    const input = buildInput({ ...base, postedWithinDays: 1 }) as Record<string, unknown>;

    expect(input).toMatchObject({
      keywords: "Product Manager",
      location: "London",
      datePosted: "r86400",
      limit: 30,
    });

    // The names that were silently ignored must never come back.
    expect(input).not.toHaveProperty("title");
    expect(input).not.toHaveProperty("rows");
    expect(input).not.toHaveProperty("publishedAt");
  });

  it("honours the result limit — this is a cost control, not a hint", () => {
    expect(buildInput({ ...base, limit: 5 })).toMatchObject({ limit: 5 });
    // The actor caps at 1000; asking for more is silently truncated by it.
    expect(buildInput({ ...base, limit: 99999 })).toMatchObject({
      limit: ACTOR_MAX_LIMIT,
    });
    // Zero would fetch nothing and look like a broken source.
    expect(buildInput({ ...base, limit: 0 })).toMatchObject({ limit: 1 });
  });

  it("maps the recency window onto LinkedIn's enum tokens", () => {
    const at = (days?: number) =>
      (buildInput({ ...base, postedWithinDays: days }) as { datePosted: string })
        .datePosted;

    expect(at(1)).toBe("r86400");
    expect(at(7)).toBe("r604800");
    expect(at(30)).toBe("r2592000");
    // Outside the enum: no filter beats a rejected run.
    expect(at(90)).toBe("");
    expect(at(undefined)).toBe("");
  });

  it("post-filters on title instead of OR-ing everything into one search", () => {
    const input = buildInput({
      ...base,
      keywords: ["Product Manager", "Product Owner"],
    }) as Record<string, unknown>;

    expect(input.keywords).toBe("Product Manager");
    expect(input.titleInclude).toEqual(["Product Manager", "Product Owner"]);
  });

  it("omits optional filters rather than sending empty arrays", () => {
    const input = buildInput(base) as Record<string, unknown>;
    expect(input).not.toHaveProperty("titleExclude");
    expect(input).not.toHaveProperty("skipJobId");
  });

  it("passes skipJobIds through, so known jobs are never paid for twice", () => {
    const input = buildInput({ ...base, skipJobIds: ["42", "43"] });
    expect(input).toMatchObject({ skipJobId: ["42", "43"] });
  });
});

/** JSV2S1144 — the cost model, read from the actor on 2026-09-05. */
describe("Apify cost estimate", () => {
  it("charges per result and per run start", () => {
    // One run of 30 results: $0.001 start + 30 x $0.0004.
    expect(estimateFetchCostUsd(30)).toBeCloseTo(0.001 + 0.012, 6);
  });

  it("costs something even when a run returns nothing", () => {
    // "Fetched and found no new jobs" is not free — the start event still bills.
    expect(estimateFetchCostUsd(0)).toBeCloseTo(APIFY_PRICING.perRunStartUsd, 6);
  });

  it("prices the proposed nightly plan", () => {
    // 11 locations x 30 results is the config/pipeline.ts proposal.
    const nightly = estimateFetchCostUsd(30, 11);
    expect(nightly).toBeCloseTo(0.011 + 0.132, 6);
    // Comfortably under a pound a night; roughly $4.30 a month at 30 nights.
    expect(nightly * 30).toBeLessThan(5);
  });

  it("shows what the limit bug would have cost — the actor defaults to 100", () => {
    const budgeted = estimateFetchCostUsd(30, 11);
    const actual = estimateFetchCostUsd(100, 11);
    expect(actual).toBeGreaterThan(budgeted * 3);
  });
});
