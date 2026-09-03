"use server";

import { revalidatePath } from "next/cache";

import { AlreadyPromoted, promoteJob, rejectJob, requalifyStale } from "./mutations";

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

export async function requalifyAction(): Promise<void> {
  await requalifyStale();
  revalidatePath("/review");
  revalidatePath("/applications");
}
