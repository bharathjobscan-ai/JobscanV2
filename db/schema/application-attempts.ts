import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ApplicationChannel, ApplicationStatus } from "@/lib/config/constants";
import { applications } from "./applications";

/**
 * APPLICATION_ATTEMPTS (JSV2S1094–1096).
 *
 * The PRD calls out that re-applying to the same job with a fresh email at the
 * right moment sometimes produces a shortlist, so `emailUsed` is a first-class
 * column and each attempt carries its own outcome.
 *
 * Interaction rule: the user changes status on the *application*. That write
 * updates applications.status, stamps the outcome on the active attempt, and
 * appends an event — all in one transaction (see features/applications/status.ts).
 *
 * resumeDocumentId / coverLetterDocumentId are intentionally plain uuid columns
 * rather than FKs: application_documents references applications, so a FK back
 * would make the two tables mutually dependent for no practical gain here.
 */
export const applicationAttempts = pgTable(
  "application_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    attemptNumber: integer("attempt_number").notNull(),

    appliedAt: timestamp("applied_at", { withTimezone: true }),
    channel: text("channel").$type<ApplicationChannel>(),

    /** The address this attempt was sent from. */
    emailUsed: text("email_used"),

    resumeDocumentId: uuid("resume_document_id"),
    coverLetterDocumentId: uuid("cover_letter_document_id"),

    /** Terminal status reached by this specific attempt. */
    outcome: text("outcome").$type<ApplicationStatus>(),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("application_attempts_number_uq").on(
      t.applicationId,
      t.attemptNumber,
    ),
  ],
);

export type ApplicationAttempt = typeof applicationAttempts.$inferSelect;
export type NewApplicationAttempt = typeof applicationAttempts.$inferInsert;
