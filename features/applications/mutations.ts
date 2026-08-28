import { desc, eq, sql } from "drizzle-orm";

import {
  applicationAttempts,
  applicationEvents,
  applications,
  rawJobs,
} from "@/db/schema";
import {
  isClosed,
  STATUS_LABELS,
  type ApplicationChannel,
  type ApplicationStatus,
  type ReferralStatus,
  REFERRAL_LABELS,
} from "@/lib/config/constants";
import { db } from "@/lib/db/client";

export class ApplicationNotFound extends Error {
  constructor(id: string) {
    super(`Application ${id} not found`);
  }
}

/**
 * Change application status.
 *
 * One transaction covers three writes, because they are one fact:
 *   1. applications.status — current truth, what the dashboard filters on
 *   2. the active attempt's outcome — so JSV2S1096 can compare attempts
 *   3. an append-only event — timeline (JSV2S1097) and history (JSV2S1084)
 *
 * Moving to `applied` with no attempt on record opens attempt #1 automatically:
 * the user should not have to think about the attempts model to record an
 * ordinary application.
 */
export async function changeStatus(
  applicationId: string,
  toStatus: ApplicationStatus,
  note?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) throw new ApplicationNotFound(applicationId);

    const fromStatus = application.status;
    if (fromStatus === toStatus) return;

    const [activeAttempt] = await tx
      .select()
      .from(applicationAttempts)
      .where(eq(applicationAttempts.applicationId, applicationId))
      .orderBy(desc(applicationAttempts.attemptNumber))
      .limit(1);

    let attemptId = activeAttempt?.id ?? null;

    if (toStatus === "applied" && !activeAttempt) {
      const [created] = await tx
        .insert(applicationAttempts)
        .values({
          applicationId,
          attemptNumber: 1,
          appliedAt: sql`now()`,
        })
        .returning({ id: applicationAttempts.id });
      attemptId = created.id;

      await tx.insert(applicationEvents).values({
        applicationId,
        attemptId,
        eventType: "attempt_created",
        summary: "Attempt 1 opened",
      });
    }

    // A terminal status belongs to the attempt that reached it.
    if (attemptId && isClosed(toStatus)) {
      await tx
        .update(applicationAttempts)
        .set({ outcome: toStatus, outcomeAt: sql`now()` })
        .where(eq(applicationAttempts.id, attemptId));
    }

    await tx
      .update(applications)
      .set({
        status: toStatus,
        // First submission only — later attempts do not move it.
        appliedAt:
          toStatus === "applied" && !application.appliedAt
            ? sql`now()`
            : application.appliedAt,
        closedAt: isClosed(toStatus) ? sql`now()` : null,
        lastActivityAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(applications.id, applicationId));

    await tx.insert(applicationEvents).values({
      applicationId,
      attemptId,
      eventType: "status_changed",
      fromStatus,
      toStatus,
      summary: `${STATUS_LABELS[fromStatus]} → ${STATUS_LABELS[toStatus]}${
        note ? ` — ${note}` : ""
      }`,
    });
  });
}

export async function updateReferral(
  applicationId: string,
  input: {
    referralStatus: ReferralStatus;
    referrerName?: string | null;
    referralNotes?: string | null;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [application] = await tx
      .select({ referralStatus: applications.referralStatus })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) throw new ApplicationNotFound(applicationId);

    await tx
      .update(applications)
      .set({
        referralStatus: input.referralStatus,
        referrerName: input.referrerName ?? null,
        referralNotes: input.referralNotes ?? null,
        lastActivityAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(applications.id, applicationId));

    await tx.insert(applicationEvents).values({
      applicationId,
      eventType: "referral_updated",
      summary:
        application.referralStatus === input.referralStatus
          ? `Referral details updated (${REFERRAL_LABELS[input.referralStatus]})`
          : `Referral ${REFERRAL_LABELS[application.referralStatus]} → ${
              REFERRAL_LABELS[input.referralStatus]
            }`,
      metadata: { referrerName: input.referrerName ?? null },
    });
  });
}

/**
 * Record a further attempt at the same job (JSV2S1094, JSV2S1095).
 *
 * `emailUsed` matters: the PRD notes that re-applying from a fresh address at
 * the right moment sometimes produces a shortlist, and JSV2S1096 wants that
 * comparison later.
 */
export async function createAttempt(
  applicationId: string,
  input: {
    channel?: ApplicationChannel | null;
    emailUsed?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select({ id: applications.id, appliedAt: applications.appliedAt })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!application) throw new ApplicationNotFound(applicationId);

    const [last] = await tx
      .select({ attemptNumber: applicationAttempts.attemptNumber })
      .from(applicationAttempts)
      .where(eq(applicationAttempts.applicationId, applicationId))
      .orderBy(desc(applicationAttempts.attemptNumber))
      .limit(1);

    const attemptNumber = (last?.attemptNumber ?? 0) + 1;

    const [created] = await tx
      .insert(applicationAttempts)
      .values({
        applicationId,
        attemptNumber,
        appliedAt: sql`now()`,
        channel: input.channel ?? null,
        emailUsed: input.emailUsed ?? null,
        notes: input.notes ?? null,
      })
      .returning({ id: applicationAttempts.id });

    // A new attempt reopens the application: it is live again.
    await tx
      .update(applications)
      .set({
        status: "applied",
        appliedAt: application.appliedAt ?? sql`now()`,
        closedAt: null,
        lastActivityAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(applications.id, applicationId));

    await tx.insert(applicationEvents).values({
      applicationId,
      attemptId: created.id,
      eventType: "attempt_created",
      toStatus: "applied",
      summary: `Attempt ${attemptNumber} submitted${
        input.emailUsed ? ` from ${input.emailUsed}` : ""
      }`,
      metadata: { channel: input.channel ?? null, emailUsed: input.emailUsed ?? null },
    });

    return created.id;
  });
}

export async function addNote(
  applicationId: string,
  text: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(applicationEvents).values({
      applicationId,
      eventType: "note_added",
      summary: text,
    });
    await tx
      .update(applications)
      .set({ lastActivityAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(applications.id, applicationId));
  });
}

/** Fill in a job description that was missing at upload, unblocking AI actions. */
export async function updateJobDescription(
  rawJobId: string,
  description: string,
): Promise<void> {
  await db
    .update(rawJobs)
    .set({ description, updatedAt: sql`now()` })
    .where(eq(rawJobs.id, rawJobId));
}
