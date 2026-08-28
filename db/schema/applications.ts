import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ApplicationStatus,
  MatchCategory,
  ReferralStatus,
} from "@/lib/config/constants";
import { rawJobs } from "./raw-jobs";

/** Structure of `jobScoreAnalysis` (JSV2S1081). */
export type JobScoreAnalysis = {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  visaSignals?: string[];
  breakdown?: Record<string, number | string>;
};

/**
 * APPLICATIONS — the application workspace record.
 *
 * D1: in Phase 1 exactly one is auto-created per uploaded job, because uploads
 * are pre-filtered outside the system. The 1:1 is enforced by the unique index
 * on raw_job_id; Phase 2 will add raw jobs that never become applications.
 *
 * Referral lives here as columns rather than its own table: there is at most one
 * referral per application (JSV2S1086–1088), so a table would be ceremony.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    rawJobId: uuid("raw_job_id")
      .notNull()
      .unique()
      .references(() => rawJobs.id, { onDelete: "cascade" }),

    status: text("status")
      .$type<ApplicationStatus>()
      .notNull()
      .default("ready_to_apply"),

    /** C3 — free text until the ScoreG taxonomy is frozen. */
    matchCategory: text("match_category").$type<MatchCategory>(),

    jobScore: integer("job_score"),
    jobScoreAnalysis: jsonb("job_score_analysis").$type<JobScoreAnalysis>(),
    jobScoreGeneratedAt: timestamp("job_score_generated_at", {
      withTimezone: true,
    }),
    visaSignal: text("visa_signal"),

    referralStatus: text("referral_status")
      .$type<ReferralStatus>()
      .notNull()
      .default("not_needed"),
    referrerName: text("referrer_name"),
    referralNotes: text("referral_notes"),

    /** First submission. Drives the derived `deemed_pending` view state (C2). */
    appliedAt: timestamp("applied_at", { withTimezone: true }),

    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("applications_status_idx").on(t.status),
    index("applications_last_activity_idx").on(t.lastActivityAt),
    index("applications_applied_at_idx").on(t.appliedAt),
  ],
);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
