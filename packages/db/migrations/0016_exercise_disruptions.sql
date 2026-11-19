CREATE TABLE IF NOT EXISTS "exercise_disruptions" (
  "id" uuid PRIMARY KEY,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "target_type" varchar(16) NOT NULL,
  "target_id" uuid,
  "module" varchar(64) NOT NULL,
  "mode" varchar(32) NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "expires_at" timestamptz,
  "reason" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "restored_at" timestamptz,
  "restored_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_disruptions_target_type_check" CHECK ("target_type" IN ('EVENT', 'UNIT', 'USER')),
  CONSTRAINT "exercise_disruptions_mode_check" CHECK ("mode" IN ('UNAVAILABLE', 'READ_ONLY', 'DEGRADED')),
  CONSTRAINT "exercise_disruptions_window_check" CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at"),
  CONSTRAINT "exercise_disruptions_target_check" CHECK (
    ("target_type" = 'EVENT' AND "target_id" IS NULL) OR
    ("target_type" IN ('UNIT', 'USER') AND "target_id" IS NOT NULL)
  )
);
