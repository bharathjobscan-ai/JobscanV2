import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";

import {
  applicationAttempts,
  applicationDocuments,
  applicationEvents,
  applications,
  ingestionRuns,
  rawJobs,
} from "@/db/schema";
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  MATCH_CATEGORIES,
  MATCH_LABELS,
  REFERRAL_LABELS,
  REFERRAL_STATUSES,
  nextAction,
  type ApplicationStatus,
  type ApplicationView,
  type MatchCategory,
  type ReferralStatus,
} from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { isIncomplete } from "@/features/ingestion/schema";
import type { JobScoreAnalysis } from "@/db/schema";

/**
 * Make a stored analysis safe to render.
 *
 * Rows written before the parser normalised its input can hold an object where
 * a string belongs — Gemini once returned the CV summary object under
 * `analysis.summary`, which React refuses to render and which took the whole
 * workspace down with a 500. Reading is the last line of defence, so it
 * coerces rather than trusting what was written.
 */
function safeAnalysis(
  analysis: JobScoreAnalysis | null,
): JobScoreAnalysis | null {
  if (!analysis) return null;

  const str = (value: unknown): string | undefined => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const nested = (value as Record<string, unknown>).summary;
      if (typeof nested === "string") return nested;
      return undefined;
    }
    return undefined;
  };

  const strList = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "string" ? v : str(v) ?? "")).filter(Boolean)
      : undefined;

  return {
    ...analysis,
    summary: str(analysis.summary),
    strengths: strList(analysis.strengths),
    gaps: strList(analysis.gaps),
    visaSignals: strList(analysis.visaSignals),
    finalCalculation: str(analysis.finalCalculation),
    exceptions: strList(analysis.exceptions),
  };
}

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

/**
 * Pull the preferred city out of a stored pre-qualification verdict.
 *
 * Defensive because the column is jsonb written by an earlier version of the
 * engine: an older or hand-edited row must render, not crash the list.
 */
function preferredCityOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const location = (detail as { location?: unknown }).location;
  if (!location || typeof location !== "object") return null;
  const city = (location as { preferredCity?: unknown }).preferredCity;
  return typeof city === "string" ? city : null;
}

export type ApplicationListItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  country: string | null;
  source: string;
  /** JSV2S1138 — set when the job sits in a city on the preferred list. */
  preferredCity: string | null;
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
  /** JSV2S1158 — the ingestion run this job arrived in, if it has one. */
  ingestionRunId: string | null;
  /**
   * When the job entered the system. `prequalifiedAt` where the gate has run,
   * otherwise `firstSeenAt` — a manually uploaded job predating the gate still
   * has an arrival date worth showing.
   */
  ingestedAt: Date | null;
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

/**
 * Faceted filtering of the applications list (JSV2S1159).
 *
 * The same interaction as the pre-qualification queue, asked of a different
 * subject: not "why was this screened out" but "which of these needs a
 * referral, and which fetch did they come from".
 *
 * Selections WITHIN a facet are OR-ed, ACROSS facets AND-ed — "priority apply
 * AND referral needed" has to mean both.
 */
export type ApplicationSelections = Record<string, string[]>;

export type ApplicationFilters = {
  view?: ApplicationView;
  selections?: ApplicationSelections;
  /** Inclusive bounds on when the job was ingested, as YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

/** `to` is inclusive: compared against the start of the following day. */
function ingestedRange(from?: string | null, to?: string | null) {
  const clauses = [];
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      clauses.push(gte(sql`coalesce(${rawJobs.prequalifiedAt}, ${rawJobs.firstSeenAt})`, start));
    }
  }
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(end.getTime())) {
      end.setDate(end.getDate() + 1);
      clauses.push(lt(sql`coalesce(${rawJobs.prequalifiedAt}, ${rawJobs.firstSeenAt})`, end));
    }
  }
  return clauses.length > 0 ? and(...clauses) : undefined;
}

function applicationSelectionFilters(selections?: ApplicationSelections) {
  if (!selections) return [];
  const clauses = [];

  // Narrowed against the known vocabulary rather than passed through: these
  // values arrive from the URL, and an unrecognised one should filter to
  // nothing rather than reach the query.
  const match = (selections.match ?? []).filter((v): v is MatchCategory =>
    MATCH_CATEGORIES.includes(v as MatchCategory),
  );
  if (match.length) clauses.push(inArray(applications.matchCategory, match));

  const referral = (selections.referral ?? []).filter((v): v is ReferralStatus =>
    REFERRAL_STATUSES.includes(v as ReferralStatus),
  );
  if (referral.length) clauses.push(inArray(applications.referralStatus, referral));
  if (selections.source?.length) {
    clauses.push(inArray(rawJobs.source, selections.source));
  }
  if (selections.country?.length) {
    clauses.push(inArray(rawJobs.country, selections.country));
  }
  if (selections.company?.length) {
    clauses.push(inArray(rawJobs.company, selections.company));
  }
  if (selections.fetch?.length) {
    clauses.push(inArray(rawJobs.ingestionRunId, selections.fetch));
  }
  return clauses;
}

