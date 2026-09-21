import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  applicationDocuments,
  applicationEvents,
  applications,
  rawJobs,
} from "@/db/schema";
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

/** Thrown when sending an application back would destroy paid work. */
export class ApplicationHasSpend extends Error {}

/**
 * Send an application back to the review or rejected pile (2026-09-21).
 *
 * The inverse of promote. A job with an application is invisible to every
 * review query — they are all rooted at `isNull(applications.id)` — so putting
 * it back in a pile means the application row has to go.
 *
 * **GUARDED, because `application_documents` and `application_events` cascade
 * on delete.** A tailored CV and cover letter cost roughly $0.35 to generate
 * and cannot be recovered; a score is a billed call. Silently destroying either
 * because a row moved piles would be the worst kind of data loss — invisible,
 * and paid for. So an application carrying documents or a score refuses, and
 * the caller is told to use the Bin instead, which keeps everything.
 *
 * The verdict itself is preserved and marked as a manual override, exactly as
 * `rejectJob` does, so the audit trail says a person decided this rather than
 * the gate.
 */
export async function demoteApplication(
  applicationId: string,
  to: "review" | "reject",
  reason?: string,
): Promise<{ rawJobId: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        applicationId: applications.id,
        rawJobId: applications.rawJobId,
        jobScore: applications.jobScore,
        title: rawJobs.title,
        company: rawJobs.company,
        detail: rawJobs.prequalificationDetail,
      })
      .from(applications)
      .innerJoin(rawJobs, eq(rawJobs.id, applications.rawJobId))
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!row) throw new ReviewJobNotFound(`No application ${applicationId}.`);

    const [docs] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, applicationId));

    if ((docs?.n ?? 0) > 0 || row.jobScore !== null) {
      throw new ApplicationHasSpend(
        `${row.title} at ${row.company} already has ${
          (docs?.n ?? 0) > 0 ? "generated documents" : "a score"
        }. Sending it back would delete them. Use the Bin, which keeps everything.`,
      );
    }

    const detail = (row.detail ?? {}) as Record<string, unknown>;

    await tx
      .update(rawJobs)
      .set({
        prequalification: to,
        prequalificationDetail: {
          ...detail,
          decision: to,
          decidedBy: null,
          reason:
            reason?.trim() ||
            (to === "review"
              ? "Sent back to review by hand."
              : "Discarded by hand from the applications list."),
          manualOverride: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(rawJobs.id, row.rawJobId));

    // Last, so a failure above leaves the application intact rather than
    // orphaning a job that the review queue still cannot see.
    await tx.delete(applications).where(eq(applications.id, applicationId));

    return { rawJobId: row.rawJobId };
  });
}

/**
 * Re-judge jobs that ALREADY have an application (2026-09-19, owner's request).
 *
 * Deliberately separate from `requalifyStale`, which skips promoted jobs
 * entirely, and deliberately narrower than it: this updates the verdict record
 * and nothing else.
 *
 * **It never creates, deletes, revokes or un-promotes an application.** A job
 * that now reads `reject` keeps its application and stays in the workspace. The
 * gate exists to decide what to spend money on, and for these jobs that
 * decision was already taken — often by the owner, by hand. Re-running the
 * rules is allowed to change what we *know* about a job, never to reach back
 * and undo what was done about it.
 *
 * TWO SIDE EFFECTS, both intended, both worth stating because neither is
 * visible from the call site:
 *
 * 1. **A job whose decision becomes `reject` stops being scored.** The nightly
 *    pass selects `prequalification = 'pass'`. That is the right outcome — a
 *    posting that explicitly refuses sponsorship should not be paid to score —
 *    but it is a behaviour change, so the result reports the count.
 * 2. **An unscored application at a watchlist company becomes
 *    `gate_qualified`.** Only where there is no score and no category yet: an
 *    existing score's band is real and must not be overwritten by a state that
 *    means "no score exists".
 */
