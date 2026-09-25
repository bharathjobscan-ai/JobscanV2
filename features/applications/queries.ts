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
  isNull,
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
import { LENS_WEIGHTS } from "@/config/simg";
import { CITIES } from "@/config/cities";
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
import { runLabel } from "@/features/ingestion/run-label";
import { db } from "@/lib/db/client";
import { isIncomplete } from "@/features/ingestion/schema";
import {
  VISA_LABELS,
  VISA_STATUSES,
  visaStatusOf,
  visaStatusPredicate,
  watchlistTierSql,
  type VisaStatus,
} from "@/features/applications/visa";
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

/**
 * The resume's own score, for the list's second column (JSV2S1172).
 *
 * A correlated subquery rather than a join: an application can hold several
 * resume versions and joining would multiply its row, which is how a list of
 * 91 quietly becomes a list of 140. `order by created_at desc limit 1` takes
 * the current one.
 *
 * The same figure the detail screen's score panel leads with — `project()`'s
 * `current`: the weighted lens composite plus the points of every accepted
 * recommendation, capped at 100. Computed here because SimG never stores a
 * composite; this once read `current->>'composite'`, a key nothing writes, so
 * the column showed a dash on every row (fixed 2026-09-24). The weights are
 * interpolated from `LENS_WEIGHTS` rather than restated, so the list and the
 * panel cannot drift apart when a weight changes.
 */
// The key is inlined, not bound: it comes from a fixed union, and a bound
// parameter leaves `->` ambiguous between its text and integer overloads.
const lensScore = (lens: keyof typeof LENS_WEIGHTS) =>
  sql`coalesce((${applicationDocuments.simg}->'current'->${sql.raw(`'${lens}'`)}->>'score')::numeric, 0) * ${LENS_WEIGHTS[lens]}::numeric`;

const resumeScore = sql<number | null>`(
  select case when ${applicationDocuments.simg} is null then null else least(
    100,
    round(${lensScore("ats")} + ${lensScore("recruiter")} + ${lensScore("hiringManager")})
      + coalesce((
        select sum((rec->>'points')::numeric)
        from jsonb_array_elements(${applicationDocuments.simg}->'recommendations') as rec
        where rec->>'state' = 'accepted'
      ), 0)
  )::int end
  from ${applicationDocuments}
  where ${applicationDocuments.applicationId} = ${applications.id}
    and ${applicationDocuments.docType} = 'resume'
  order by ${applicationDocuments.createdAt} desc
  limit 1
)`;

/** The watchlist tier the gate recorded, for the company column's star. */
const watchlistTier = watchlistTierSql;

/**
 * Which card a job sits on — the ONE definition (JSV2S1172, 2026-09-24).
 *
 * The grid's counts and the city table both read this expression, so they
 * cannot disagree. Before this there were two: `cityForJob` in code for the
 * grid and an OR of the same tests in SQL for the table. They drifted, and
 * neither had anywhere to put a job that named no target city.
 *
 * In order, first match wins:
 *  1. `remote`, when the gate read the posting as remote. This is first
 *     because the owner asked for remote jobs to have their own card. LinkedIn
 *     stamps a city on most remote roles ("London, England" on a remote PM
 *     post), and letting the city win would leave the Remote card empty;
 *  2. the city the gate resolved, then the city named in the location string —
 *     what the posting itself says;
 *  3. the city the fetch was looking for. Manchester's fetch returns postings
 *     that say only "United Kingdom", and those belong on Manchester's card
 *     rather than nowhere;
 *  4. `other` — uploads that name only a country, and towns outside the plan.
 *
 * City ids are inlined, not bound: they are config, and a CASE whose every
 * result is an untyped parameter gives Postgres nothing to infer a type from.
 */
const CITY_IDS = CITIES.map((c) => {
  if (!/^[a-z-]+$/.test(c.id)) throw new Error(`Unsafe city id: ${c.id}`);
  return c.id;
});
const cityIdList = sql.raw(CITY_IDS.map((id) => `'${id}'`).join(", "));
const fetchCity = sql`(
  select lower(split_part(${ingestionRuns.params}->'locations'->>0, ',', 1))
  from ${ingestionRuns}
  where ${ingestionRuns.id} = ${rawJobs.ingestionRunId}
)`;
const preferredCitySql = sql`lower(${rawJobs.prequalificationDetail}->'location'->>'preferredCity')`;

