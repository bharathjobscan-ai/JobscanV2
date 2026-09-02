import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  aiJobs,
  applicationDocuments,
  applicationEvents,
  applications,
  rawJobs,
} from "@/db/schema";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { GeminiProvider } from "@/lib/ai/gemini";
import { MockProvider } from "@/lib/ai/mock";
import { buildPrompt, flattenPrompt } from "@/lib/ai/prompts";
import { parseTaskResponse, type AiProvider, type TaskContext } from "@/lib/ai/types";
import {
  AI_TASK_DOCUMENT,
  AI_TASK_LABELS,
  DOCUMENT_LABELS,
  matchCategoryFor,
  type AiTaskType,
  type DocumentType,
} from "@/lib/config/constants";

/**
 * Split a CVG response into its two documents.
 *
 * The contract asks for `<<<CV>>>` and `<<<COVER_LETTER>>>` on their own lines.
 * If a model ignores the delimiters the whole response becomes the resume
 * rather than being lost — a missing cover letter is recoverable, a discarded
 * CV is not.
 */
function splitDocuments(
  markdown: string,
): { docType: DocumentType; markdown: string }[] {
  const cv = markdown.match(/<<<CV>>>\s*\n([\s\S]*?)(?=\n<<<COVER_LETTER>>>|$)/);
  const letter = markdown.match(/<<<COVER_LETTER>>>\s*\n([\s\S]*)$/);

  if (!cv && !letter) {
    return [{ docType: "resume", markdown: markdown.trim() }];
  }

  const parts: { docType: DocumentType; markdown: string }[] = [];
  const cvText = cv?.[1]?.trim();
  const letterText = letter?.[1]?.trim();

  if (cvText) parts.push({ docType: "resume", markdown: cvText });
  if (letterText) parts.push({ docType: "cover_letter", markdown: letterText });
  return parts;
}
import { getEnv } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { isIncomplete } from "@/features/ingestion/schema";

export class TaskBlocked extends Error {}

/**
 * Which provider runs a task.
 *
 * Routing is per task rather than global because the two differ on the axes
 * that matter: Gemini's Google Search grounding resolved a UK sponsor-register
 * entry that three Claude Code runs could not, and Claude leads on long-form
 * document generation. Measured, not assumed.
 */
function providerFor(taskType: AiTaskType): AiProvider {
  const env = getEnv();
  if (env.AI_PROVIDER === "mock") return new MockProvider();

  const choice = taskType === "score" ? env.PROVIDER_SCORING : env.PROVIDER_CV;
  return choice === "gemini_api" ? new GeminiProvider() : new AnthropicProvider();
}

function modelFor(taskType: AiTaskType, provider: string): string {
  const env = getEnv();
  if (provider === "gemini_api") {
    return taskType === "score" ? env.MODEL_SCORING_GEMINI : env.MODEL_CV_GEMINI;
  }
  return taskType === "score" ? env.MODEL_SCORING : env.MODEL_CV;
}

/**
 * Run an AI task and record it.
 *
 * Every provider runs inline: mock needs nothing, and both live providers are
 * plain HTTPS calls. Nothing is queued for a worker any more, so the caller
 * gets a finished result rather than a promise to poll.
 */
export async function enqueueTask(
  applicationId: string,
  taskType: AiTaskType,
): Promise<{ id: string; status: "succeeded" }> {
  const env = getEnv();

  const [row] = await db
    .select({ application: applications, job: rawJobs })
    .from(applications)
    .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!row) throw new TaskBlocked("Application not found.");

  if (isIncomplete({ description: row.job.description })) {
    throw new TaskBlocked(
      "This job has no usable description. Add the job description before generating material.",
    );
  }

  const context: TaskContext = {
    applicationId,
    taskType,
    title: row.job.title,
    company: row.job.company,
    location: row.job.location,
    country: row.job.country,
    description: row.job.description!,
    jobUrl: row.job.jobUrl,
    visaSponsorshipMentioned: row.job.visaSponsorshipMentioned,
    postedAt: row.job.postedAt,
    employmentType: row.job.employmentType,
    seniority: row.job.seniority,
    salaryRaw: row.job.salaryRaw,
    reachability: row.job.reachability,
    inboundSourceDetail: row.job.inboundSourceDetail,
  };

  const provider = providerFor(taskType);
  const model = modelFor(taskType, provider.name);
  const isMock = provider.name === "mock";

  const prompt = isMock ? null : await buildPrompt(context);
  const startedAt = new Date();

  const result = await provider.run(context, prompt ?? "", model);

  const [created] = await db
    .insert(aiJobs)
    .values({
      applicationId,
      taskType,
      status: "succeeded",
      provider: provider.name,
      model,
      effort: env.AI_EFFORT,
      allowedTools:
        provider.name === "gemini_api" && taskType === "score"
          ? "GoogleSearch"
          : null,
      prompt: prompt ? flattenPrompt(prompt) : null,
      result: { markdown: result.markdown, payload: result.payload },
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens,
            // Reasoning tokens bill as output; fold them in so providers
            // compare on the same basis.
            outputTokens:
              result.usage.outputTokens + (result.usage.thinkingTokens ?? 0),
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheCreationTokens: result.usage.cacheCreationTokens,
            durationMs: Date.now() - startedAt.getTime(),
          }
        : null,
      startedAt: sql`${startedAt.toISOString()}`,
      finishedAt: sql`now()`,
    })
    .returning({ id: aiJobs.id });

  await settleAiJobs(applicationId);
  return { id: created.id, status: "succeeded" };
}