export async function requalifyPromoted(limit = 1000): Promise<{
  evaluated: number;
  changed: number;
  nowRejecting: number;
  markedGateQualified: number;
  byDecision: Record<string, number>;
}> {
  const rows = await db
    .select({
      job: rawJobs,
      applicationId: applications.id,
      jobScore: applications.jobScore,
      matchCategory: applications.matchCategory,
    })
    .from(rawJobs)
    .innerJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .limit(limit);

  const stale = rows.filter((r) => r.job.prequalificationVersion !== CONFIG_VERSION);

  const byDecision: Record<string, number> = {};
  let changed = 0;
  let nowRejecting = 0;
  let markedGateQualified = 0;

  for (const row of stale) {
    const job = row.job;
    const verdict = prequalify({
      title: job.title,
      company: job.company,
      location: job.location,
      country: job.country,
      description: job.description,
    });

    byDecision[verdict.decision] = (byDecision[verdict.decision] ?? 0) + 1;
    if (verdict.decision !== job.prequalification) changed += 1;
    if (verdict.decision === "reject") nowRejecting += 1;

    const markable =
      verdict.watchlist?.skipsScoring &&
      row.jobScore === null &&
      row.matchCategory === null;
    if (markable) markedGateQualified += 1;

    await db.transaction(async (tx) => {
      await tx
        .update(rawJobs)
        .set({
          prequalification: verdict.decision,
          prequalificationDetail: verdict,
          prequalifiedAt: new Date(verdict.evaluatedAt),
          prequalificationVersion: verdict.configVersion,
          updatedAt: new Date(),
        })
        .where(eq(rawJobs.id, job.id));

      if (!markable) return;

      await tx
        .update(applications)
        .set({ matchCategory: "gate_qualified", updatedAt: new Date() })
        .where(eq(applications.id, row.applicationId));
    });
  }

  return {
    evaluated: stale.length,
    changed,
    nowRejecting,
    markedGateQualified,
    byDecision,
  };
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
    // A binned job is a decision already made, exactly as a promoted one is.
    // Without this, a rules change would re-judge it, promote it to PASS and
    // resurrect something that was deliberately dismissed (JSV2S1157).
    .where(and(isNull(applications.id), isNull(rawJobs.binnedAt)))
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

    /**
     * D1 (ADR-0006) applies to a RE-JUDGEMENT too, not only to ingest.
     *
     * This updated the verdict and stopped there, so a job promoted to PASS by
     * a rules change became qualified with no application — invisible to every
     * query in features/applications/queries.ts, which are all rooted at
     * `applications`. Correcting the experience guard on 2026-09-17 promoted
     * three jobs (a Wise Senior PM role and two Ebury payment-screening roles)
     * and none of them reached the workspace. The pipeline screen's orphan
     * check caught it, which is the only reason it was not silent.
     *
     * Verdict and application are written in ONE transaction: a job marked
     * `pass` without its application is exactly the inconsistency this fixes,
     * so the two must not be able to come apart.
     */
    const promoted = verdict.decision === "pass";
    if (promoted) nowPassing += 1;

    await db.transaction(async (tx) => {
      await tx
        .update(rawJobs)
        .set({
          prequalification: verdict.decision,
          prequalificationDetail: verdict,
          prequalifiedAt: new Date(verdict.evaluatedAt),
          prequalificationVersion: verdict.configVersion,
          updatedAt: new Date(),
        })
        .where(eq(rawJobs.id, job.id));

      if (!promoted) return;

      const [application] = await tx
        .insert(applications)
        .values({ rawJobId: job.id, status: "ready_to_apply" })
        .returning({ id: applications.id });

      await tx.insert(applicationEvents).values({
        applicationId: application.id,
        eventType: "application_created",
        toStatus: "ready_to_apply",
        summary: `Application created on re-qualification — ${job.title} at ${job.company}`,
        metadata: {
          source: job.source,
          prequalification: verdict.decision,
          configVersion: verdict.configVersion,
          // Which rule changed its mind, so a promotion is traceable.
          previousVersion: job.prequalificationVersion,
        },
      });
    });
  }

  return { evaluated: stale.length, nowPassing };
}


/**
 * Move jobs to the Bin — a soft delete (JSV2S1157).
 *
 * An acknowledgement, not a destruction. The row keeps its verdict, its
 * evidence and its fingerprint; it simply leaves the working queues. Keeping
 * the fingerprint is the load-bearing part: a hard delete would let the same
 * job be re-ingested and re-presented on the next fetch, so the pile would
 * refill itself with exactly what was just dismissed.
 *
 * Promoted jobs are refused rather than skipped. Binning something that has
 * already become an application would hide the job while leaving the
 * application behind, pointing at a row the UI treats as deleted.
 */
export async function binJobs(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const promoted = await db
    .select({ id: rawJobs.id })
    .from(rawJobs)
    .innerJoin(applications, eq(applications.rawJobId, rawJobs.id))
    .where(inArray(rawJobs.id, ids));

  const binnable = ids.filter((id) => !promoted.some((p) => p.id === id));
  if (binnable.length === 0) return 0;

  const updated = await db
    .update(rawJobs)
    .set({ binnedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(rawJobs.id, binnable), isNull(rawJobs.binnedAt)))
    .returning({ id: rawJobs.id });

  return updated.length;
}

/** Take jobs back out of the Bin, for when a rules change deserves a second look. */
export async function restoreJobs(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(rawJobs)
    .set({ binnedAt: null, updatedAt: new Date() })
    .where(inArray(rawJobs.id, ids))
    .returning({ id: rawJobs.id });
  return updated.length;
}
