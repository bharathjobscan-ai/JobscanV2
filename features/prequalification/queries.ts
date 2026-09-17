import { and, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";
import { CONFIG_VERSION } from "@/config/prequalification";
import {
  PREQUAL_FILTER_LABELS,
  type PrequalDecision,
  type PrequalFilter,
} from "@/lib/config/constants";

import { db } from "@/lib/db/client";
import type { PreQualificationResult } from "./types";

/**
 * Reads for the review queue (JSV2S1038).
 *
 * These are rooted at `raw_jobs` with a left join, unlike every query in
 * `features/applications/queries.ts`, which is rooted at `applications` with an
 * inner join. That is the whole point: a screened-out job has no application
 * row, so it is invisible to all of them. A sixth tab on the applications list
 * could not have worked.
 */

export type ReviewItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  source: string;
  jobUrl: string;
  postedAt: string | null;
  decision: PrequalDecision;
  detail: PreQualificationResult | null;
  prequalifiedAt: Date | null;
  /** Set once promoted, so a job is never promoted twice. */
  applicationId: string | null;
  /** True when the verdict predates the current config and may be stale. */
  stale: boolean;
};

function toItem(row: {
  job: typeof rawJobs.$inferSelect;
  applicationId: string | null;
}): ReviewItem {
  const detail = (row.job.prequalificationDetail ?? null) as PreQualificationResult | null;
  return {
    id: row.job.id,
    title: row.job.title,
    company: row.job.company,
    location: row.job.location,
    country: row.job.country,
    source: row.job.source,
    jobUrl: row.job.jobUrl,
    postedAt: row.job.postedAt,
    decision: row.job.prequalification ?? "review",
    detail,
    prequalifiedAt: row.job.prequalifiedAt,
    applicationId: row.applicationId,
    stale:
      row.job.prequalificationVersion !== null &&
      row.job.prequalificationVersion !== CONFIG_VERSION,
  };
}

export const REVIEW_VIEWS = ["review", "rejected", "stale"] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

export const REVIEW_VIEW_LABELS: Record<ReviewView, string> = {
  review: "Needs review",
  rejected: "Screened out",
  stale: "Rules changed",
};

function viewFilter(view: ReviewView) {
  switch (view) {
    case "review":
      return eq(rawJobs.prequalification, "review");
    case "rejected":
      return eq(rawJobs.prequalification, "reject");
    case "stale":
      // Jobs judged under an older config. Adding a role or a country should
      // surface everything the old rules turned away.
      return and(
        or(
          eq(rawJobs.prequalification, "review"),
          eq(rawJobs.prequalification, "reject"),
        ),
        ne(rawJobs.prequalificationVersion, CONFIG_VERSION),
      );
  }
}

/**
 * Two-dimensional filtering of the queue (JSV2S1153).
 *
 * "Everything rejected last week on experience" and "everything held for review
 * yesterday on domain" are the questions that make the gate tunable. Without
 * them a verdict is only auditable one job at a time, which does not scale past
 * the first hundred.
 *
 * `factor` filters on `decidedBy` — the filter that actually DROVE the outcome —
 * not merely on a filter that happened to fail. A job rejected on domain that
 * also tripped the experience rule belongs under domain, or the counts
 * double-count and tuning chases the wrong rule.
 */
export type ReviewFilters = {
  view?: ReviewView;
  /** `decidedBy` values to keep. Empty means every factor. */
  factors?: PrequalFilter[];
  /** `raw_jobs.source` values to keep. Empty means every source. */
  sources?: string[];
  /** Country names to keep. Empty means everywhere. */
  countries?: string[];
  /** Inclusive date bounds, as YYYY-MM-DD from the range picker. */
  from?: string | null;
  to?: string | null;
  /** Free text over title and company. */
  search?: string | null;
};

