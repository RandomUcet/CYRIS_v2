CREATE TABLE IF NOT EXISTS "command_defcon_states" (
  "event_id" uuid PRIMARY KEY REFERENCES "events"("id") ON DELETE CASCADE,
  "level" integer,
  "revision" integer NOT NULL DEFAULT 0,
  "reason" text,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'command_defcon_states_level_check'
  ) THEN
    ALTER TABLE "command_defcon_states"
      ADD CONSTRAINT "command_defcon_states_level_check"
      CHECK ("level" IS NULL OR "level" BETWEEN 1 AND 5);
  END IF;
END $$;
