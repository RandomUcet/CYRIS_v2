CREATE TABLE "jsoc_synthetic_logs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "observed_at" timestamptz NOT NULL,
  "category" varchar(20) NOT NULL CHECK ("category" IN ('AUTH','NETWORK','DNS','ENDPOINT','APPLICATION')),
  "severity" varchar(20) NOT NULL CHECK ("severity" IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  "source" varchar(120) NOT NULL,
  "message" text NOT NULL,
  "source_address" varchar(64),
  "destination_address" varchar(64),
  "scenario" varchar(160) NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "jsoc_logs_event_time_idx" ON "jsoc_synthetic_logs" ("event_id","observed_at");
--> statement-breakpoint
CREATE INDEX "jsoc_logs_event_severity_idx" ON "jsoc_synthetic_logs" ("event_id","severity","observed_at");
