import { and, desc, eq, inArray, isNotNull, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { applications, ingestionRuns, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import type { IngestionRunStatus, IngestionTrigger } from "@/lib/config/constants";

/**
 * What became of the jobs each ingestion run brought in (JSV2S1158).
 *
 * The split between stamped and derived is the whole design, and it is not
 * arbitrary:
 *
 * **Stamped on `ingestion_runs` at ingest time** — fetched, inserted,
 * duplicates, rejected-at-validation. These are facts about what the run SAW,
 * and most of them concern rows that never became a `raw_jobs` record. A row
 * the validator refused leaves nothing behind to count later, so if it is not
 * recorded as it happens it is gone. (That is the reasoning already written on
 * the `ingestion_runs` schema.)
 *
 * **Derived here, live** — auto-qualified, force-qualified, needs review,
 * screened out, binned. These describe the CURRENT STATE of jobs that did land,
 * and that state keeps changing long after the run ends: a job is promoted from
 * the review queue on Tuesday, binned on Friday. Stamping them at ingest would
 * freeze a number that is wrong within the hour, and every later action would
 * have to remember to update a counter on a run it knows nothing about.
 *
 * So: counters for what cannot be recovered, derivation for what can.
 */

export type RunOutcome = {
  runId: string;
  source: string;
  trigger: IngestionTrigger;
  status: IngestionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;

  /** Stamped: rows the run handled, including those that never landed. */
  fetched: number;
  inserted: number;
  duplicates: number;
  /** Refused by the validator — no `raw_jobs` row exists for these. */
  rejectedAtValidation: number;
  /** What the run cost, stamped at close. Null for free sources (JSV2S1144). */
  costUsd: number | null;
  /**
   * Run cost divided by the applications it eventually produced.
   *
   * The number that matters, and it is NOT the per-job cost. A run that fetches
   * ten jobs of which one qualifies costs ten results to produce one
   * application, so the per-application cost is roughly ten times the per-job
   * cost. Reporting only the latter would flatter the funnel.
   *
   * Null while the run has produced no application — dividing by zero would
   * report an infinite cost for a run that may still be worth it.
   */
  costPerApplicationUsd: number | null;

  /** Derived: jobs that landed, by where they are now. */
  landed: number;
  /**
   * True when fetched does not equal landed + duplicates + rejected.
   *
   * The funnel should account for every fetched row. A gap means something was
   * lost between the actor and the database without being counted, which is
   * worth seeing rather than quietly tolerating.
   */
  reconciles: boolean;
  autoQualified: number;
  forceQualified: number;
  needsReview: number;
  screenedOut: number;
  binned: number;
};

/** The four piles the pipeline bar draws, for one span of time. */
export type PileSnapshot = {
  pass: number;
  review: number;
  reject: number;
  unevaluated: number;
};

export type RunOutcomes = {
  runs: RunOutcome[];
  /** Runs matching the window, ignoring pagination — the pager needs the total. */
  total: number;
  /**
   * Jobs with no run attribution — everything ingested before runs existed.
   *
   * Returned alongside the runs rather than fetched separately: the connection
   * pool holds three, and /pipeline was firing four queries in parallel. With
   * no pool-acquire timeout in postgres.js the fourth waits indefinitely, which
   * is the exact hang the pool comment warns about. Two counts that both read
   * raw_jobs belong in one round trip anyway.
   */
  unattributed: number;
  /**
   * Today's piles, by the day a job landed.
   *
   * Carried here rather than fetched by the page so it costs no extra round
   * trip: it is `count(*) filter (...)` over the same `raw_jobs` scan that
   * already produces `unattributed`.
   */
  today: PileSnapshot;
};

/** An instant span, half-open: `[start, end)`. */
export type RunWindow = { start: Date; end: Date };

export const RUN_RANGES = ["today", "yesterday", "week", "month", "custom"] as const;
export type RunRange = (typeof RUN_RANGES)[number];

export const RUN_RANGE_LABELS: Record<RunRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

/** How far a hand-picked range may reach. Beyond this the request is clamped. */
export const MAX_CUSTOM_RANGE_MONTHS = 2;

export const RUNS_PER_PAGE = 20;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local `YYYY-MM-DD`. `toISOString()` is UTC and shifts the day for most of the world. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Parsed as local midnight; `new Date("2026-09-24")` alone is UTC midnight,
  // which is the previous day west of Greenwich.
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayWindow(now: Date = new Date()): RunWindow {
  const start = startOfDay(now);
  return { start, end: addDays(start, 1) };
}

export type WindowResolution = {
  /** Null means no restriction — the whole history. */
  window: RunWindow | null;
  /** Echoed back to the custom-range inputs, already clamped. */
  from: string | null;
  to: string | null;
  /**
   * Set when the requested custom range was wider than the ceiling.
   *
   * Reported rather than applied silently: a page that quietly returns two
   * months of a six-month request looks like missing data, not like a limit.
   */
  clampedTo: string | null;
};

/**
 * Turn the URL into a window (2026-09-24).
 *
 * Pure and exported so the rule is testable without a database, and so the page
 * and the query cannot disagree about where "this week" starts. The week is
 * Monday-first, matching the date picker elsewhere in the app.
 */
export function resolveWindow(
  range: RunRange | null,
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): WindowResolution {
  const today = startOfDay(now);
  const none: WindowResolution = { window: null, from: null, to: null, clampedTo: null };

  switch (range) {
    case "today":
      return { ...none, window: todayWindow(now) };
    case "yesterday":
      return { ...none, window: { start: addDays(today, -1), end: today } };
    case "week": {
      // getDay() is Sunday-first; this week is Monday-first.
      const back = (today.getDay() + 6) % 7;
      return { ...none, window: { start: addDays(today, -back), end: addDays(today, 1) } };
    }
    case "month":
      return {
        ...none,
        window: {
          start: new Date(today.getFullYear(), today.getMonth(), 1),
          end: addDays(today, 1),
        },
      };
    case "custom": {
      const start = parseDay(from);
      if (!start) return none;
      const requested = parseDay(to) ?? today;
      const ceiling = new Date(
        start.getFullYear(),
        start.getMonth() + MAX_CUSTOM_RANGE_MONTHS,
        start.getDate(),
      );
      const tooWide = requested > ceiling;
      const end = tooWide ? ceiling : requested;
      return {
        window: { start, end: addDays(end, 1) },
        from: isoDay(start),
        to: isoDay(end),
        clampedTo: tooWide ? isoDay(end) : null,
      };
    }
    default:
      return none;
  }
}

/**
 * Bind instants as text and cast in SQL.
 *
 * A JS `Date` bound into a raw `sql` comparison throws at runtime: the
 * parameter carries no column type for postgres.js to infer from.
 */
function within(column: SQL | AnyColumn, w: RunWindow): SQL {
  return sql`${column} >= ${w.start.toISOString()}::timestamptz and ${column} < ${w.end.toISOString()}::timestamptz`;
}

export type RunOutcomesOptions = {
  /** Null fetches every run; the page passes today's window by default. */
  window?: RunWindow | null;
  limit?: number;
  offset?: number;
};

export async function getRunOutcomes({
  window = null,
  limit = RUNS_PER_PAGE,
  offset = 0,
}: RunOutcomesOptions = {}): Promise<RunOutcomes> {
  const windowed = window ? within(ingestionRuns.startedAt, window) : undefined;

  const runs = await db
    .select()
    .from(ingestionRuns)
    .where(windowed)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit)
    .offset(offset);

  /**
   * One grouped query for every run on the page, rather than one query per run.
   *
   * `filter (where ...)` does the counting in Postgres: pulling the jobs back
   * to count them in JavaScript would move thousands of rows across the wire to
   * produce six integers. Restricted to the ids actually shown, so paging back
   * through a year of runs does not re-aggregate the whole corpus each time.
   */
  const ids = runs.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          runId: rawJobs.ingestionRunId,
          landed: sql<number>`count(*)::int`,
          binned: sql<number>`count(*) filter (where ${rawJobs.binnedAt} is not null)::int`,
          // "Auto" and "force" are both promoted jobs; what separates them is
          // whether the GATE said yes or a human overrode it.
          autoQualified: sql<number>`count(*) filter (
            where ${rawJobs.binnedAt} is null
              and ${applications.id} is not null
              and ${rawJobs.prequalification} = 'pass'
          )::int`,
          forceQualified: sql<number>`count(*) filter (
            where ${rawJobs.binnedAt} is null
              and ${applications.id} is not null
              and ${rawJobs.prequalification} is distinct from 'pass'
          )::int`,
          needsReview: sql<number>`count(*) filter (
            where ${rawJobs.binnedAt} is null
              and ${applications.id} is null
              and ${rawJobs.prequalification} = 'review'
          )::int`,
          screenedOut: sql<number>`count(*) filter (
            where ${rawJobs.binnedAt} is null
              and ${applications.id} is null
              and ${rawJobs.prequalification} = 'reject'
          )::int`,
        })
        .from(rawJobs)
        .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
        .where(and(isNotNull(rawJobs.ingestionRunId), inArray(rawJobs.ingestionRunId, ids)))
        .groupBy(rawJobs.ingestionRunId)
    : [];

  const byRun = new Map(counts.map((c) => [c.runId, c]));

  const outcomes = runs.map((run) => {
    const c = byRun.get(run.id);
    return {
      runId: run.id,
      source: run.source,
      trigger: run.trigger,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      fetched: run.fetched,
      inserted: run.inserted,
      duplicates: run.duplicates,
      rejectedAtValidation: run.rejected,
      costUsd: run.costUsd === null ? null : Number(run.costUsd),
      costPerApplicationUsd: (() => {
        if (run.costUsd === null) return null;
        const produced = (c?.autoQualified ?? 0) + (c?.forceQualified ?? 0);
        return produced > 0 ? Number(run.costUsd) / produced : null;
      })(),
      landed: c?.landed ?? 0,
      autoQualified: c?.autoQualified ?? 0,
      forceQualified: c?.forceQualified ?? 0,
      needsReview: c?.needsReview ?? 0,
      screenedOut: c?.screenedOut ?? 0,
      binned: c?.binned ?? 0,
      // A run that fetched nothing trivially reconciles; only a real fetch is
      // held to the arithmetic.
      reconciles:
        run.fetched === 0 ||
        run.fetched === (c?.landed ?? 0) + run.duplicates + run.rejected,
    };
  });

  const meta = await getRunMeta(window);

  return { runs: outcomes, total: meta.total, unattributed: meta.unattributed, today: meta.today };
}

