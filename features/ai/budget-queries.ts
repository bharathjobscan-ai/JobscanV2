import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

import { aiJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { budgetStatus, type BudgetStatus, type PricedRun } from "./budget";
import { groundingUsage, type GroundingUsage } from "./grounding";

/**
 * The database half of the spend ceiling (JSV2S1137).
 *
 * Cost is recomputed from stored token counts rather than read from a cached
 * total, so a ceiling can never be defeated by a stale aggregate.
 */

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(now: Date): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function runsSince(
  since: Date,
): Promise<(PricedRun & { finishedAt: Date | null })[]> {
  return db
    .select({ model: aiJobs.model, usage: aiJobs.usage, finishedAt: aiJobs.finishedAt })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.status, "succeeded"),
        isNotNull(aiJobs.usage),
        gte(aiJobs.finishedAt, since),
      ),
    );
}

export async function getBudgetStatus(now = new Date()): Promise<BudgetStatus> {
  // One query, not two: the day's runs are a subset of the month's, so fetching
  // the month and partitioning in memory costs one round trip instead of two.
  const dayStart = startOfDay(now);
  const month = await runsSince(startOfMonth(now));
  const today = month.filter((r) => r.finishedAt !== null && r.finishedAt >= dayStart);
  return budgetStatus(today, month);
}

/**
 * Grounded requests made this calendar month (JSV2S1131).
 *
 * Counted from `allowed_tools`, which is stamped on the run at the moment the
 * call is made — the same field `cost.ts` uses — so the count cannot drift from
 * what was actually requested.
 *
 * Deliberately counts every grounded run regardless of outcome cost: the
 * allowance is consumed per *request*, so a run that returned nothing useful
 * still spent one.
 */
export async function getGroundingUsage(now = new Date()): Promise<GroundingUsage> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.allowedTools, "GoogleSearch"),
        eq(aiJobs.status, "succeeded"),
        gte(aiJobs.finishedAt, startOfMonth(now)),
      ),
    );

  return groundingUsage(row?.count ?? 0);
}

export type { BudgetStatus } from "./budget";
export type { GroundingUsage } from "./grounding";
