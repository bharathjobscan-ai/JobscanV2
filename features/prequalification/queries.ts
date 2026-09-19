import { and, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { applications, ingestionRuns, rawJobs } from "@/db/schema";
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
export type FilterSelections = Partial<
  Record<PrequalFilter | "fetch" | "company", string[]>
>;

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
  const clauses = PREQUAL_FILTERS.flatMap((filter) => {
    const values = selections[filter];
    // Selections WITHIN a filter are OR-ed; ACROSS filters they are AND-ed,
    // which is what "domain is payments-adjacent and experience below floor"
    // has to mean.
    return values?.length ? [inArray(valueExpr(filter), values)] : [];
  });

  // Which fetch brought the job in (JSV2S1158) — the same axis the pipeline
  // table reports on, so a suspicious run can be inspected job by job.
  const runs = selections.fetch;
  if (runs?.length) clauses.push(inArray(rawJobs.ingestionRunId, runs));

  // Company (2026-09-19). Not a pre-qualification filter — it has no verdict —
  // so it sits beside `fetch` rather than inside the PREQUAL_FILTERS loop.
  const companies = selections.company;
  if (companies?.length) clauses.push(inArray(rawJobs.company, companies));

  return clauses;
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
export type ReviewFacets = Partial<
  Record<PrequalFilter | "fetch" | "company", FacetValue[]>
>;

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
      visa: sql<string>`coalesce(${rawJobs.prequalificationDetail}->'visa'->>'reasonCode', 'none')`,
      company: rawJobs.company,
      fetch: rawJobs.ingestionRunId,
      fetchSource: ingestionRuns.source,
      fetchStartedAt: ingestionRuns.startedAt,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .leftJoin(ingestionRuns, eq(ingestionRuns.id, rawJobs.ingestionRunId))
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

  // A run id is unreadable on its own, so each is labelled with its source and
  // date. Newest first: the run you want is almost always the last one.
  const runs = new Map<string, { label: string; at: Date | null; count: number }>();
  for (const row of rows) {
    if (!row.fetch) continue;
    const existing = runs.get(row.fetch);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const at = row.fetchStartedAt;
    runs.set(row.fetch, {
      label: `${row.fetchSource ?? "unknown"} · ${
        at ? at.toISOString().slice(0, 10) : "—"
      } · ${row.fetch.slice(0, 8)}`,
      at,
      count: 1,
    });
  }
  facets.fetch = [...runs.entries()]
    .map(([value, r]) => ({ value, label: r.label, count: r.count }))
    .sort((a, b) => b.count - a.count);

  // Company. Exact stored string, not normalised: the facet's job is to return
  // the rows you can see, and a label that did not match a row's own `company`
  // verbatim would be a checkbox whose count disagreed with its result.
  const companies = new Map<string, number>();
  for (const row of rows) {
    if (!row.company) continue;
    companies.set(row.company, (companies.get(row.company) ?? 0) + 1);
  }
  facets.company = [...companies.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return facets;
}

export async function countForReview(): Promise<Record<ReviewView, number>> {
  const [queue] = await db
    .select({
      review: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'review')::int`,
      rejected: sql<number>`count(*) filter (where ${rawJobs.prequalification} = 'reject')::int`,
      stale: sql<number>`count(*) filter (where ${rawJobs.prequalification} in ('review','reject') and ${rawJobs.prequalificationVersion} is distinct from ${CONFIG_VERSION})::int`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(isNull(applications.id), isNull(rawJobs.binnedAt)));

  /**
   * Promoted jobs are stale too (2026-09-19).
   *
   * They were excluded because the query is rooted at the review queue, which
   * they have left. But the re-run button is driven by this number, so it would
   * have disappeared the moment the queue was clean while every application
   * still carried a verdict from the old rules — the button offering to fix the
   * problem vanishing before the problem did.
   */
  const [promoted] = await db
    .select({ stale: sql<number>`count(*)::int` })
    .from(rawJobs)
    .innerJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(sql`${rawJobs.prequalificationVersion} is distinct from ${CONFIG_VERSION}`);

  return {
    review: queue?.review ?? 0,
    rejected: queue?.rejected ?? 0,
    stale: (queue?.stale ?? 0) + (promoted?.stale ?? 0),
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
