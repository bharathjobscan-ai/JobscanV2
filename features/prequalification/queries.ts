import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";
import { CONFIG_VERSION } from "@/config/prequalification";
import type { PrequalDecision } from "@/lib/config/constants";
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

export async function listForReview(view: ReviewView = "review"): Promise<ReviewItem[]> {
  const rows = await db
    .select({ job: rawJobs, applicationId: applications.id })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(and(viewFilter(view), isNull(applications.id)))
    .orderBy(desc(rawJobs.prequalifiedAt))
    .limit(200);

  return rows.map(toItem);
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
