import { and, desc, eq, gte, isNotNull } from "drizzle-orm";

import { applications, rawJobs } from "@/db/schema";
import { db } from "@/lib/db/client";

/** Reads for the daily digest (JSV2S1043). */

export type ScoredHighlight = {
  title: string;
  company: string;
  score: number;
  preferredCity: string | null;
};

function preferredCityOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const location = (detail as { location?: unknown }).location;
  if (!location || typeof location !== "object") return null;
  const city = (location as { preferredCity?: unknown }).preferredCity;
  return typeof city === "string" ? city : null;
}

/**
 * The best of what was scored in the last day.
 *
 * Ordered by score rather than recency: the digest's job is to answer "is there
 * anything here worth my morning?", and a chronological list buries the answer.
 */
export async function listRecentlyScored(
  limit = 5,
  since = new Date(Date.now() - 24 * 60 * 60 * 1000),
): Promise<ScoredHighlight[]> {
  const rows = await db
    .select({
      title: rawJobs.title,
      company: rawJobs.company,
      score: applications.jobScore,
      detail: rawJobs.prequalificationDetail,
    })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(
      and(
        isNotNull(applications.jobScore),
        gte(applications.jobScoreGeneratedAt, since),
      ),
    )
    .orderBy(desc(applications.jobScore))
    .limit(limit);

  return rows
    .filter((r): r is typeof r & { score: number } => r.score !== null)
    .map((r) => ({
      title: r.title,
      company: r.company,
      score: r.score,
      preferredCity: preferredCityOf(r.detail),
    }));
}
