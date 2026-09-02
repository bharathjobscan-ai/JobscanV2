/**
 * Benchmark a provider/model against the same job the Claude runs used.
 *
 *   BENCH_MODEL=gemini-3.1-pro-preview npm run ai:bench
 *
 * Scores the most recently scored application again and prints tokens,
 * latency and the resulting score, so providers can be compared on identical
 * input. Real API calls are made, so this costs money and is deliberately not
 * part of `npm test`.
 */
import { describe, expect, it } from "vitest";

process.loadEnvFile(".env.local");

const TASK = (process.env.BENCH_TASK ?? "score") as "score" | "tailor_cv";
const MODEL = process.env.BENCH_MODEL;

// Run against whatever the app is configured to use, unless a model is named.
process.env.AI_PROVIDER = "live";
if (MODEL) {
  if (TASK === "score") process.env.MODEL_SCORING_GEMINI = MODEL;
  else process.env.MODEL_CV = MODEL;
}

const { eq, desc } = await import("drizzle-orm");
const { db } = await import("@/lib/db/client");
const { aiJobs, applications, rawJobs } = await import("@/db/schema");
const { enqueueTask } = await import("@/features/ai/tasks");

describe(`benchmark — ${TASK}`, () => {
  it("runs the task and reports usage", async () => {
    const [target] = await db
      .select({
        id: applications.id,
        title: rawJobs.title,
        company: rawJobs.company,
      })
      .from(applications)
      .innerJoin(rawJobs, eq(applications.rawJobId, rawJobs.id))
      .where(eq(applications.status, "ready_to_apply"))
      .orderBy(desc(applications.lastActivityAt))
      .limit(1);

    expect(target, "no application to score — upload a job first").toBeDefined();

    const started = Date.now();
    const result = await enqueueTask(target.id, TASK);
    const elapsed = Date.now() - started;

    expect(result.status).toBe("succeeded");

    const [job] = await db
      .select()
      .from(aiJobs)
      .where(eq(aiJobs.id, result.id))
      .limit(1);

    const { applicationDocuments } = await import("@/db/schema");
    const docs = await db
      .select({
        docType: applicationDocuments.docType,
        version: applicationDocuments.version,
        chars: applicationDocuments.contentMd,
      })
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, target.id));

    const [scored] = await db
      .select({
        score: applications.jobScore,
        band: applications.matchCategory,
        visa: applications.visaSignal,
        analysis: applications.jobScoreAnalysis,
      })
      .from(applications)
      .where(eq(applications.id, target.id))
      .limit(1);

    const u = job.usage;
    const breakdown = Array.isArray(scored.analysis?.breakdown)
      ? scored.analysis.breakdown.length
      : 0;

    console.log(
      [
        "",
        `─── ${MODEL} ───`,
        `job:        ${target.title} @ ${target.company}`,
        `latency:    ${(elapsed / 1000).toFixed(1)}s`,
        `input:      ${u?.inputTokens ?? 0}`,
        `output:     ${u?.outputTokens ?? 0} (incl. reasoning)`,
        `cache read: ${u?.cacheReadTokens ?? 0}`,
        `score:      ${scored.score}  band: ${scored.band}`,
        `breakdown:  ${breakdown} line items`,
        `visa:       ${(scored.visa ?? "").slice(0, 120)}`,
        `provider:   ${job.provider} / ${job.model}`,
        `documents:  ${docs.map((d) => `${d.docType} v${d.version} (${(d.chars ?? "").length}c)`).join(", ") || "none"}`,
        "",
      ].join("\n"),
    );

    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);
  }, 300_000);
});