function applicationSearch(search?: string | null) {
  const q = search?.trim();
  if (!q) return undefined;
  // Escaped so a literal % or _ cannot become a wildcard matching everything.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return or(ilike(rawJobs.title, `%${safe}%`), ilike(rawJobs.company, `%${safe}%`));
}

export async function listApplications(
  viewOrFilters: ApplicationView | ApplicationFilters = "all",
): Promise<ApplicationListItem[]> {
  const f: ApplicationFilters =
    typeof viewOrFilters === "string" ? { view: viewOrFilters } : viewOrFilters;
  const view = f.view ?? "all";
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
      prequalificationDetail: rawJobs.prequalificationDetail,
      jobUrl: rawJobs.jobUrl,
      description: rawJobs.description,
      // JSV2S1158 — which fetch brought this job in, and when it was judged.
      // Without these an application cannot be traced back to its batch.
      ingestionRunId: rawJobs.ingestionRunId,
      prequalifiedAt: rawJobs.prequalifiedAt,
      firstSeenAt: rawJobs.firstSeenAt,
      isPending: pendingPredicate(),
      hasResume,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        viewFilter(view),
        ...applicationSelectionFilters(f.selections),
        ingestedRange(f.from, f.to),
        applicationSearch(f.search),
      ),
    )
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
      // Read from the stored verdict rather than recomputed: the value shown
      // must be the one the gate actually decided on, not what today's config
      // would say.
      preferredCity: preferredCityOf(row.prequalificationDetail),
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
      ingestionRunId: row.ingestionRunId,
      // Prefer the gate's timestamp; fall back to first sighting for jobs that
      // predate pre-qualification.
      ingestedAt: row.prequalifiedAt ?? row.firstSeenAt,
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
    jobScoreAnalysis: safeAnalysis(row.application.jobScoreAnalysis),
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


/**
 * Facet values for the applications filter panel (JSV2S1159).
 *
 * Counted within the current view but ignoring the other selections, so a
 * checkbox always shows how many it would add. Counts that collapsed as boxes
 * were ticked would make the panel unusable.
 */
export async function getApplicationFacets(
  view: ApplicationView = "all",
): Promise<Record<string, { value: string; label: string; count: number }[]>> {
  const rows = await db
    .select({
      match: applications.matchCategory,
      referral: applications.referralStatus,
      source: rawJobs.source,
      country: rawJobs.country,
      company: rawJobs.company,
      fetch: rawJobs.ingestionRunId,
      fetchSource: ingestionRuns.source,
      fetchStartedAt: ingestionRuns.startedAt,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .leftJoin(ingestionRuns, eq(ingestionRuns.id, rawJobs.ingestionRunId))
    .where(viewFilter(view));

  const tally = (
    values: (string | null)[],
    label: (v: string) => string,
  ): { value: string; label: string; count: number }[] => {
    const m = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([value, count]) => ({ value, label: label(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  // A run id is unreadable alone, so each is labelled with its source and date.
  const runs = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    if (!row.fetch) continue;
    const seen = runs.get(row.fetch);
    if (seen) {
      seen.count += 1;
      continue;
    }
    runs.set(row.fetch, {
      label: `${row.fetchSource ?? "unknown"} · ${
        row.fetchStartedAt ? row.fetchStartedAt.toISOString().slice(0, 10) : "—"
      } · ${row.fetch.slice(0, 8)}`,
      count: 1,
    });
  }

  return {
    match: tally(
      rows.map((r) => r.match),
      (v) => MATCH_LABELS[v as MatchCategory] ?? v,
    ),
    referral: tally(
      rows.map((r) => r.referral),
      (v) => REFERRAL_LABELS[v as ReferralStatus] ?? v,
    ),
    source: tally(
      rows.map((r) => r.source),
      (v) => v,
    ),
    country: tally(
      rows.map((r) => r.country),
      (v) => v,
    ),
    /**
     * Company (2026-09-19, owner's request).
     *
     * Matched on the exact stored string rather than normalised, because this
     * facet's whole job is to return the rows you can see — a label that did
     * not match a row's own `company` verbatim would be a checkbox whose count
     * disagreed with its result.
     */
    company: tally(
      rows.map((r) => r.company),
      (v) => v,
    ),
    fetch: [...runs.entries()]
      .map(([value, r]) => ({ value, label: r.label, count: r.count }))
      .sort((a, b) => b.count - a.count),
  };
}
