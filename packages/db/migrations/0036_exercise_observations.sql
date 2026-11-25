CREATE TABLE "exercise_observations" (
 "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
 "bucket_at" timestamptz NOT NULL,
 "observed_at" timestamptz NOT NULL,
 "pending" integer NOT NULL CHECK ("pending">=0),
 "review_after_hours" integer NOT NULL CHECK ("review_after_hours" BETWEEN 1 AND 72),
 "unchanged" integer NOT NULL CHECK ("unchanged" BETWEEN 0 AND "pending"),
 "blocked" integer NOT NULL CHECK ("blocked" BETWEEN 0 AND "pending"),
 PRIMARY KEY ("event_id","bucket_at"),
 CHECK ("observed_at">="bucket_at" AND "observed_at"<"bucket_at"+interval '15 minutes')
);
--> statement-breakpoint
ALTER TABLE "exercise_advice" ADD COLUMN "observations" jsonb NOT NULL DEFAULT '[]'::jsonb;
