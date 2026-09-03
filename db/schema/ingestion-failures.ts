import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { IngestionStage } from "@/lib/config/constants";
import { ingestionRuns } from "./ingestion-runs";

/**
 * INGESTION_FAILURES (JSV2S1015) — the dead-letter queue.
 *
 * A row that fails validation or mapping is preserved here with its original
 * payload and the error, so the run continues (JSV2S1013) and the failure can
 * be investigated or reprocessed later. Phase 1 already isolated failures at
 * row level but discarded them at the end of the request; this makes them
 * durable.
 *
 * Its own table rather than a column on `ingestion_runs` because there are many
 * failures per run, and the payloads are large enough that loading them
 * alongside every run listing would be wasteful.
 */
export const ingestionFailures = pgTable(
  "ingestion_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    runId: uuid("run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "cascade" }),

    source: text("source").notNull(),
    stage: text("stage").$type<IngestionStage>().notNull(),

    /** The record as the source gave it, verbatim — the point of the table. */
    payload: jsonb("payload").notNull(),
    error: text("error").notNull(),

    /**
     * Set when this payload has been successfully reprocessed, so a retry sweep
     * can skip it without deleting the evidence that it once failed.
     */
    reprocessedAt: timestamp("reprocessed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ingestion_failures_run_idx").on(t.runId),
    index("ingestion_failures_open_idx").on(t.reprocessedAt),
  ],
);

export type IngestionFailure = typeof ingestionFailures.$inferSelect;
export type NewIngestionFailure = typeof ingestionFailures.$inferInsert;
