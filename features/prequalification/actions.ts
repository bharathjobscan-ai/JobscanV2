"use server";

import { revalidatePath } from "next/cache";

import {
  AlreadyPromoted,
  binJobs,
  promoteJob,
  rejectJob,
  requalifyPromoted,
  requalifyStale,
  restoreJobs,
} from "./mutations";

/** Server actions for the review queue (JSV2S1038). */

export async function promoteAction(formData: FormData): Promise<void> {
  const id = String(formData.get("rawJobId") ?? "");
  if (!id) return;

  try {
    await promoteJob(id);
  } catch (error) {
    // Promoting twice is a double-submit, not a failure worth surfacing.
    if (!(error instanceof AlreadyPromoted)) throw error;
  }

  revalidatePath("/review");
  revalidatePath("/applications");
}

export async function rejectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("rawJobId") ?? "");
  if (!id) return;

  await rejectJob(id, String(formData.get("reason") ?? ""));
  revalidatePath("/review");
}

/**
 * Re-run the gate over everything it is allowed to touch.
 *
 * Two passes, not one, because they have different rules: `requalifyStale` may
 * promote an unpromoted job into an application, while `requalifyPromoted`
 * updates the verdict record of a job that already has one and must never
 * disturb the application itself.
 */
export async function requalifyAction(): Promise<void> {
  await requalifyStale();
  await requalifyPromoted();
  revalidatePath("/review");
  revalidatePath("/applications");
  revalidatePath("/pipeline");
}

/**
 * Move one or many jobs to the Bin (JSV2S1157).
 *
 * Reads every `jobId` from the form, so the same action serves a single row and
 * a bulk selection — the UI difference is how many boxes are ticked, not which
 * endpoint is called.
 */
export async function binAction(data: FormData): Promise<void> {
  const ids = data.getAll("jobId").filter((v): v is string => typeof v === "string");
  await binJobs(ids);
  revalidatePath("/review");
  revalidatePath("/pipeline");
}

export async function restoreAction(data: FormData): Promise<void> {
  const ids = data.getAll("jobId").filter((v): v is string => typeof v === "string");
  await restoreJobs(ids);
  revalidatePath("/review");
  revalidatePath("/pipeline");
}
