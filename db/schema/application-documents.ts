import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { GenerationSummary } from "@/lib/ai/types";
import type { DocumentType } from "@/lib/config/constants";
import { applications } from "./applications";

/**
 * APPLICATION_DOCUMENTS (JSV2S1078, JSV2S1079).
 *
 * Content is stored as markdown directly in Postgres. The PRD says no PDF
 * library initially, so Phase 1 needs no Supabase Storage at all — one less
 * dependency. `storagePath` is reserved for when PDFs become real.
 *
 * Versioned rather than overwritten: regenerating a resume keeps the previous
 * one, which matters when an attempt referenced it.
 */
export const applicationDocuments = pgTable(
  "application_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    attemptId: uuid("attempt_id"),

    docType: text("doc_type").$type<DocumentType>().notNull(),
    version: integer("version").notNull().default(1),

    contentMd: text("content_md"),

    /**
     * The CVG output summary for this generation — classification, match
     * uplift, keyword coverage, gaps, verdict.
     *
     * Rendered in the workspace in place of the document body: the .docx is
     * the deliverable, so the screen should show what changed and why.
     */
    summary: jsonb("summary").$type<GenerationSummary>(),

    /** Null in Phase 1 — reserved for Supabase Storage. */
    storagePath: text("storage_path"),

    /** `mock`, `gemini_api` or `anthropic_api`. */
    generatedBy: text("generated_by"),
    model: text("model"),

    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("application_documents_version_uq").on(
      t.applicationId,
      t.docType,
      t.version,
    ),
    index("application_documents_app_idx").on(t.applicationId),
  ],
);

export type ApplicationDocument = typeof applicationDocuments.$inferSelect;
export type NewApplicationDocument = typeof applicationDocuments.$inferInsert;
