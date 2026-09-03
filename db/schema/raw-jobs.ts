import { sql } from "drizzle-orm";
import type { PrequalDecision } from "@/lib/config/constants";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * RAW_JOBS (JSV2S1007, JSV2S1009) — the canonical job record.
 *
 * In Phase 1 every row arrives from a manual upload. This table is deliberately
 * source-agnostic so Phase 2 adapters can write to it unchanged.
 */
export const rawJobs = pgTable(
  "raw_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** JSV2S1008 — lets historical rows be reprocessed as the model evolves. */
    schemaVersion: integer("schema_version").notNull().default(1),

    source: text("source").notNull(),
    sourceJobId: text("source_job_id"),

    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    country: text("country"),

    /** Full JD text. Nullable, but ScoreG and CVG cannot run without it. */
    description: text("description"),

    jobUrl: text("job_url").notNull(),
    externalApplyUrl: text("external_apply_url"),

    postedAt: date("posted_at"),
    employmentType: text("employment_type"),
    seniority: text("seniority"),
    salaryRaw: text("salary_raw"),
    visaSponsorshipMentioned: boolean("visa_sponsorship_mentioned"),

    ingestionMethod: text("ingestion_method").notNull().default("manual_upload"),

    /** JSV2S1034 — referral, recruiter, external portal, networking lead. */
    inboundSourceDetail: text("inbound_source_detail"),

    /**
     * How a human can be reached about this role. Feeds ScoreG's Reachability
     * component (Pillar 3D, 0-15), which is manual input by design.
     */
    reachability: text("reachability"),
    notes: text("notes"),

    /** The original uploaded row, verbatim, for reprocessing and debugging. */
    rawPayload: jsonb("raw_payload").notNull(),

    /** Dedupe fallback when the source gives no stable id (JSV2S1039). */
    fingerprint: text("fingerprint").notNull(),

    /**
     * JSV2S1040 — hash of the substantive content, for New/Updated/Reposted.
     *
     * Separate from `fingerprint`, which is job *identity* and must stay stable
     * while a posting is edited. This one is meant to change: that is the
     * signal. Nullable so rows ingested before this column existed are visibly
     * un-hashed rather than silently wrong.
     */
    contentHash: text("content_hash"),

    // --- Pre-qualification (JSV2S1037, 1038, 1055) -------------------------
    //
    // The gate lives on `raw_jobs` rather than `applications` because its whole
    // purpose is to decide whether an application should exist at all. A
    // screened-out job keeps its row here and has no application.

    /** `pass` / `review` / `reject`. Null means not yet evaluated. */
    prequalification: text("prequalification").$type<PrequalDecision>(),

    /** The full explainable result — every matched rule, term and score. */
    prequalificationDetail: jsonb("prequalification_detail"),

    prequalifiedAt: timestamp("prequalified_at", { withTimezone: true }),

    /**
     * Config fingerprint at evaluation time.
     *
     * Adding a role or a country should let you find everything that was
     * rejected under the old rules: `where prequalification_version <> $current`.
     * Without it a config change silently strands its own history.
     */
    prequalificationVersion: text("prequalification_version"),

    /** JSV2S1041 — supports repost and active-listing detection later. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Identity hierarchy: prefer the source's own id when it exists.
    uniqueIndex("raw_jobs_source_job_id_uq")
      .on(t.source, t.sourceJobId)
      .where(sql`${t.sourceJobId} is not null`),
    uniqueIndex("raw_jobs_fingerprint_uq").on(t.fingerprint),
    index("raw_jobs_company_idx").on(t.company),
    // The review queue and the scheduled scorer both filter on this.
    index("raw_jobs_prequalification_idx").on(t.prequalification),
  ],
);

export type RawJob = typeof rawJobs.$inferSelect;
export type NewRawJob = typeof rawJobs.$inferInsert;
