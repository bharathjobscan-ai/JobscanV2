import { and, eq, isNull } from "drizzle-orm";

import { applicationEvents, applications, rawJobs } from "@/db/schema";
import { CONFIG_VERSION } from "@/config/prequalification";
import { db } from "@/lib/db/client";
import { prequalify } from "./engine";

export class ReviewJobNotFound extends Error {}
export class AlreadyPromoted extends Error {}

/**
 * Promote a screened-out job into an application (JSV2S1038).
 *
 * The gate is deliberately overridable: it is a cost control, not an authority.
 * When it turns away a job you can see is right, one click should be enough,
 * and the verdict is kept alongside so the decision to override stays visible.
 */
export async function promoteJob(rawJobId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(rawJobs)
      .where(eq(rawJobs.id, rawJobId))
      .limit(1);

    if (!job) throw new ReviewJobNotFound(`No job ${rawJobId}.`);

    const [existing] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.rawJobId, rawJobId))
      .limit(1);

    // `applications.rawJobId` is unique, so a double promote would throw a
    // constraint error rather than a readable one.
    if (existing) throw new AlreadyPromoted(`Job ${rawJobId} already has an application.`);

    const [app] = await tx
      .insert(applications)
      .values({ rawJobId, status: "ready_to_apply" })
      .returning({ id: applications.id });

    await tx.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "application_created",
      toStatus: "ready_to_apply",
      summary: `Promoted from ${job.prequalification ?? "review"} — ${job.title} at ${job.company}`,
      metadata: {
        promotedFrom: job.prequalification,
        prequalificationVersion: job.prequalificationVersion,
      },
    });

    return app.id;
  });
}

/**
 * Mark a job rejected by hand.
 *
 * Recorded as a `reject` verdict with a synthetic detail block so the reason
 * shows the same way an engine rejection does — the review queue should not
 * need to care which of you made the call.
 */
export async function rejectJob(rawJobId: string, reason?: string): Promise<void> {
  const [job] = await db
    .select({ id: rawJobs.id, detail: rawJobs.prequalificationDetail })
    .from(rawJobs)
    .where(eq(rawJobs.id, rawJobId))
    .limit(1);

  if (!job) throw new ReviewJobNotFound(`No job ${rawJobId}.`);

  const detail = (job.detail ?? {}) as Record<string, unknown>;

  await db
    .update(rawJobs)
    .set({
      prequalification: "reject",
      prequalificationDetail: {
        ...detail,
        decision: "reject",
        decidedBy: null,
        reason: reason?.trim() || "Rejected manually.",
        manualOverride: true,
      },
      prequalifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(rawJobs.id, rawJobId));
}

/**
 * Give a verdict to jobs ingested before the gate existed.
 *
 * Deliberately separate from `requalifyStale`, and deliberately willing to touch
 * jobs that already have an application: the two do different things. Gating is
 * a decision already made for a promoted job and must not be revisited, but the
 * *verdict record* is informational — it drives the preferred-city highlight and
 * the explanation shown in the workspace. Withholding it from existing jobs
 * would mean the feature only ever worked on data ingested after today.
 *
 * Never creates, deletes or alters an application.
 */
export async function backfillVerdicts(limit = 1000): Promise<{
  evaluated: number;
  byDecision: Record<string, number>;
  preferredCities: number;
}> {
  const jobs = await db
    .select()
    .from(rawJobs)
    .where(isNull(rawJobs.prequalification))
    .limit(limit);

  const byDecision: Record<string, number> = {};
  let preferredCities = 0;

  for (const job of jobs) {
    const verdict = prequalify({
      title: job.title,
      company: job.company,
      location: job.location,
      country: job.country,
      description: job.description,
    });

    byDecision[verdict.decision] = (byDecision[verdict.decision] ?? 0) + 1;
    if (verdict.location.preferredCity) preferredCities += 1;

    await db
      .update(rawJobs)
      .set({
        prequalification: verdict.decision,
        prequalificationDetail: verdict,
        prequalifiedAt: new Date(verdict.evaluatedAt),
        prequalificationVersion: verdict.configVersion,
        updatedAt: new Date(),
      })
      .where(eq(rawJobs.id, job.id));
  }

  return { evaluated: jobs.length, byDecision, preferredCities };
}

/**
 * Re-evaluate jobs whose verdict predates the current config.
 *
 * The reason `prequalification_version` is stored at all: widening the role list
 * or adding a country should let previously-turned-away jobs be reconsidered
 * without re-ingesting anything. Only unpromoted jobs are touched — an existing
 * application is a decision already made.
 */
export async function requalifyStale(limit = 500): Promise<{ evaluated: number; nowPassing: number }> {
  const rows = await db
    .select({ job: rawJobs })
    .from(rawJobs)
    .leftJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(isNull(applications.id))
    .limit(limit);

  const stale = rows
    .map((r) => r.job)
    .filter((job) => job.prequalificationVersion !== CONFIG_VERSION);

  let nowPassing = 0;

  for (const job of stale) {
    const verdict = prequalify({
      title: job.title,
      company: job.company,
      location: job.location,
      country: job.country,
      description: job.description,
    });
    if (verdict.decision === "pass") nowPassing += 1;

    await db
      .update(rawJobs)
      .set({
        prequalification: verdict.decision,
        prequalificationDetail: verdict,
        prequalifiedAt: new Date(verdict.evaluatedAt),
        prequalificationVersion: verdict.configVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(rawJobs.id, job.id)));
  }

  return { evaluated: stale.length, nowPassing };
}
