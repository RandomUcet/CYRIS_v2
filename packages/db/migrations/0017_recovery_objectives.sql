CREATE TABLE IF NOT EXISTS "recovery_objectives" (
  "id" uuid PRIMARY KEY,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "disruption_id" uuid NOT NULL REFERENCES "exercise_disruptions"("id") ON DELETE CASCADE,
  "audience_type" varchar(16) NOT NULL,
  "audience_id" uuid,
  "title" varchar(200) NOT NULL,
  "instructions" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "revision" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reviewed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "published_at" timestamptz,
  "reviewed_at" timestamptz,
  CONSTRAINT "recovery_objectives_audience_check" CHECK (
    ("audience_type" = 'EVENT' AND "audience_id" IS NULL) OR
    ("audience_type" IN ('UNIT', 'USER') AND "audience_id" IS NOT NULL)
  ),
  CONSTRAINT "recovery_objectives_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'APPROVED', 'REJECTED', 'RESTORED'))
);
CREATE INDEX IF NOT EXISTS "recovery_objectives_event_status_idx" ON "recovery_objectives" ("event_id", "status");
CREATE INDEX IF NOT EXISTS "recovery_objectives_disruption_idx" ON "recovery_objectives" ("disruption_id");
CREATE TABLE IF NOT EXISTS "recovery_reports" (
  "id" uuid PRIMARY KEY,
  "objective_id" uuid NOT NULL REFERENCES "recovery_objectives"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "recovery_reports_objective_author_idx" ON "recovery_reports" ("objective_id", "author_user_id");
