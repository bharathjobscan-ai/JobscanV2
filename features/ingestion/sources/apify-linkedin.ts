import { LINKEDIN_ACTOR, estimateFetchCostUsd } from "@/config/apify";
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

const RUN_SYNC_ENDPOINT = `https://api.apify.com/v2/acts/${LINKEDIN_ACTOR.slug}/run-sync-get-dataset-items`;

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

/** Maximum the actor will return in one run, per its schema. */
export const ACTOR_MAX_LIMIT = 1000;

/**
 * LinkedIn's own recency tokens. The schema is an enum, so an unsupported
 * window falls back to no filter rather than a rejected run.
 */
function datePostedToken(days: number | undefined): string {
  if (days === undefined) return "";
  if (days <= 1) return "r86400";
  if (days <= 7) return "r604800";
  if (days <= 30) return "r2592000";
  return "";
}

/**
 * The actor's input, per its published schema — verified 2026-09-05 against
 * build `default` of actor `RIGGeqD6RqKmlVoQU` (`valig/linkedin-jobs-scraper`).
 *
 * **Three of the four fields were wrong until 2026-09-05.** We sent `title`,
 * `rows` and `publishedAt`; the actor expects `keywords`, `limit` and
 * `datePosted`. Apify ignores unknown input keys silently, so this never
 * surfaced as an error — which made it worse than one:
 *
 * - no keyword filter, so results were arbitrary jobs in the location;
 * - no recency filter, so stale postings came back;
 * - **`limit` fell back to its default of 100**, making `limitPerLocation` in
 *   `config/pipeline.ts` completely inert. Eleven locations would have fetched
 *   1,100 jobs a night rather than the 330 that was budgeted — and the actor
 *   bills per result.
 *
 * The shape of the failure is the lesson: a silently-ignored input key cannot
 * be caught by a status code, only by reading the schema.
 */
export function buildInput(params: FetchParams) {
  const titles = params.keywords ?? [];

  return {
    // One broad search string; `titleInclude` does the precise work below.
    keywords: titles[0] ?? "",
    location: params.locations?.[0] ?? "",
    datePosted: datePostedToken(params.postedWithinDays),
    // Clamped both ways: 0 would fetch nothing, and the actor caps at 1000.
    limit: Math.max(1, Math.min(params.limit, ACTOR_MAX_LIMIT)),
    /**
     * Post-filter on title, which a single `keywords` string cannot express.
     * Case-insensitive substring, so "Product Manager" still keeps "Senior
     * Product Manager" — this exists to drop the non-PM roles the search drags
     * in, not to enumerate every variant.
     */
    ...(titles.length > 0 ? { titleInclude: titles } : {}),
    /** Filtering at the source is cheapest: the actor bills per result. */
    ...(params.titleExclude?.length ? { titleExclude: params.titleExclude } : {}),
    /**
     * Jobs already stored. Skipping them at the actor means we do not PAY for
     * records dedupe would discard — the only dedupe that saves money.
     */
    ...(params.skipJobIds?.length ? { skipJobId: params.skipJobIds } : {}),
    ...(params.raw ?? {}),
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
    const result = mapDataset(Array.isArray(items) ? items : []);

    /**
     * Priced on what the actor RETURNED, not on what was asked for (JSV2S1144).
     *
     * `limit` is a ceiling; a search with few matches returns fewer and bills
     * less. Charging the ceiling would overstate every run. The start event is
     * charged regardless, which is why a fetch that returns nothing is still
     * not free.
     */
    result.costUsd = estimateFetchCostUsd(Array.isArray(items) ? items.length : 0);
    return result;
  }
}
