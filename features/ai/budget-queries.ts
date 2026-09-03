import { and, eq, gte, isNotNull } from "drizzle-orm";

import { aiJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { budgetStatus, type BudgetStatus, type PricedRun } from "./budget";

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

async function runsSince(since: Date): Promise<PricedRun[]> {
  return db
    .select({ model: aiJobs.model, usage: aiJobs.usage })
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
  const [today, month] = await Promise.all([
    runsSince(startOfDay(now)),
    runsSince(startOfMonth(now)),
  ]);
  return budgetStatus(today, month);
}

export type { BudgetStatus } from "./budget";
