import { and, desc, eq } from "drizzle-orm";

import { applicationDocuments, applicationEvents } from "@/db/schema";
import { db } from "@/lib/db/client";
import { pageFit } from "@/lib/documents/parse";
import { applyAccepted } from "./apply";
import type { RecommendationState, SimgEvaluation } from "./types";

/**
 * Accepting and discarding SimG recommendations (JSV2S1126).
 *
 * Not part of `settleAiJobs`: that is the write path from *AI output* to domain
 * objects, and these are user decisions. No model is involved here at all — the
 * point of the verbatim `before`/`after` contract is that accepting an edit
 * costs nothing.
 *
 * `contentMd` is never mutated. It stays the CV as generated, and the version
 * the user reads is derived by replaying the accepted set over it, so undo is a
 * recompute rather than a revert and no history has to be kept.
 */

export class SimgConflict extends Error {}

async function loadResume(applicationId: string) {
  const [row] = await db
    .select({
      id: applicationDocuments.id,
      version: applicationDocuments.version,
      contentMd: applicationDocuments.contentMd,
      simg: applicationDocuments.simg,
    })
    .from(applicationDocuments)
    .where(
      and(
        eq(applicationDocuments.applicationId, applicationId),
        eq(applicationDocuments.docType, "resume"),
      ),
    )
    .orderBy(desc(applicationDocuments.version))
    .limit(1);
  return row ?? null;
}

/**
 * The CV as it currently stands: generated, then edited by whatever has been
 * accepted. Every read path — screen, .docx, download — goes through here, so
 * they cannot disagree about what the document says.
 */
export async function currentResumeMarkdown(
  applicationId: string,
): Promise<{ markdown: string; version: number } | null> {
  const resume = await loadResume(applicationId);
  if (!resume?.contentMd) return null;
  const evaluation = resume.simg;
  return {
    markdown: evaluation
      ? applyAccepted(resume.contentMd, evaluation.recommendations)
      : resume.contentMd,
    version: resume.version,
  };
}

async function persist(
  applicationId: string,
  mutate: (evaluation: SimgEvaluation, original: string) => void,
): Promise<SimgEvaluation> {
  const resume = await loadResume(applicationId);
  if (!resume?.contentMd) throw new SimgConflict("No CV to edit.");
  if (!resume.simg) throw new SimgConflict("This CV has not been evaluated.");

  // Work on a copy so a rejected write leaves the stored evaluation untouched.
  const evaluation: SimgEvaluation = JSON.parse(JSON.stringify(resume.simg));
  mutate(evaluation, resume.contentMd);

  // The one-page rule is enforced here, not only in the prompt: SimG's own
  // estimate of the page cost is an estimate, and this is the last point before
  // the user sees a CV that would print onto two pages.
  const derived = applyAccepted(resume.contentMd, evaluation.recommendations);
  const fit = pageFit(derived);
  if (!fit.fits) {
    throw new SimgConflict(
      `That edit pushes the CV onto a second page by about ${fit.overBy} lines. ` +
        `Discard or accept a deletion first.`,
    );
  }

  await db
    .update(applicationDocuments)
    .set({ simg: evaluation })
    .where(eq(applicationDocuments.id, resume.id));

  return evaluation;
}

export async function setRecommendationState(
  applicationId: string,
  recommendationId: string,
  state: RecommendationState,
): Promise<void> {
  await persist(applicationId, (evaluation) => {
    const rec = evaluation.recommendations.find((r) => r.id === recommendationId);
    if (!rec) throw new SimgConflict("That recommendation is no longer offered.");
    rec.state = state;
  });
}

/**
 * Accept every pending recommendation at once.
 *
 * Includes the ones flagged `requiresConfirmation`, because the user asked for
 * a single button and said they will verify the worklist by eye before pressing
 * it (2026-09-05). The UI marks those items distinctly so that review is
 * actually possible — the button is safe only because the list is legible.
 */
export async function acceptAll(applicationId: string): Promise<number> {
  let accepted = 0;
  await persist(applicationId, (evaluation) => {
    for (const rec of evaluation.recommendations) {
      if (rec.state === "pending") {
        rec.state = "accepted";
        accepted += 1;
      }
    }
  });

  if (accepted > 0) {
    await db.insert(applicationEvents).values({
      applicationId,
      eventType: "document_generated",
      summary: `Accepted ${accepted} SimG recommendation${accepted === 1 ? "" : "s"}`,
      metadata: { source: "simg", accepted },
    });
  }

  return accepted;
}
