import { and, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";
import { CONFIG_VERSION } from "@/config/prequalification";
import {
  PREQUAL_FILTERS,
  type PrequalDecision,
  type PrequalFilter,
} from "@/lib/config/constants";
import { FILTER_VALUE_KEY, labelFor } from "./labels";

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
  /** Which ingestion run brought this job in (JSV2S1158). */
  ingestionRunId: string | null;
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
    ingestionRunId: row.job.ingestionRunId,
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
/**
 * Selections per pre-qualification filter, e.g.
 * `{ experience: ["BELOW_FLOOR"], domain: ["payments_adjacent"] }`.
 *
 * Keyed by filter so the panel's categories ARE the filters and its values are
 * that filter's own outcomes — "rejected on experience, below the floor" rather
 * than the coarser "rejected on experience".
 */
export type FilterSelections = Partial<Record<PrequalFilter, string[]>>;

export type ReviewFilters = {
  view?: ReviewView;
  selections?: FilterSelections;
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

/** `detail -> <filter> ->> <rule|primaryDomain>`, with null folded to 'none'. */
function valueExpr(filter: PrequalFilter) {
  const key = FILTER_VALUE_KEY[filter];
  return sql`coalesce(${rawJobs.prequalificationDetail}->${filter}->>${key}, 'none')`;
}

function selectionFilters(selections: FilterSelections | undefined) {
  if (!selections) return [];
  return PREQUAL_FILTERS.flatMap((filter) => {
    const values = selections[filter];
    // Selections WITHIN a filter are OR-ed; ACROSS filters they are AND-ed,
    // which is what "domain is payments-adjacent and experience below floor"
    // has to mean.
    return values?.length ? [inArray(valueExpr(filter), values)] : [];
  });
}

function searchFilter(search?: string | null) {
  const q = search?.trim();
  if (!q) return undefined;
  // Escaped for LIKE, so a literal % or _ cannot turn a search into a wildcard
  // that quietly matches everything.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return or(ilike(rawJobs.title, `%${safe}%`), ilike(rawJobs.company, `%${safe}%`));
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
        // The Bin is a soft delete: binned jobs keep their row and their
        // verdict but leave every working list (JSV2S1157).
        isNull(rawJobs.binnedAt),
        ...selectionFilters(f.selections),
        dateFilter(f.from, f.to),
        searchFilter(f.search),
      ),
    )
    .orderBy(desc(rawJobs.prequalifiedAt))
    .limit(200);

  return rows.map(toItem);
}

export type FacetValue = { value: string; label: string; count: number };
/** One entry per pre-qualification filter, each with the values it produced. */
export type ReviewFacets = Partial<Record<PrequalFilter, FacetValue[]>>;

/**
 * What each filter actually produced, within the current view.
 *
 * Scoped to the view and nothing else: in the review queue only the outcomes
 * that appear among review jobs are offered, so the panel never shows a value
 * that cannot return anything here. Deliberately NOT narrowed by the other
 * selections — a count that collapsed as you ticked boxes would make every
 * further filter look empty.
 */
export async function getFacets(view: ReviewView = "review"): Promise<ReviewFacets> {
  const rows = await db
    .select({
      role: sql<string>`coalesce(${rawJobs.prequalificationDetail}->'role'->>'rule', 'none')`,
      domain: sql<string>`coalesce(${rawJobs.prequalificationDetail}->'domain'->>'primaryDomain', 'none')`,
      experience: sql<string>`coalesce(${rawJobs.prequalificationDetail}->'experience'->>'rule', 'none')`,
      location: sql<string>`coalesce(${rawJobs.prequalificationDetail}->'location'->>'rule', 'none')`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(viewFilter(view), isNull(applications.id), isNull(rawJobs.binnedAt)));

  const facets: ReviewFacets = {};
  for (const filter of PREQUAL_FILTERS) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = row[filter];
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    facets[filter] = [...counts.entries()]
      .map(([value, count]) => ({ value, label: labelFor(filter, value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  return facets;
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
    .where(and(isNull(applications.id), isNull(rawJobs.binnedAt)));

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
    .where(
      and(
        eq(rawJobs.prequalification, "review"),
        isNull(applications.id),
        isNull(rawJobs.binnedAt),
      ),
    );
  return row?.n ?? 0;
}
