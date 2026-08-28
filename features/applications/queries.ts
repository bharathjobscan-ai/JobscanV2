import { and, asc, desc, eq, exists, inArray, isNotNull, not, sql } from "drizzle-orm";

import {
  applicationAttempts,
  applicationDocuments,
  applicationEvents,
  applications,
  rawJobs,
} from "@/db/schema";
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  nextAction,
  type ApplicationStatus,
  type ApplicationView,
  type MatchCategory,
  type ReferralStatus,
} from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { isIncomplete } from "@/features/ingestion/schema";

/**
 * C2 — `deemed_pending` is derived, never stored.
 *
 * Storing it would mean remembering to set it on every application, and the
 * Phase 3 Ghost Rate would inherit whatever was forgotten. Deriving it keeps
 * `status` honest and gives the Pending view and that future metric a single
 * shared definition.
 *
 * An application is Pending when it was submitted, never progressed past
 * `applied`, and the waiting period (DEEMED_PENDING_DAYS) has elapsed.
 */
function pendingPredicate() {
  const days = getEnv().DEEMED_PENDING_DAYS;
  return sql<boolean>`(
    ${applications.status} = 'applied'
    and ${applications.appliedAt} is not null
    and ${applications.appliedAt} < now() - make_interval(days => ${days})
  )`;
}

const hasResume = exists(
  db
    .select({ one: sql`1` })
    .from(applicationDocuments)
    .where(
      and(
        eq(applicationDocuments.applicationId, applications.id),
        eq(applicationDocuments.docType, "resume"),
      ),
    ),
);

export type ApplicationListItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  source: string;
  jobUrl: string;
  status: ApplicationStatus;
  isPending: boolean;
  matchCategory: MatchCategory | null;
  jobScore: number | null;
  visaSignal: string | null;
  referralStatus: ReferralStatus;
  appliedAt: Date | null;
  lastActivityAt: Date;
  isIncomplete: boolean;
  hasResume: boolean;
  nextAction: string;
};

/**
 * The five dashboard views (Application Management.md §3).
 *
 * They partition cleanly: Pending is carved out of Active rather than
 * overlapping it, so the counts add up and future funnel maths stays sane.
 */
function viewFilter(view: ApplicationView) {
  const pending = pendingPredicate();
  switch (view) {
    case "ready":
      return eq(applications.status, "ready_to_apply");
    case "active":
      return and(
        inArray(applications.status, [...ACTIVE_STATUSES]),
        not(pending),
      );
    case "pending":
      return pending;
    case "closed":
      return inArray(applications.status, [...CLOSED_STATUSES]);
    case "all":
      return undefined;
  }
}

export async function listApplications(
  view: ApplicationView = "all",
): Promise<ApplicationListItem[]> {
  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      matchCategory: applications.matchCategory,
      jobScore: applications.jobScore,
      visaSignal: applications.visaSignal,
      referralStatus: applications.referralStatus,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
      title: rawJobs.title,
      company: rawJobs.company,
      location: rawJobs.location,
      country: rawJobs.country,
      source: rawJobs.source,
      jobUrl: rawJobs.jobUrl,
      description: rawJobs.description,
      isPending: pendingPredicate(),
      hasResume,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(viewFilter(view))
    .orderBy(desc(applications.lastActivityAt));

  return rows.map((row) => {
    const incomplete = isIncomplete({ description: row.description });
    return {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      country: row.country,
      source: row.source,
      jobUrl: row.jobUrl,
      status: row.status,
      isPending: Boolean(row.isPending),
      matchCategory: row.matchCategory,
      jobScore: row.jobScore,
      visaSignal: row.visaSignal,
      referralStatus: row.referralStatus,
      appliedAt: row.appliedAt,
      lastActivityAt: row.lastActivityAt,
      isIncomplete: incomplete,
      hasResume: Boolean(row.hasResume),
      nextAction: nextAction({
        status: row.status,
        referralStatus: row.referralStatus,
        hasResume: Boolean(row.hasResume),
        hasScore: row.jobScore !== null,
        isIncomplete: incomplete,
      }),
    };
  });
}

export async function countByView(): Promise<Record<ApplicationView, number>> {
  const pending = pendingPredicate();
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      ready: sql<number>`count(*) filter (where ${applications.status} = 'ready_to_apply')::int`,
      pending: sql<number>`count(*) filter (where ${pending})::int`,
      active: sql<number>`count(*) filter (where ${applications.status} in ('applied','shortlisted','interview') and not ${pending})::int`,
      closed: sql<number>`count(*) filter (where ${applications.status} in ('offer','rejected_application','rejected_screening','rejected_interview','rejected_visa'))::int`,
    })
    .from(applications);

  return {
    all: row?.all ?? 0,
    ready: row?.ready ?? 0,
    active: row?.active ?? 0,
    pending: row?.pending ?? 0,
    closed: row?.closed ?? 0,
  };
}

export async function getApplicationDetail(id: string) {
  const [row] = await db
    .select({
      application: applications,
      job: rawJobs,
      isPending: pendingPredicate(),
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(eq(applications.id, id))
    .limit(1);

  if (!row) return null;

  const [documents, attempts, timeline, queuedTasks] = await Promise.all([
    db
      .select()
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, id))
      .orderBy(desc(applicationDocuments.version)),
    db
      .select()
      .from(applicationAttempts)
      .where(eq(applicationAttempts.applicationId, id))
      .orderBy(asc(applicationAttempts.attemptNumber)),
    db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(desc(applicationEvents.occurredAt)),
    db.query.aiJobs.findMany({
      where: (t, { and: A, eq: E, inArray: I }) =>
        A(E(t.applicationId, id), I(t.status, ["queued", "running"])),
    }),
  ]);

  /** Latest version of each document type — earlier versions are kept. */
  const latest = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    if (!latest.has(doc.docType)) latest.set(doc.docType, doc);
  }

  const incomplete = isIncomplete({ description: row.job.description });

  return {
    ...row.application,
    isPending: Boolean(row.isPending),
    job: row.job,
    isIncomplete: incomplete,
    documents,
    latestDocuments: Object.fromEntries(latest),
    attempts,
    timeline,
    queuedTasks,
    nextAction: nextAction({
      status: row.application.status,
      referralStatus: row.application.referralStatus,
      hasResume: latest.has("resume"),
      hasScore: row.application.jobScore !== null,
      isIncomplete: incomplete,
    }),
  };
}

export type ApplicationDetail = NonNullable<
  Awaited<ReturnType<typeof getApplicationDetail>>
>;

/** Jobs imported without a usable description, for the "needs attention" nudge. */
export async function countIncomplete(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      sql`${rawJobs.description} is null or length(trim(${rawJobs.description})) < 50`,
    );
  return row?.n ?? 0;
}

/** Used by the score panel to show whether an analysis exists at all. */
export const hasScoreAnalysis = isNotNull(applications.jobScoreAnalysis);
