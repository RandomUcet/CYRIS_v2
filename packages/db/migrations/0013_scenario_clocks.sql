CREATE TABLE IF NOT EXISTS "scenario_clocks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL UNIQUE REFERENCES "events"("id") ON DELETE CASCADE,
  "mode" varchar(32) NOT NULL DEFAULT 'REAL_TIME',
  "scenario_base_time" timestamptz,
  "real_base_time" timestamptz,
  "paused_at" timestamptz,
  "paused_scenario_time" timestamptz,
  "speed_multiplier" integer NOT NULL DEFAULT 1,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "scenario_clocks_event_idx" ON "scenario_clocks" ("event_id");
