CREATE TABLE "raw_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"source_job_id" text,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text,
	"country" text,
	"description" text,
	"job_url" text NOT NULL,
	"external_apply_url" text,
	"posted_at" date,
	"employment_type" text,
	"seniority" text,
	"salary_raw" text,
	"visa_sponsorship_mentioned" boolean,
	"ingestion_method" text DEFAULT 'manual_upload' NOT NULL,
	"inbound_source_detail" text,
	"notes" text,
	"raw_payload" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_job_id" uuid NOT NULL,
	"status" text DEFAULT 'ready_to_apply' NOT NULL,
	"match_category" text,
	"job_score" integer,
	"job_score_analysis" jsonb,
	"job_score_generated_at" timestamp with time zone,
	"visa_signal" text,
	"referral_status" text DEFAULT 'not_needed' NOT NULL,
	"referrer_name" text,
	"referral_notes" text,
	"applied_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_raw_job_id_unique" UNIQUE("raw_job_id")
);
--> statement-breakpoint
CREATE TABLE "application_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"applied_at" timestamp with time zone,
	"channel" text,
	"email_used" text,
	"resume_document_id" uuid,
	"cover_letter_document_id" uuid,
	"outcome" text,
	"outcome_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt_id" uuid,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"attempt_id" uuid,
	"doc_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_md" text,
	"storage_path" text,
	"generated_by" text,
	"model" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"effort" text,
	"prompt" text,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_raw_job_id_raw_jobs_id_fk" FOREIGN KEY ("raw_job_id") REFERENCES "public"."raw_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_attempts" ADD CONSTRAINT "application_attempts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_attempt_id_application_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."application_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_jobs_source_job_id_uq" ON "raw_jobs" USING btree ("source","source_job_id") WHERE "raw_jobs"."source_job_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_jobs_fingerprint_uq" ON "raw_jobs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "raw_jobs_company_idx" ON "raw_jobs" USING btree ("company");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_last_activity_idx" ON "applications" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "applications_applied_at_idx" ON "applications" USING btree ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_attempts_number_uq" ON "application_attempts" USING btree ("application_id","attempt_number");--> statement-breakpoint
CREATE INDEX "application_events_app_time_idx" ON "application_events" USING btree ("application_id","occurred_at");--> statement-breakpoint
CREATE INDEX "application_events_type_idx" ON "application_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "application_documents_version_uq" ON "application_documents" USING btree ("application_id","doc_type","version");--> statement-breakpoint
CREATE INDEX "application_documents_app_idx" ON "application_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_queued_idx" ON "ai_jobs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_application_idx" ON "ai_jobs" USING btree ("application_id");