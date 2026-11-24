CREATE TABLE "exercise_advice" (
 "run_id" uuid PRIMARY KEY NOT NULL,
 "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "blueprint_revision" integer,
 "mode" varchar(16) NOT NULL CHECK ("mode" IN ('ARCHITECT','INTERVENTION')),
 "model" varchar(128) NOT NULL,
 "duration_ms" integer NOT NULL CHECK ("duration_ms">=0),
 "generated_at" timestamptz NOT NULL,
 "observed_at" timestamptz NOT NULL,
 "draft" jsonb NOT NULL,
 "signals" jsonb NOT NULL,
 "reviews" jsonb NOT NULL DEFAULT '[]'::jsonb,
 "revision" integer NOT NULL DEFAULT 1 CHECK ("revision">0),
 FOREIGN KEY ("event_id","blueprint_revision") REFERENCES "exercise_blueprints"("event_id","revision") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "exercise_advice_event_date_idx" ON "exercise_advice"("event_id","generated_at");
