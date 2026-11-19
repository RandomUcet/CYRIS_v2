CREATE UNIQUE INDEX IF NOT EXISTS "recovery_reports_objective_author_unique"
  ON "recovery_reports" ("objective_id", "author_user_id");

CREATE TABLE IF NOT EXISTS "recovery_artifacts" (
  "id" uuid PRIMARY KEY,
  "objective_id" uuid NOT NULL REFERENCES "recovery_objectives"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "filename" varchar(128) NOT NULL,
  "mime_type" varchar(64) NOT NULL DEFAULT 'text/plain',
  "body" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "revision" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_artifacts_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT "recovery_artifacts_mime_check" CHECK ("mime_type" = 'text/plain')
);
CREATE INDEX IF NOT EXISTS "recovery_artifacts_objective_idx"
  ON "recovery_artifacts" ("objective_id", "status");
