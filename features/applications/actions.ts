"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { applications } from "@/db/schema";
import { db } from "@/lib/db/client";

import { enqueueTask, TaskBlocked, TaskTooSoon } from "@/features/ai/tasks";
import {
  addNote,
  changeStatus,
  createAttempt,
  updateJobDescription,
  updateReferral,
} from "@/features/applications/mutations";
import { MissingPromptError } from "@/lib/ai/prompts";
import {
  APPLICATION_CHANNELS,
  APPLICATION_STATUSES,
  AI_TASK_TYPES,
  REFERRAL_STATUSES,
  type AiTaskType,
  type ApplicationChannel,
  type ApplicationStatus,
  type ReferralStatus,
} from "@/lib/config/constants";

export type ActionState = { error?: string; message?: string };

function refresh(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
}

function field(data: FormData, name: string): string | undefined {
  const value = data.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Star or unstar an application (JSV2S1173).
 *
 * Toggles from the row's CURRENT value read inside the statement rather than
 * from one the client sent: two clicks landing together would otherwise both
 * write the same value, and the second would silently undo nothing.
 *
 * Deliberately not an event on the timeline. A star is a private bookmark, not
 * a change to the application — filling the activity log with it would bury
 * the things that actually happened.
 */
export async function toggleStarAction(data: FormData): Promise<void> {
  const id = field(data, "applicationId");
  if (!id) return;

  await db
    .update(applications)
    .set({
      starredAt: sql`case when ${applications.starredAt} is null then now() else null end`,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id));

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
}

export async function changeStatusAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  const status = field(data, "status");

  if (!id) return { error: "Missing application." };
  if (!status || !APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    return { error: "Unknown status." };
  }

  try {
    await changeStatus(id, status as ApplicationStatus, field(data, "note"));
    refresh(id);
    return { message: "Status updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function updateReferralAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  const status = field(data, "referralStatus");

  if (!id) return { error: "Missing application." };
  if (!status || !REFERRAL_STATUSES.includes(status as ReferralStatus)) {
    return { error: "Unknown referral status." };
  }

  try {
    await updateReferral(id, {
      referralStatus: status as ReferralStatus,
      referrerName: field(data, "referrerName") ?? null,
      referralNotes: field(data, "referralNotes") ?? null,
    });
    refresh(id);
    return { message: "Referral updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function createAttemptAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  if (!id) return { error: "Missing application." };

  const channel = field(data, "channel");

  try {
    await createAttempt(id, {
      channel:
        channel && APPLICATION_CHANNELS.includes(channel as ApplicationChannel)
          ? (channel as ApplicationChannel)
          : null,
      emailUsed: field(data, "emailUsed") ?? null,
      notes: field(data, "notes") ?? null,
    });
    refresh(id);
    return { message: "Attempt recorded." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record attempt." };
  }
}

export async function addNoteAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  const text = field(data, "note");

  if (!id) return { error: "Missing application." };
  if (!text) return { error: "Write something first." };

  await addNote(id, text);
  refresh(id);
  return { message: "Note added." };
}

export async function updateDescriptionAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  const rawJobId = field(data, "rawJobId");
  const description = field(data, "description");

  if (!id || !rawJobId) return { error: "Missing application." };
  if (!description || description.length < 50) {
    return { error: "Paste the full job description (at least 50 characters)." };
  }

  await updateJobDescription(rawJobId, description);
  refresh(id);
  return { message: "Job description saved. Generation is now available." };
}

/**
 * Trigger score / resume / cover letter.
 *
 * Every provider runs inline and synchronously (ADR-0005), mock included, so
 * the result is ready when this returns. Nothing is queued.
 */
export async function generateAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = field(data, "applicationId");
  const task = field(data, "taskType");

  if (!id) return { error: "Missing application." };
  if (!task || !AI_TASK_TYPES.includes(task as AiTaskType)) {
    return { error: "Unknown task." };
  }

  // The confirm dialog sets this; nothing else does. A force that any caller
  // could pass by accident would make the guard decorative.
  const force = field(data, "confirmed") === "yes";

  try {
    const result = await enqueueTask(id, task as AiTaskType, { force });
    refresh(id);
    return {
      message:
        result.status === "succeeded"
          ? "Generated."
          : "Queued. It will appear once the local worker picks it up.",
    };
  } catch (error) {
    if (error instanceof TaskTooSoon) return { error: error.message };
    if (error instanceof TaskBlocked || error instanceof MissingPromptError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Could not start the task." };
  }
}
