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
 * AI_JOBS — the work queue for the local Claude Code worker (D4).
 *
 * Vercel cannot spawn Claude Code, so the app enqueues here and a worker on the
 * Mac (workers/ai/run.mjs) claims rows, runs `claude -p`, and writes results
 * back. A table plus a polling loop — no Redis, no queue service.
 *
 * The prompt is assembled and frozen at enqueue time so the worker needs no
 * knowledge of the domain, and so a replayed job reproduces the same request.
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

    prompt: text("prompt"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),

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
     * The worker only fetches and stores a raw result; every piece of domain
     * logic stays in TypeScript in features/ai/tasks.ts. That is why the worker
     * can be a small dependency-free script instead of a second copy of the
     * write path.
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
