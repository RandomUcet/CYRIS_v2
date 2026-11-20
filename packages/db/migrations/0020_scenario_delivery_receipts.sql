-- The earlier standalone patch used the support migration timestamp for receipts.
-- Also install support on databases that already applied that alternate migration.
CREATE TABLE IF NOT EXISTS "support_requests" (
"id" uuid PRIMARY KEY,
"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
"requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
"category" varchar(24) NOT NULL CHECK ("category" IN ('NAVIGATION','TASK','TECHNICAL','OTHER')),
"subject" varchar(160) NOT NULL,
"status" varchar(16) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','ANSWERED','RESOLVED')),
"revision" integer NOT NULL DEFAULT 1 CHECK ("revision" > 0),
"created_at" timestamptz NOT NULL DEFAULT now(),
"updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_event_status_idx" ON "support_requests" ("event_id","status","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_requests_requester_idx" ON "support_requests" ("event_id","requester_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_messages" (
"id" uuid PRIMARY KEY,
"request_id" uuid NOT NULL REFERENCES "support_requests"("id") ON DELETE CASCADE,
"author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
"author_kind" varchar(16) NOT NULL CHECK ("author_kind" IN ('PARTICIPANT','EXCON')),
"body" text NOT NULL CHECK (length("body") BETWEEN 1 AND 4000),
"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_request_idx" ON "support_messages" ("request_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scenario_briefing_receipts (
  id uuid PRIMARY KEY,
  release_id uuid NOT NULL REFERENCES scenario_inject_releases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz,
  acknowledged_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS scenario_briefing_receipts_release_user_idx
  ON scenario_briefing_receipts(release_id, user_id);

-- A direct delivery identifies its reader; a historic broadcast does not.
-- Preserve direct receipts, never attribute broadcast acknowledgement to every participant.
INSERT INTO scenario_briefing_receipts(id, release_id, user_id, read_at, acknowledged_at)
SELECT min(id::text)::uuid, release_id, recipient_user_id, min(read_at), min(acknowledged_at)
FROM scenario_deliveries
WHERE recipient_user_id IS NOT NULL AND (read_at IS NOT NULL OR acknowledged_at IS NOT NULL)
GROUP BY release_id, recipient_user_id
ON CONFLICT (release_id, user_id) DO NOTHING;

-- Conditions may reference injects or recovery objectives, not only resource registry rows.
ALTER TABLE scenario_inject_conditions DROP CONSTRAINT IF EXISTS scenario_inject_conditions_target_resource_id_resources_id_fk;