export const cityKeySql = sql<string>`(case
  when ${rawJobs.prequalificationDetail}->'location'->>'isRemote' = 'true' then 'remote'
  when ${preferredCitySql} in (${cityIdList}) then ${preferredCitySql}
  ${sql.join(
    CITY_IDS.map(
      (id) => sql`when lower(${rawJobs.location}) like ${sql.raw(`'%${id}%'`)} then ${sql.raw(`'${id}'`)}`,
    ),
    sql` `,
  )}
  when ${fetchCity} in (${cityIdList}) then ${fetchCity}
  else 'other'
end)`;

/**
 * Discarded applications leave every list (2026-09-24). Discard bins the job
 * and keeps the application, so every query rooted at applications has to
 * say so. The detail page is the exception: it still opens, and offers Restore.
 */
const notBinned = isNull(rawJobs.binnedAt);

export function cityPredicate(city: string | null | undefined) {
  if (!city) return undefined;
  return sql`${cityKeySql} = ${city.trim().toLowerCase()}`;
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
  /** SimG's composite for the current resume, where one has been evaluated. */
  resumeScore: number | null;
  /** 1-5 when the company is on the sponsorship watchlist, else null. */
  watchlistTier: number | null;
  /** JSV2S1173 — marked to revisit. */
  starred: boolean;
  nextAction: string;
  /** JSV2S1158 — the ingestion run this job arrived in, if it has one. */
  ingestionRunId: string | null;
  /**
   * When the job entered the system. `prequalifiedAt` where the gate has run,
   * otherwise `firstSeenAt` — a manually uploaded job predating the gate still
   * has an arrival date worth showing.
   */
  ingestedAt: Date | null;
  /** The posting's own date, `YYYY-MM-DD`, where the source gave one. */
  postedAt: string | null;
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
 *
 * Single-choice axes (`posted`, `visa`, `tier`, `minJob`, `minResume`) ride in
 * the same shape rather than getting a parallel parameter object: the city
 * panel reads and writes the whole set as URL parameters, and one vocabulary
 * means one place to validate it.
 */
export type ApplicationSelections = Record<string, string[]>;

/** The relative windows the city panel's two date selects offer. */
const RELATIVE_DAYS: Record<string, number> = {
  today: 0,
  "3d": 3,
  week: 7,
  month: 30,
};

export function relativeCutoff(key: string | undefined): string | null {
  if (!key || !(key in RELATIVE_DAYS)) return null;
  const at = new Date();
  at.setDate(at.getDate() - RELATIVE_DAYS[key]);
  return at.toISOString().slice(0, 10);
}

export type ApplicationFilters = {
  view?: ApplicationView;
  selections?: ApplicationSelections;
  /** Inclusive bounds on when the job was ingested, as YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

/**
 * `to` is inclusive: compared against the start of the following day.
 *
 * The bounds are bound as YYYY-MM-DD strings cast in SQL, not as JS `Date`s.
 * A raw `sql` expression carries no column type, so the driver had nothing to
 * encode a `Date` with and threw ERR_INVALID_ARG_TYPE mid-query — every date
 * range on this page was a 500 until 2026-09-23. The regex guard is what makes
 * the cast safe on a hand-edited URL.
 */
function ingestedRange(from?: string | null, to?: string | null) {
  const at = sql`coalesce(${rawJobs.prequalifiedAt}, ${rawJobs.firstSeenAt})`;
  const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const clauses = [];
  if (from && isDay(from)) clauses.push(sql`${at} >= ${from}::date`);
  if (to && isDay(to)) clauses.push(sql`${at} < ${to}::date + 1`);
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
  // JSV2S1173 — "show me only what I flagged" is the whole point of a star.
  if (selections.starred?.[0] === "yes") {
    clauses.push(isNotNull(applications.starredAt));
  }
  if (selections.company?.length) {
    clauses.push(inArray(rawJobs.company, selections.company));
  }
  if (selections.city?.length) {
    clauses.push(cityPredicate(selections.city[0])!);
  }
  if (selections.fetch?.length) {
    clauses.push(inArray(rawJobs.ingestionRunId, selections.fetch));
  }
  if (selections.location?.length) {
    clauses.push(inArray(rawJobs.location, selections.location));
  }

  // The posting's own date, which is not the ingest date `from`/`to` cover: a
  // month-old advert can arrive in this morning's fetch.
  const postedFrom = relativeCutoff(selections.posted?.[0]);
  if (postedFrom) clauses.push(gte(rawJobs.postedAt, postedFrom));

  const visa = selections.visa?.[0];
  if (visa && VISA_STATUSES.includes(visa as VisaStatus)) {
    clauses.push(visaStatusPredicate(visa as VisaStatus));
  }

  const tier = selections.tier?.[0];
  if (tier === "none") {
    clauses.push(sql`${watchlistTier} is null`);
  } else if (tier && /^[1-5]$/.test(tier)) {
    // "Tier 4 and above" — the watchlist is a confidence ordering, so a floor
    // is the only reading that makes the higher tiers reachable at all.
    clauses.push(sql`${watchlistTier} >= ${Number(tier)}`);
  }

  const minJob = Number(selections.minJob?.[0]);
  if (Number.isFinite(minJob) && minJob > 0) {
    clauses.push(gte(applications.jobScore, Math.trunc(minJob)));
  }

  const minResume = Number(selections.minResume?.[0]);
  if (Number.isFinite(minResume) && minResume > 0) {
    clauses.push(sql`${resumeScore} >= ${Math.trunc(minResume)}`);
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
      postedAt: rawJobs.postedAt,
      isPending: pendingPredicate(),
      hasResume,
      resumeScore,
      watchlistTier,
      starredAt: applications.starredAt,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        notBinned,
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
      resumeScore: row.resumeScore ?? null,
      watchlistTier: row.watchlistTier ?? null,
      starred: row.starredAt !== null,
      ingestionRunId: row.ingestionRunId,
      // Prefer the gate's timestamp; fall back to first sighting for jobs that
      // predate pre-qualification.
      ingestedAt: row.prequalifiedAt ?? row.firstSeenAt,
      postedAt: row.postedAt,
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

export async function countByView(
  city?: string | null,
): Promise<Record<ApplicationView, number>> {
  const pending = pendingPredicate();
  const where = and(notBinned, cityPredicate(city));
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      ready: sql<number>`count(*) filter (where ${applications.status} = 'ready_to_apply')::int`,
      pending: sql<number>`count(*) filter (where ${pending})::int`,
      active: sql<number>`count(*) filter (where ${applications.status} in ('applied','shortlisted','interview') and not ${pending})::int`,
      closed: sql<number>`count(*) filter (where ${applications.status} in ('offer','rejected_application','rejected_screening','rejected_interview','rejected_visa'))::int`,
    })
    .from(applications)
    // Joined even when no city is given: the predicate reads rawJobs columns,
    // and an inner join on a notNull unique FK cannot change the count.
    .innerJoin(rawJobs, eq(rawJobs.id, applications.rawJobId))
    .where(where);

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
export async function countIncomplete(city?: string | null): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        // Parenthesised: a bare OR inside AND bound as `a or (b and city)`, so
        // every job with no description counted toward every city.
        sql`(${rawJobs.description} is null or length(trim(${rawJobs.description})) < 50)`,
        notBinned,
        cityPredicate(city),
      ),
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
  city?: string | null,
): Promise<Record<string, { value: string; label: string; count: number }[]>> {
  const rows = await db
    .select({
      match: applications.matchCategory,
      referral: applications.referralStatus,
      source: rawJobs.source,
      country: rawJobs.country,
      company: rawJobs.company,
      location: rawJobs.location,
      tier: watchlistTier,
      fetch: rawJobs.ingestionRunId,
      fetchSource: ingestionRuns.source,
      fetchStartedAt: ingestionRuns.startedAt,
      fetchParams: ingestionRuns.params,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .leftJoin(ingestionRuns, eq(ingestionRuns.id, rawJobs.ingestionRunId))
    /*
     * Scoped to the city as well as the view (JSV2S1172).
     *
     * Without this the panel offered every value in the database: London's
     * filters listed "Netherlands (7)" and companies with no London job at
     * all, and ticking one returned nothing — which reads as a broken filter
     * rather than as an honest empty result. A facet must only offer what it
     * can return.
     */
    .where(and(notBinned, viewFilter(view), cityPredicate(city)));

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
      label: runLabel({
        id: row.fetch,
        source: row.fetchSource,
        startedAt: row.fetchStartedAt,
        params: row.fetchParams,
      }),
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
    /**
     * The locations inside this city (JSV2S1172).
     *
     * A city is a catchment, not a point — "London" holds Canary Wharf,
     * Shoreditch and a dozen hybrid phrasings, and the design's LOCATION select
     * is how you get from the one to the other.
     */
    location: tally(
      rows.map((r) => r.location),
      (v) => v,
    ),
    /*
     * Visa and watchlist are fixed vocabularies, so these carry counts rather
     * than membership — the select shows every state, including the empty ones,
     * because "Confirmed (0)" is information and a missing option is not.
     */
    visa: VISA_STATUSES.map((value) => ({
      value,
      label: VISA_LABELS[value],
      count: rows.filter(
        (r) => visaStatusOf({ watchlistTier: r.tier ?? null, matchCategory: r.match }) === value,
      ).length,
    })),
    fetch: [...runs.entries()]
      .map(([value, r]) => ({ value, label: r.label, count: r.count }))
      .sort((a, b) => b.count - a.count),
  };
}
