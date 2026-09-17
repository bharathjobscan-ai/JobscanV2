"use server";

import { revalidatePath } from "next/cache";

import { RECOMMENDATION_STATES, type RecommendationState } from "./types";
import { acceptAll, setRecommendationState, SimgConflict } from "./mutations";

export type SimgActionState = { error?: string; message?: string };

function refresh(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
}

function field(data: FormData, name: string): string | undefined {
  const value = data.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Accept, discard or reset one recommendation (JSV2S1126).
 *
 * No AI call: the edit is applied by literal substitution from the stored
 * `before`/`after`. That is the entire reason SimG is made to quote verbatim.
 */
export async function setRecommendationAction(
  _prev: SimgActionState,
  data: FormData,
): Promise<SimgActionState> {
  const applicationId = field(data, "applicationId");
  const recommendationId = field(data, "recommendationId");
  const state = field(data, "state");

  if (!applicationId || !recommendationId) return { error: "Missing recommendation." };
  if (!state || !RECOMMENDATION_STATES.includes(state as RecommendationState)) {
    return { error: "Unknown state." };
  }

  try {
    await setRecommendationState(
      applicationId,
      recommendationId,
      state as RecommendationState,
    );
    refresh(applicationId);
    return {
      message:
        state === "accepted"
          ? "Applied."
          : state === "discarded"
            ? "Discarded."
            : "Reverted.",
    };
  } catch (error) {
    if (error instanceof SimgConflict) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not apply." };
  }
}

export async function acceptAllAction(
  _prev: SimgActionState,
  data: FormData,
): Promise<SimgActionState> {
  const applicationId = field(data, "applicationId");
  if (!applicationId) return { error: "Missing application." };

  try {
    const accepted = await acceptAll(applicationId);
    refresh(applicationId);
    return {
      message:
        accepted === 0
          ? "Nothing left to accept."
          : `Applied ${accepted} change${accepted === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof SimgConflict) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not apply." };
  }
}
