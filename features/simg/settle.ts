import { and, desc, eq, sql } from "drizzle-orm";

import { aiJobs, applicationDocuments } from "@/db/schema";
import { LENS_WEIGHTS, type LensKey } from "@/config/simg";
import { db } from "@/lib/db/client";
import { LINES_PER_PAGE, pageFit } from "@/lib/documents/parse";
import { validateRecommendations } from "./apply";
import type { SimgEvaluation, SimgRecommendation } from "./types";

/**
 * Promote a SimG result onto the resume it evaluated (JSV2S1058).
 *
 * Called only from `settleAiJobs`, which remains the single write path from AI
 * output to domain objects. Everything here is defensive: the worklist is
 * applied to the user's CV by literal substitution, so anything the model got
 * wrong has to be caught now rather than when a button is pressed.
 */

type AiJobRow = typeof aiJobs.$inferSelect;

const LENS_KEYS = Object.keys(LENS_WEIGHTS) as LensKey[];

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Accept only the vocabulary the contract defines; anything else is dropped. */
function normaliseRecommendation(
  raw: Record<string, unknown>,
  index: number,
): SimgRecommendation | null {
  const kind = raw.kind;
  if (kind !== "modify" && kind !== "insert" && kind !== "delete") return null;

  const lens = LENS_KEYS.includes(raw.lens as LensKey)
    ? (raw.lens as LensKey)
    : raw.lens === "hiring_manager"
      ? "hiringManager"
      : null;
  if (!lens) return null;

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;

  return {
    id: str(raw.id) ?? `r${index + 1}`,
    lens,
    kind,
    // Bounded here as well as in the prompt: the projection is only honest if
    // no single item can dominate it.
    points: Math.max(0, Math.min(8, Math.round(Number(raw.points) || 0))),
    text: str(raw.text) ?? "",
    detail: str(raw.detail) ?? "",
    section: str(raw.section) ?? undefined,
    before: str(raw.before),
    after: str(raw.after),
    anchorAfter: str(raw.anchorAfter),
    requiresConfirmation: raw.requiresConfirmation === true,
    confirm: str(raw.confirm),
    state: "pending",
  };
}

/**
 * The most recent resume for this application.
 *
 * SimG evaluates whatever CV was generated last, and its result must land on
 * that exact row — if a regeneration happened between the call and the settle,
 * the evaluation is stale and is discarded rather than attached to a CV it
 * never read.
 */
async function latestResume(applicationId: string) {
  const [row] = await db
    .select({
      id: applicationDocuments.id,
      version: applicationDocuments.version,
      contentMd: applicationDocuments.contentMd,
      generatedAt: applicationDocuments.generatedAt,
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

export async function settleSimgEvaluation(
  job: AiJobRow,
  parsed: { markdown: string; payload: Record<string, unknown> },
): Promise<void> {
  const fail = async (reason: string) => {
    await db
      .update(aiJobs)
      .set({ status: "failed", error: reason, settledAt: sql`now()` })
      .where(eq(aiJobs.id, job.id));
  };

  const raw = (parsed.payload as { simg?: Record<string, unknown> }).simg;
  if (!raw || typeof raw !== "object") {
    await fail("SimG returned no evaluation block.");
    return;
  }

  const resume = await latestResume(job.applicationId);
  if (!resume?.contentMd) {
    await fail("No resume to attach the evaluation to.");
    return;
  }

  const currentRaw = (raw.current ?? {}) as Record<string, Record<string, unknown>>;
  const baselineRaw = (raw.baseline ?? {}) as Record<string, unknown>;

  const current = Object.fromEntries(
    LENS_KEYS.map((k) => [
      k,
      {
        score: clampScore(currentRaw[k]?.score),
        note: typeof currentRaw[k]?.note === "string" ? currentRaw[k].note : undefined,
      },
    ]),
  ) as SimgEvaluation["current"];

  const baseline = Object.fromEntries(
    LENS_KEYS.map((k) => [k, clampScore(baselineRaw[k])]),
  ) as Record<LensKey, number>;

  const proposed = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const normalised = proposed
    .map((r, i) => normaliseRecommendation(r as Record<string, unknown>, i))
    .filter((r): r is SimgRecommendation => r !== null);

  // The anchor text must exist, exactly once, in the CV as stored — after the
  // ATS hygiene pass, which is the text the user will actually see.
  const { valid, rejected } = validateRecommendations(resume.contentMd, normalised);

  const evaluation: SimgEvaluation = {
    baseline,
    current,
    keywords: (raw.keywords as SimgEvaluation["keywords"]) ?? undefined,
    recommendations: valid,
    markdown: parsed.markdown || undefined,
    model: job.model,
    provider: job.provider,
    evaluatedAt: new Date().toISOString(),
    rejected: rejected.length > 0 ? rejected : undefined,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(applicationDocuments)
      .set({ simg: evaluation })
      .where(eq(applicationDocuments.id, resume.id));

    await tx
      .update(aiJobs)
      .set({ settledAt: sql`now()` })
      .where(eq(aiJobs.id, job.id));
  });
}

/** Rendered lines still available on the page, for the SimG prompt. */
export function lineBudgetFor(markdown: string): number {
  const { estimatedLines } = pageFit(markdown);
  return Math.max(0, LINES_PER_PAGE - estimatedLines);
}
