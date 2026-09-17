import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { aiJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { summariseRuns, type ApplicationCost } from "./cost";
import { billableGroundedRunIds } from "./grounding";

export type { ApplicationCost, CostGroup, CostableRun, RunCost } from "./cost";
export { summariseRuns } from "./cost";

/**
 * JSV2S1132 — the database half. All costing rules live in ./cost.ts, which
 * imports no database client so `npm test` can exercise them without one.
 */
/**
 * Grounded runs this month that fell past the free allowance (JSV2S1131).
 *
 * Billability is a property of a run's *position* in the month, not of the run
 * itself, so the whole month has to be ordered before any single application
 * can be priced. One small query — the id and finish time only.
 */
async function billableGroundingThisMonth(
  now = new Date(),
): Promise<ReadonlySet<string>> {
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const grounded = await db
    .select({ id: aiJobs.id, finishedAt: aiJobs.finishedAt })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.allowedTools, "GoogleSearch"),
        eq(aiJobs.status, "succeeded"),
        gte(aiJobs.finishedAt, monthStart),
      ),
    );

  return billableGroundedRunIds(grounded);
}

export async function getApplicationCost(
  applicationId: string,
): Promise<ApplicationCost> {
  const rows = await db
    .select({
      id: aiJobs.id,
      taskType: aiJobs.taskType,
      provider: aiJobs.provider,
      model: aiJobs.model,
      allowedTools: aiJobs.allowedTools,
      usage: aiJobs.usage,
      finishedAt: aiJobs.finishedAt,
    })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.applicationId, applicationId),
        eq(aiJobs.status, "succeeded"),
        isNotNull(aiJobs.finishedAt),
      ),
    )
    .orderBy(asc(aiJobs.finishedAt));

  return summariseRuns(rows, await billableGroundingThisMonth());
}

/**
 * JSV2S1141 — cost for many applications in ONE query.
 *
 * The list view shows spend per row, and calling `getApplicationCost` per row
 * would be an N+1 against a database on another continent. One `in` query and
 * an in-memory group instead; the aggregation is the same pure function, so the
 * list and the detail view can never report different numbers.
 */
export async function getApplicationCosts(
  applicationIds: string[],
): Promise<Map<string, ApplicationCost>> {
  const result = new Map<string, ApplicationCost>();
  if (applicationIds.length === 0) return result;

  const rows = await db
    .select({
      applicationId: aiJobs.applicationId,
      id: aiJobs.id,
      taskType: aiJobs.taskType,
      provider: aiJobs.provider,
      model: aiJobs.model,
      allowedTools: aiJobs.allowedTools,
      usage: aiJobs.usage,
      finishedAt: aiJobs.finishedAt,
    })
    .from(aiJobs)
    .where(
      and(
        inArray(aiJobs.applicationId, applicationIds),
        eq(aiJobs.status, "succeeded"),
        isNotNull(aiJobs.finishedAt),
      ),
    )
    .orderBy(asc(aiJobs.finishedAt));

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.applicationId) ?? [];
    list.push(row);
    grouped.set(row.applicationId, list);
  }

  // Looked up once for the whole page, not per application — and shared with
  // the detail view's rule so the list total can never disagree with the row.
  const billable = await billableGroundingThisMonth();

  // Every requested id gets an entry, so the caller never has to distinguish
  // "no spend" from "not looked up".
  for (const id of applicationIds) {
    result.set(id, summariseRuns(grouped.get(id) ?? [], billable));
  }
  return result;
}
