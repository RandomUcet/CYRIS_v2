CREATE TABLE "exercise_jobs" (
 "id" uuid PRIMARY KEY NOT NULL,
 "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "request_id" uuid NOT NULL,
 "mode" varchar(16) NOT NULL CHECK ("mode" IN ('ARCHITECT','INTERVENTION')),
 "blueprint_revision" integer,
 "input" jsonb,
 "status" varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED')),
 "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 3),
 "claim_token" uuid,
 "lease_until" timestamptz,
 "available_at" timestamptz NOT NULL DEFAULT now(),
 "created_at" timestamptz NOT NULL DEFAULT now(),
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 "result_run_id" uuid,
 "error_code" varchar(40),
 UNIQUE ("event_id","created_by","request_id"),
 CHECK (("status"='RUNNING') = ("claim_token" IS NOT NULL AND "lease_until" IS NOT NULL)),
 CHECK (("status" IN ('QUEUED','RUNNING')) = ("input" IS NOT NULL)),
 CHECK (("status"='SUCCEEDED') = ("result_run_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "exercise_jobs_dispatch_idx" ON "exercise_jobs"("status","available_at","created_at");
--> statement-breakpoint
CREATE INDEX "exercise_jobs_event_idx" ON "exercise_jobs"("event_id","created_at");