/**
 * Inclusive date-range filter over when the verdict was reached.
 *
 * `to` is made inclusive by comparing against the START OF THE NEXT DAY. A job
 * judged at 14:30 on the `to` date must be inside the range; comparing against
 * the date itself silently excludes everything after midnight, which is the
 * classic way a date filter loses a day.
 */
function dateFilter(from?: string | null, to?: string | null) {
  const clauses = [];
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) clauses.push(gte(rawJobs.prequalifiedAt, start));
  }
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(end.getTime())) {
      end.setDate(end.getDate() + 1);
      clauses.push(lt(rawJobs.prequalifiedAt, end));
    }
  }
  return clauses.length > 0 ? and(...clauses) : undefined;
}

function factorFilter(factors: PrequalFilter[] | undefined) {
  if (!factors?.length) return undefined;
  // `decidedBy` lives inside the jsonb detail; this reads the STORED verdict
  // rather than recomputing, because the stored verdict is what is being
  // audited.
  return inArray(sql`${rawJobs.prequalificationDetail}->>'decidedBy'`, factors);
}

function searchFilter(search?: string | null) {
  const q = search?.trim();
  if (!q) return undefined;
  // Title or company. Escaped for LIKE so a literal % or _ cannot turn a
  // search into a wildcard that quietly matches everything.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return or(
    ilike(rawJobs.title, `%${safe}%`),
    ilike(rawJobs.company, `%${safe}%`),
  );
}

export async function listForReview(
  filters: ReviewView | ReviewFilters = "review",
): Promise<ReviewItem[]> {
  const f: ReviewFilters = typeof filters === "string" ? { view: filters } : filters;

  const rows = await db
    .select({ job: rawJobs, applicationId: applications.id })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        viewFilter(f.view ?? "review"),
        isNull(applications.id),
        factorFilter(f.factors),
        f.sources?.length ? inArray(rawJobs.source, f.sources) : undefined,
        f.countries?.length ? inArray(rawJobs.country, f.countries) : undefined,
        dateFilter(f.from, f.to),
        searchFilter(f.search),
      ),
    )
    .orderBy(desc(rawJobs.prequalifiedAt))
    .limit(200);

  return rows.map(toItem);
}

/**
 * The facets, with counts, for the filter panel.
 *
 * Counted within the current VIEW but ignoring the other selections, so a
 * checkbox always shows how many jobs it would add — a count that collapsed to
 * zero as you ticked boxes would make the panel unusable.
 */
export type ReviewFacets = {
  factor: { value: string; label: string; count: number }[];
  source: { value: string; label: string; count: number }[];
  country: { value: string; label: string; count: number }[];
};

export async function getFacets(view: ReviewView = "review"): Promise<ReviewFacets> {
  const rows = await db
    .select({
      factor: sql<string>`${rawJobs.prequalificationDetail}->>'decidedBy'`,
      source: rawJobs.source,
      country: rawJobs.country,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(viewFilter(view), isNull(applications.id)));

  const tally = (values: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };

  return {
    factor: tally(rows.map((r) => r.factor)).map((f) => ({
      ...f,
      label: PREQUAL_FILTER_LABELS[f.value as PrequalFilter] ?? f.value,
    })),
    source: tally(rows.map((r) => r.source)),
    country: tally(rows.map((r) => r.country)),
  };
}

export async function countForReview(): Promise<Record<ReviewView, number>> {
  const [row] = await db
    .select({
      review: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'review')::int`,
      rejected: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'reject')::int`,
      stale: sql<number>`count(*) filter (where ${rawJobs.prequalification} in ('review','reject') and ${rawJobs.prequalificationVersion} is distinct from ${CONFIG_VERSION})::int`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(isNull(applications.id));

  return {
    review: row?.review ?? 0,
    rejected: row?.rejected ?? 0,
    stale: row?.stale ?? 0,
  };
}

/** Badge count for the nav — only what is actually waiting on a decision. */
export async function countAwaitingReview(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(eq(rawJobs.prequalification, "review"), isNull(applications.id)));
  return row?.n ?? 0;
}
