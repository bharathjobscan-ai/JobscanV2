import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { CITIES, cityForJob, type City } from "@/config/cities";
import { applications, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";

/**
 * The city landing page's numbers (JSV2S1172).
 *
 * One query for all eight cities rather than eight queries: the database is on
 * another continent and a per-card round trip is how a grid of eight becomes a
 * two-second page.
 *
 * Grouping happens in code rather than SQL because the city of a job is decided
 * by `cityForJob` — the same resolution the gate used — and re-expressing that
 * as a set of LIKE clauses would create a second definition of "where is this
 * job" that could quietly disagree with the first.
 */

export type CitySummary = {
  city: City;
  /** Applications not yet applied to — the number the card leads with. */
  readyToday: number;
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

  const rows = await db
    .select({
      preferredCity: sql<string | null>`${rawJobs.prequalificationDetail}->'location'->>'preferredCity'`,
      location: rawJobs.location,
      status: applications.status,
      jobScore: applications.jobScore,
      ingestedAt: sql<Date | null>`coalesce(${rawJobs.prequalifiedAt}, ${rawJobs.firstSeenAt})`,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(rawJobs.id, applications.rawJobId))
    .where(isNull(rawJobs.binnedAt));

  const empty = (): Omit<CitySummary, "city"> => ({
    readyToday: 0,
    inPlay: 0,
    fresh: 0,
    bestScore: null,
    total: 0,
    lastSeenAt: null,
  });

  const acc = new Map<string, Omit<CitySummary, "city">>(
    CITIES.map((c) => [c.id, empty()]),
  );

  for (const row of rows) {
    const city = cityForJob(row.preferredCity, row.location);
    if (!city) continue;
    const bucket = acc.get(city.id);
    if (!bucket) continue;

    bucket.total += 1;
    if (row.status === "ready_to_apply") bucket.readyToday += 1;
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
  return CITIES.map((city) => ({ city, ...acc.get(city.id)! })).sort(
    (a, b) =>
      b.readyToday - a.readyToday ||
      (b.bestScore ?? -1) - (a.bestScore ?? -1) ||
      b.total - a.total,
  );
}
