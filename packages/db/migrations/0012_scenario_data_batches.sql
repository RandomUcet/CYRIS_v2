CREATE TABLE "scenario_data_batches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL,
  "identifier" varchar(32) NOT NULL,
  "generator_version" integer NOT NULL,
  "seed" integer NOT NULL,
  "preset" varchar(32) NOT NULL,
  "configuration" jsonb NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "counts" jsonb,
  "relationship_count" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid,
  "failure_message" varchar(1000),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cleaned_at" timestamp with time zone,
  "cleaned_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "scenario_data_batches" ADD CONSTRAINT "scenario_data_batches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "scenario_data_batches" ADD CONSTRAINT "scenario_data_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "scenario_data_batches" ADD CONSTRAINT "scenario_data_batches_cleaned_by_user_id_users_id_fk" FOREIGN KEY ("cleaned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "scenario_data_batches_event_idx" ON "scenario_data_batches" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "scenario_data_batches_status_idx" ON "scenario_data_batches" USING btree ("status");
