ALTER TABLE "raw_jobs" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD COLUMN "prequalification" text;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD COLUMN "prequalification_detail" jsonb;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD COLUMN "prequalified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD COLUMN "prequalification_version" text;--> statement-breakpoint
CREATE INDEX "raw_jobs_prequalification_idx" ON "raw_jobs" USING btree ("prequalification");