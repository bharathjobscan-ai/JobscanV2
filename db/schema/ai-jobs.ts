import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { AiJobStatus, AiTaskType } from "@/lib/config/constants";
import { applications } from "./applications";

/**
 * AI_JOBS — the run ledger: one row per AI call (D4).
 *
 * Originally the work queue for a local Claude Code worker. That worker was
 * retired in ADR-0005 — providers are now called inline and synchronously, and
 * a row is inserted already at `succeeded`. What the table is *for* changed with
 * it: it is now the record of what was asked, which model answered, and — via
 * `usage` — what it cost. JSV2S1132 reads cost from here.
 *
 * The prompt is stored verbatim so a run is reproducible and auditable after the
 * fact, which matters more now that the prompt text is the main lever on both
 * output quality and token spend.
 *
 * DEBRIS: `status` still allows `queued`/`running`, `attempts` is never
 * incremented, and `ai_jobs_status_queued_idx` indexes a state nothing writes.
 * JSV2S1136 must revive these for the scheduled path or drop them. Their
 * presence is not evidence that a queue exists.
 */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    taskType: text("task_type").$type<AiTaskType>().notNull(),
    status: text("status").$type<AiJobStatus>().notNull().default("queued"),

    provider: text("provider"),
    model: text("model"),
    effort: text("effort"),

    /**
     * Tools Claude Code may use for this task, space-separated.
     *
     * Scoring needs WebSearch — ScoreG verifies sponsor-register status live,
     * and without it the visa pillar is capped. CV and cover letter work from
     * the JD and master resume alone, so they get none: fewer tool definitions
     * means a smaller cached context and a cheaper run.
     */
    allowedTools: text("allowed_tools"),

    prompt: text("prompt"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),

    /**
     * Real token counts reported by Claude Code, captured per run so cost per
     * job is measured rather than estimated. See lib/ai/pricing.ts.
     */
    usage: jsonb("usage").$type<{
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      reportedCostUsd?: number;
      durationMs?: number;
    }>(),

    /** Incremented on claim, so a crashed run can be retried but not forever. */
    attempts: integer("attempts").notNull().default(0),

    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),

    /**
     * When the app promoted this result into documents/score/events.
     *
     * A provider only returns a raw result; every piece of domain logic stays in
     * `settleAiJobs` (features/ai/tasks.ts), which is the single write path from
     * AI output to domain objects. Separating the two keeps handling of a
     * malformed response in one place, and makes settling idempotent and
     * re-runnable — the property JSV2S1136 needs for a scheduled run.
     */
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_jobs_status_queued_idx").on(t.status, t.queuedAt),
    index("ai_jobs_application_idx").on(t.applicationId),
  ],
);

export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;
