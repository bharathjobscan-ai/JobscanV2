import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type {
  IngestionRunStatus,
  IngestionStage,
  IngestionTrigger,
} from "@/lib/config/constants";

/**
 * INGESTION_RUNS (JSV2S1010) — one row per source execution.
 *
 * Phase 1 reported upload results in-session and persisted nothing, which is
 * fine while a human is watching. A scheduled run (JSV2S1016) has no one
 * watching, so "did last night's fetch work, and what did it bring back?" has
 * to be answerable from the database alone.
 *
 * Counts live here as columns rather than being derived from `raw_jobs`
 * (JSV2S1012). Derivation cannot see what a run *rejected* — those rows do not
 * exist — so a fetch that silently dropped everything would look identical to a
 * fetch that found nothing.
 */
export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    source: text("source").notNull(),
    trigger: text("trigger").$type<IngestionTrigger>().notNull(),
    status: text("status").$type<IngestionRunStatus>().notNull().default("running"),

    /** The fetch parameters used, so a run is reproducible (JSV2S1020). */
    params: jsonb("params"),

    // JSV2S1012 — the funnel, in the order rows move through it.
    fetched: integer("fetched").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    reposted: integer("reposted").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),

    /**
     * JSV2S1011 — structured stage records, newest last. Kept on the run rather
     * than in a log table: they are only ever read for one run at a time, and
     * this way they cascade away with it.
     */
    logs: jsonb("logs").$type<IngestionLogEntry[]>(),

    /** Set when the run itself failed, as opposed to individual rows. */
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("ingestion_runs_source_idx").on(t.source, t.startedAt),
    index("ingestion_runs_started_idx").on(t.startedAt),
  ],
);

export type IngestionLogEntry = {
  stage: IngestionStage;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
  detail?: Record<string, unknown>;
};

export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
