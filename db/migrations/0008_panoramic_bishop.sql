CREATE TABLE "sponsor_licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_name" text NOT NULL,
	"normalised_name" text NOT NULL,
	"core_name" text NOT NULL,
	"town_city" text,
	"county" text,
	"type_rating" text,
	"route" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sponsor_licences_normalised_idx" ON "sponsor_licences" USING btree ("normalised_name");--> statement-breakpoint
CREATE INDEX "sponsor_licences_core_idx" ON "sponsor_licences" USING btree ("core_name");