/**
 * Promote finished AI results into domain objects.
 *
 * The worker deliberately does no domain writes — it fetches a result and
 * stores it raw. This function is the single place where a result becomes a
 * document, a score and a timeline event, so there is never a second copy of
 * the write path to keep in sync.
 *
 * Called on page load; safe to call repeatedly.
 */
export async function settleAiJobs(applicationId?: string): Promise<number> {
  const pending = await db
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.status, "succeeded"),
        isNull(aiJobs.settledAt),
        applicationId ? eq(aiJobs.applicationId, applicationId) : undefined,
      ),
    )
    .orderBy(aiJobs.finishedAt);

  let settled = 0;

  for (const job of pending) {
    const raw = (job.result ?? {}) as {
      markdown?: string;
      payload?: Record<string, unknown>;
      text?: string;
    };

    // Mock writes {markdown,payload}; the worker writes {text} straight from
    // Claude and lets us parse here.
    const parsed =
      raw.markdown !== undefined
        ? {
            markdown: raw.markdown,
            payload: (raw.payload ?? {}) as ReturnType<
              typeof parseTaskResponse
            >["payload"],
          }
        : parseTaskResponse(raw.text ?? "");

    if (!parsed.markdown) {
      await db
        .update(aiJobs)
        .set({ status: "failed", error: "Empty response", settledAt: sql`now()` })
        .where(eq(aiJobs.id, job.id));
      continue;
    }

    // One CVG call returns both documents, delimited. Split them so each is
    // stored, versioned and downloadable on its own.
    const parts: { docType: DocumentType; markdown: string }[] =
      job.taskType === "tailor_cv"
        ? splitDocuments(parsed.markdown)
        : [{ docType: AI_TASK_DOCUMENT[job.taskType], markdown: parsed.markdown }];

    await db.transaction(async (tx) => {
      for (const part of parts) {
        const docType = part.docType;
        const [previous] = await tx
          .select({ version: applicationDocuments.version })
          .from(applicationDocuments)
          .where(
            and(
              eq(applicationDocuments.applicationId, job.applicationId),
              eq(applicationDocuments.docType, docType),
            ),
          )
          .orderBy(desc(applicationDocuments.version))
          .limit(1);

        const version = (previous?.version ?? 0) + 1;

        await tx.insert(applicationDocuments).values({
          applicationId: job.applicationId,
          docType,
          version,
          contentMd: part.markdown,
          // The generation summary describes the pair, so both carry it.
          summary: parsed.payload.summary ?? null,
          generatedBy: job.provider,
          model: job.model,
          generatedAt: job.finishedAt ?? sql`now()`,
        });

        await tx.insert(applicationEvents).values({
          applicationId: job.applicationId,
          eventType: "document_generated",
          summary: `${DOCUMENT_LABELS[docType]} generated (v${version}) via ${job.provider}`,
          metadata: {
            taskType: job.taskType,
            model: job.model,
            version,
            score: parsed.payload.score ?? null,
          },
        });
      }

      if (job.taskType === "score" && parsed.payload.score !== undefined) {
        await tx
          .update(applications)
          .set({
            jobScore: parsed.payload.score,
            // Derived from ScoreG's decision bands, never taken from the model:
            // it is a pure function of the score, so deriving it is
            // deterministic and cannot drift between runs (C3).
            matchCategory: matchCategoryFor(parsed.payload.score),
            visaSignal: parsed.payload.visaSignal ?? null,
            jobScoreAnalysis: parsed.payload.analysis ?? null,
            jobScoreGeneratedAt: job.finishedAt ?? sql`now()`,
            lastActivityAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(applications.id, job.applicationId));
      } else {
        await tx
          .update(applications)
          .set({ lastActivityAt: sql`now()`, updatedAt: sql`now()` })
          .where(eq(applications.id, job.applicationId));
      }

      await tx
        .update(aiJobs)
        .set({ settledAt: sql`now()` })
        .where(eq(aiJobs.id, job.id));
    });

    settled += 1;
  }

  return settled;
}

/** Queued/running/failed tasks, for status chips in the workspace. */
export async function getTaskStates(applicationId: string) {
  const rows = await db
    .select({
      id: aiJobs.id,
      taskType: aiJobs.taskType,
      status: aiJobs.status,
      error: aiJobs.error,
      queuedAt: aiJobs.queuedAt,
    })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.applicationId, applicationId),
        sql`(${aiJobs.status} in ('queued','running') or (${aiJobs.status} = 'failed' and ${aiJobs.settledAt} is null))`,
      ),
    )
    .orderBy(desc(aiJobs.queuedAt));

  return rows.map((row) => ({
    ...row,
    label: AI_TASK_LABELS[row.taskType],
  }));
}
