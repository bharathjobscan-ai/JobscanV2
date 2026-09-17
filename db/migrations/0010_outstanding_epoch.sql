ALTER TABLE "raw_jobs" ADD COLUMN "ingestion_run_id" uuid;--> statement-breakpoint
ALTER TABLE "raw_jobs" ADD CONSTRAINT "raw_jobs_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_jobs_ingestion_run_idx" ON "raw_jobs" USING btree ("ingestion_run_id");