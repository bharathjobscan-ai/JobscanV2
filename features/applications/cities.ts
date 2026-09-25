import { eq, isNull, sql } from "drizzle-orm";

import { CARDS, CITIES, type City } from "@/config/cities";
import { applications, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { cityKeySql } from "@/features/applications/queries";
import { todayWindow } from "@/features/ingestion/run-outcomes";

/**
 * The city landing page's numbers (JSV2S1172).
 *
 * One query for all eight cities rather than eight queries: the database is on
 * another continent and a per-card round trip is how a grid of eight becomes a
 * two-second page.
 *
 * The card a job sits on is `cityKeySql` — the same expression the city table
 * filters by, so a card's count and the table it opens cannot disagree. It was
 * `cityForJob` in code until 2026-09-24, a second definition that had already
 * drifted from the SQL one.
 */

export type CitySummary = {
  city: City;
  /**
   * Applications not yet applied to — the number the card leads with. All of
   * them, whenever they arrived: this was once called `readyToday` and the card
   * said "ready today", which it never was.
   */
  ready: number;
  /**
   * Applications created today (2026-09-24) — what today's run added, plus any
   * manual upload today. Keyed on `applications.created_at` rather than the
   * raw job's arrival, because since D1 went conditional a scheduled run only
   * creates an application for a PASS, and this counts applications.
   * Same local-day window as the pipeline page, so the two agree on "today".
   */
  arrivedToday: number;
  /** Applied, shortlisted, interviewing: live conversations. */
  inPlay: number;
  /** Arrived in the last seven days. */
  fresh: number;
  /** Best job score among this city's applications. */
  bestScore: number | null;
  total: number;
  /** When this city was last fetched, from its own ingestion runs. */
  lastSeenAt: Date | null;
};

const IN_PLAY = ["applied", "shortlisted", "interview", "offer"];

export async function getCitySummaries(): Promise<CitySummary[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = todayWindow();

  const rows = await db
    .select({
      cityKey: cityKeySql,
      status: applications.status,
      jobScore: applications.jobScore,
      createdAt: applications.createdAt,
      ingestedAt: sql<Date | null>`coalesce(${rawJobs.prequalifiedAt}, ${rawJobs.firstSeenAt})`,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(rawJobs.id, applications.rawJobId))
    .where(isNull(rawJobs.binnedAt));

  const empty = (): Omit<CitySummary, "city"> => ({
    ready: 0,
    arrivedToday: 0,
    inPlay: 0,
    fresh: 0,
    bestScore: null,
    total: 0,
    lastSeenAt: null,
  });

  const acc = new Map<string, Omit<CitySummary, "city">>(
    CARDS.map((c) => [c.id, empty()]),
  );

  for (const row of rows) {
    const bucket = acc.get(row.cityKey);
    if (!bucket) continue;

    bucket.total += 1;
    if (row.status === "ready_to_apply") bucket.ready += 1;
    if (row.createdAt >= today.start && row.createdAt < today.end) bucket.arrivedToday += 1;
    if (IN_PLAY.includes(row.status)) bucket.inPlay += 1;

    const at = row.ingestedAt ? new Date(row.ingestedAt) : null;
    if (at && at >= weekAgo) bucket.fresh += 1;
    if (at && (!bucket.lastSeenAt || at > bucket.lastSeenAt)) bucket.lastSeenAt = at;

    if (row.jobScore !== null) {
      bucket.bestScore = Math.max(bucket.bestScore ?? 0, row.jobScore);
    }
  }

  /*
   * Ordered by what is actionable, not alphabetically. The card you want is
   * almost always the one with jobs ready to apply to, and a fixed alphabetical
   * grid buries London behind Amsterdam and Berlin on every visit.
   */
  const cities = CITIES.map((city) => ({ city, ...acc.get(city.id)! })).sort(
    (a, b) =>
      b.ready - a.ready ||
      (b.bestScore ?? -1) - (a.bestScore ?? -1) ||
      b.total - a.total,
  );

  /*
   * Remote and Other always come after the cities, however many jobs they
   * hold: they are where a job goes when it names no target city, not places
   * being targeted. Remote is always shown, because it was asked for as a
   * standing card. Other is shown only when it holds something, since an
   * empty card reading "no target city named" would say nothing.
   */
  const extras = CARDS.filter((c) => c.kind !== "city")
    .map((city) => ({ city, ...acc.get(city.id)! }))
    .filter((s) => s.city.kind === "remote" || s.total > 0);

  return [...cities, ...extras];
}
