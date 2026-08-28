import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { ApplicationStatus, EventType } from "@/lib/config/constants";
import { applicationAttempts } from "./application-attempts";
import { applications } from "./applications";

/**
 * APPLICATION_EVENTS — append-only.
 *
 * Deliberately one table serving both JSV2S1084 (status history) and JSV2S1097
 * (activity timeline). Two tables would mean two versions of the same truth.
 *
 * This is also the raw material for every Phase 3 metric — funnel conversion,
 * ghost rate, time analysis. None of those can be computed retroactively if the
 * transitions are not captured now, which is why it ships in Phase 1 even
 * though Application Analytics does not.
 */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),

    attemptId: uuid("attempt_id").references(() => applicationAttempts.id, {
      onDelete: "set null",
    }),

    eventType: text("event_type").$type<EventType>().notNull(),

    fromStatus: text("from_status").$type<ApplicationStatus>(),
    toStatus: text("to_status").$type<ApplicationStatus>(),

    /** Human-readable line rendered in the timeline. */
    summary: text("summary").notNull(),

    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("application_events_app_time_idx").on(t.applicationId, t.occurredAt),
    index("application_events_type_idx").on(t.eventType),
  ],
);

export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type NewApplicationEvent = typeof applicationEvents.$inferInsert;