/**
 * The totals the page needs around the table, in ONE round trip.
 *
 * The run total (for the pager), the unattributed corpus and today's four piles
 * are three unrelated questions, but the pool has no acquire timeout and
 * /pipeline already issues three queries in parallel — so they travel together
 * rather than as three more. The run total rides as a scalar subquery on a
 * `raw_jobs` scan that was happening anyway.
 */
async function getRunMeta(window: RunWindow | null): Promise<{
  total: number;
  unattributed: number;
  today: PileSnapshot;
}> {
  const runFilter = window ? within(sql`started_at`, window) : sql`true`;
  const today = todayWindow();
  const landedToday = within(rawJobs.createdAt, today);
  // Binned jobs are excluded from every pile, as they are in the all-time
  // summary — a tile that disagreed with the queue it links to would be worse
  // than no tile (JSV2S1157).
  const live = sql`${rawJobs.binnedAt} is null`;

  const [row] = await db
    .select({
      total: sql<number>`(select count(*) from ${ingestionRuns} where ${runFilter})::int`,
      /**
       * Jobs with no run attribution — everything ingested before runs were
       * recorded. Surfaced rather than hidden: a per-run table that silently
       * omitted most of the corpus would be worse than no table, because the
       * totals would not reconcile with the queue counts and nothing would say
       * why.
       */
      unattributed: sql<number>`count(*) filter (where ${rawJobs.ingestionRunId} is null)::int`,
      pass: sql<number>`count(*) filter (where ${landedToday} and ${live} and ${rawJobs.prequalification} = 'pass')::int`,
      review: sql<number>`count(*) filter (where ${landedToday} and ${live} and ${rawJobs.prequalification} = 'review')::int`,
      reject: sql<number>`count(*) filter (where ${landedToday} and ${live} and ${rawJobs.prequalification} = 'reject')::int`,
      unevaluated: sql<number>`count(*) filter (where ${landedToday} and ${live} and ${rawJobs.prequalification} is null)::int`,
    })
    .from(rawJobs);

  return {
    total: row?.total ?? 0,
    unattributed: row?.unattributed ?? 0,
    today: {
      pass: row?.pass ?? 0,
      review: row?.review ?? 0,
      reject: row?.reject ?? 0,
      unevaluated: row?.unevaluated ?? 0,
    },
  };
}
