import { and, asc, eq, isNotNull } from "drizzle-orm";

import { aiJobs } from "@/db/schema";
import { db } from "@/lib/db/client";
import { summariseRuns, type ApplicationCost } from "./cost";

export type { ApplicationCost, CostGroup, CostableRun, RunCost } from "./cost";
export { summariseRuns } from "./cost";

/**
 * JSV2S1132 — the database half. All costing rules live in ./cost.ts, which
 * imports no database client so `npm test` can exercise them without one.
 */
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

  return summariseRuns(rows);
}
