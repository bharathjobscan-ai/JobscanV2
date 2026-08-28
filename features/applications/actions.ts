"use server";

import { revalidatePath } from "next/cache";

import { enqueueTask, TaskBlocked } from "@/features/ai/tasks";
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
 * With AI_PROVIDER=mock this completes inline. With `claude_local` it queues
 * work for the Mac worker, so the message tells the user what to expect rather
 * than leaving them wondering why nothing happened.
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

  try {
    const result = await enqueueTask(id, task as AiTaskType);
    refresh(id);
    return {
      message:
        result.status === "succeeded"
          ? "Generated."
          : "Queued. It will appear once the local worker picks it up.",
    };
  } catch (error) {
    if (error instanceof TaskBlocked || error instanceof MissingPromptError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Could not start the task." };
  }
}
