import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  aiJobs,
  applicationDocuments,
  applicationEvents,
  applications,
  rawJobs,
} from "@/db/schema";
import { MockProvider } from "@/lib/ai/mock";
import { buildPrompt } from "@/lib/ai/prompts";
import { parseTaskResponse, type TaskContext } from "@/lib/ai/types";
import {
  AI_TASK_DOCUMENT,
  AI_TASK_LABELS,
  DOCUMENT_LABELS,
  matchCategoryFor,
  type AiTaskType,
} from "@/lib/config/constants";
import { getEnv } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { isIncomplete } from "@/features/ingestion/schema";

export class TaskBlocked extends Error {}

function modelFor(taskType: AiTaskType): string {
  const env = getEnv();
  return taskType === "score" ? env.MODEL_SCORING : env.MODEL_CV;
}

/**
 * Only scoring gets tools. ScoreG verifies UK sponsor-register status and
 * hiring signals live; without WebSearch its visa pillar is capped and it says
 * so in the gaps. CV and cover letter work from the JD and master resume, so
 * granting them nothing keeps the cached context — and the cost — smaller.
 */
function allowedToolsFor(taskType: AiTaskType): string | null {
  return taskType === "score" ? "WebSearch WebFetch" : null;
}

/**
 * Queue an AI task for an application.
 *
 * With AI_PROVIDER=mock the fixture runs inline and the row is marked succeeded
 * immediately, so development has no waiting. With `claude_local` the row is
 * left `queued` for the worker on the Mac to claim — the app on Vercel cannot
 * spawn Claude Code itself (D3 + D4).
 */
export async function enqueueTask(
  applicationId: string,
  taskType: AiTaskType,
): Promise<{ id: string; status: "queued" | "succeeded" }> {
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

  // Don't stack duplicate work for the same task.
  const [inFlight] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.applicationId, applicationId),
        eq(aiJobs.taskType, taskType),
        sql`${aiJobs.status} in ('queued','running')`,
      ),
    )
    .limit(1);

  if (inFlight) return { id: inFlight.id, status: "queued" };

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
  };

  const model = modelFor(taskType);

  if (env.AI_PROVIDER === "mock") {
    const result = await new MockProvider().run(context, "", model);
    const [created] = await db
      .insert(aiJobs)
      .values({
        applicationId,
        taskType,
        status: "succeeded",
        provider: "mock",
        model,
        effort: env.AI_EFFORT,
        result: { markdown: result.markdown, payload: result.payload },
        startedAt: sql`now()`,
        finishedAt: sql`now()`,
      })
      .returning({ id: aiJobs.id });

    await settleAiJobs(applicationId);
    return { id: created.id, status: "succeeded" };
  }

  // Prompt is frozen at enqueue time so the worker stays domain-free and a
  // replay reproduces the identical request.
  const prompt = await buildPrompt(context);

  const [created] = await db
    .insert(aiJobs)
    .values({
      applicationId,
      taskType,
      status: "queued",
      provider: "claude_local",
      model,
      effort: env.AI_EFFORT,
      allowedTools: allowedToolsFor(taskType),
      prompt,
    })
    .returning({ id: aiJobs.id });

  return { id: created.id, status: "queued" };
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

    const docType = AI_TASK_DOCUMENT[job.taskType];

    await db.transaction(async (tx) => {
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
        contentMd: parsed.markdown,
        generatedBy: job.provider,
        model: job.model,
        generatedAt: job.finishedAt ?? sql`now()`,
      });

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
