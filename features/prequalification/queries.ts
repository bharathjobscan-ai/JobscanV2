import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";
import { CONFIG_VERSION } from "@/config/prequalification";
import type {
  PrequalDecision,
  PrequalFilter,
  PrequalWindow,
} from "@/lib/config/constants";

export {
  PREQUAL_WINDOWS,
  PREQUAL_WINDOW_LABELS,
  type PrequalWindow,
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
/** Start of day, local — the user thinks in their own days, not in UTC. */
function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(0, 0, 0, 0);
  return d;
}

function windowFilter(window: PrequalWindow) {
  switch (window) {
    case "all":
      return undefined;
    case "today":
      return gte(rawJobs.prequalifiedAt, startOfDay());
    case "yesterday":
      // Bounded on BOTH sides: "yesterday" must not silently mean "since
      // yesterday", which is the commonest way a date filter lies.
      return and(
        gte(rawJobs.prequalifiedAt, startOfDay(1)),
        lt(rawJobs.prequalifiedAt, startOfDay()),
      );
    case "week":
      return gte(rawJobs.prequalifiedAt, startOfDay(7));
    case "month":
      return gte(rawJobs.prequalifiedAt, startOfDay(30));
  }
}

export type ReviewFilters = {
  view?: ReviewView;
  /** `decidedBy` values to keep. Empty means every factor. */
  factors?: PrequalFilter[];
  window?: PrequalWindow;
};

function factorFilter(factors: PrequalFilter[] | undefined) {
  if (!factors?.length) return undefined;
  // decidedBy lives inside the jsonb detail, so this reads it out rather than
  // recomputing the verdict — the stored verdict is the one being audited.
  return inArray(
    sql`${rawJobs.prequalificationDetail}->>'decidedBy'`,
    factors,
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
        windowFilter(f.window ?? "all"),
      ),
    )
    .orderBy(desc(rawJobs.prequalifiedAt))
    .limit(200);

  return rows.map(toItem);
}

/**
 * How many jobs each factor is responsible for, within the current view and
 * window. Drives the counts beside each filter chip, so an empty facet is
 * visibly empty rather than a dead end.
 */
export async function countByFactor(
  view: ReviewView = "review",
  window: PrequalWindow = "all",
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      factor: sql<string>`coalesce(${rawJobs.prequalificationDetail}->>'decidedBy', 'none')`,
      n: sql<number>`count(*)::int`,
    })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(viewFilter(view), isNull(applications.id), windowFilter(window)))
    .groupBy(sql`coalesce(${rawJobs.prequalificationDetail}->>'decidedBy', 'none')`);

  return Object.fromEntries(rows.map((r) => [r.factor, r.n]));
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
