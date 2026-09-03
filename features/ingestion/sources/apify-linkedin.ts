import { getEnv } from "@/lib/config/env";
import { withRetry } from "../reliability";
import { bestDescription } from "../html-text";
import type { FetchParams, FetchResult, FetchedJob, JobSourceAdapter } from "./types";

/**
 * LinkedIn via the Apify actor `valig/linkedin-jobs-scraper` (JSV2S1019, 1021).
 *
 * Written against a real 100-row sample rather than the actor's documentation,
 * which surfaced two things the docs would not have:
 *
 * 1. **`description` contains no line breaks.** Headings are concatenated with
 *    body text. All structure lives in `descriptionHtml`, so that is what gets
 *    mapped — see `html-text.ts`. Taking the plain field would collapse every
 *    job into one unweighted block.
 * 2. **`applyUrl` is empty on every row**, including those marked
 *    `applyType: EXTERNAL`. JSV2S1022 — resolving the real application URL
 *    rather than Easy Apply — **cannot be satisfied from this actor's output**.
 *    `applyType` is preserved so the workspace can at least say which is which.
 */

const ACTOR_ID = "valig~linkedin-jobs-scraper";
const RUN_SYNC_ENDPOINT = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

/** One record as the actor emits it. Every field may be absent or blank. */
export type ApifyLinkedInJob = {
  id?: string;
  title?: string;
  companyName?: string;
  companyUrl?: string;
  location?: string;
  description?: string;
  descriptionHtml?: string;
  url?: string;
  applyUrl?: string;
  applyType?: string;
  postedDate?: string;
  postedTimeAgo?: string;
  contractType?: string;
  experienceLevel?: string;
  workType?: string;
  sector?: string;
  salary?: string;
  recruiterName?: string;
  recruiterUrl?: string;
  applicationsCount?: string;
};

/** LinkedIn's location string is "City, Region, Country" — the tail is enough. */
function countryOf(location: string | undefined): string | null {
  if (!location) return null;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

/** `postedDate` is midnight-stamped ISO; the date half is what `raw_jobs` holds. */
function postedAt(job: ApifyLinkedInJob): string | null {
  if (!job.postedDate) return null;
  const date = new Date(job.postedDate);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * Does the posting mention sponsorship?
 *
 * A weak, deliberately conservative signal — it feeds ScoreG's visa pillar as
 * *context*, and only `true` is asserted. Absence of the phrase is not evidence
 * of absence of sponsorship, so a miss stays null rather than false.
 */
function mentionsSponsorship(text: string | null): boolean | null {
  if (!text) return null;
  return /\b(visa sponsorship|sponsor(ship)? available|we sponsor|skilled worker visa|right to work|work permit)\b/i.test(
    text,
  )
    ? true
    : null;
}

export function mapJob(job: ApifyLinkedInJob): FetchedJob | { error: string } {
  const title = job.title?.trim();
  const company = job.companyName?.trim();
  const jobUrl = job.url?.trim();

  // These three are `notNull` on raw_jobs; a record missing one cannot become a
  // job and belongs in the DLQ rather than being silently dropped.
  if (!title) return { error: "no title" };
  if (!company) return { error: `no company (${title})` };
  if (!jobUrl) return { error: `no job url (${title} at ${company})` };

  const description = bestDescription(job.descriptionHtml, job.description);

  return {
    sourceJobId: job.id?.trim() || null,
    rawPayload: job,
    row: {
      title,
      company,
      source: "linkedin",
      job_url: jobUrl,
      description: description ?? undefined,
      location: job.location?.trim() || undefined,
      country: countryOf(job.location) ?? undefined,
      posted_at: postedAt(job) ?? undefined,
      employment_type: job.contractType?.trim() || undefined,
      seniority: job.experienceLevel?.trim() || undefined,
      salary_raw: job.salary?.trim() || undefined,
      visa_sponsorship_mentioned: mentionsSponsorship(description) ?? undefined,
      source_job_id: job.id?.trim() || undefined,
      // JSV2S1022 is unmet: applyUrl is always blank. Recording the *type* at
      // least distinguishes "apply on the company site" from Easy Apply.
      external_apply_url: job.applyUrl?.trim() || undefined,
      // A named recruiter is a reachable human, which is ScoreG's Reachability
      // component. Only claimed when the actor actually supplies a name.
      reachability: job.recruiterName?.trim() ? "recruiter_contact" : undefined,
      notes: [
        job.applyType ? `Apply: ${job.applyType}` : null,
        job.sector ? `Sector: ${job.sector}` : null,
        job.workType ? `Function: ${job.workType}` : null,
        job.applicationsCount ? `Applicants: ${job.applicationsCount}` : null,
        job.recruiterName ? `Recruiter: ${job.recruiterName}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    },
  };
}

/** Map a whole dataset, sending unusable records to the DLQ (JSV2S1015). */
export function mapDataset(items: readonly ApifyLinkedInJob[]): FetchResult {
  const jobs: FetchedJob[] = [];
  const failures: { payload: unknown; error: string }[] = [];

  for (const item of items) {
    const mapped = mapJob(item);
    if ("error" in mapped) failures.push({ payload: item, error: mapped.error });
    else jobs.push(mapped);
  }

  return { jobs, failures, notes: { received: items.length } };
}

/** The actor's own input schema. */
function buildInput(params: FetchParams) {
  return {
    // The actor takes one search string; the role list is OR-ed into it.
    title: (params.keywords ?? []).join(" OR "),
    location: params.locations?.[0] ?? "",
    rows: params.limit,
    // 'r86400' is LinkedIn's own 24-hour recency token.
    publishedAt: params.postedWithinDays === 1 ? "r86400" : "",
  };
}

export class ApifyLinkedInAdapter implements JobSourceAdapter {
  readonly source = "linkedin" as const;
  readonly label = "LinkedIn (Apify)";

  isConfigured(): boolean {
    return Boolean(getEnv().APIFY_TOKEN);
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const token = getEnv().APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN is not set.");

    const response = await withRetry(async () => {
      const res = await fetch(`${RUN_SYNC_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildInput(params)),
      });

      if (!res.ok) {
        // Carrying `status` is what lets `isRetryable` refuse to retry a 4xx —
        // a bad actor input will never succeed, and retrying burns paid runs.
        const error = Object.assign(
          new Error(`Apify returned ${res.status}: ${await res.text().catch(() => "")}`),
          { status: res.status },
        );
        throw error;
      }
      return res;
    });

    const items = (await response.json()) as ApifyLinkedInJob[];
    return mapDataset(Array.isArray(items) ? items : []);
  }
}
