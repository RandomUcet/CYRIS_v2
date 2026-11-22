CREATE TABLE "court_request_updates" (
  "id" uuid PRIMARY KEY NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "court_requests"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "status" varchar(32) NOT NULL,
  "response" text NOT NULL,
  "linked_resource_id" uuid REFERENCES "resources"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "court_request_updates_revision_positive" CHECK ("revision" > 1),
  CONSTRAINT "court_request_updates_status_check" CHECK ("status" IN ('IN_PROGRESS','FULFILLED','DECLINED')),
  CONSTRAINT "court_request_updates_nonempty_response" CHECK (length(btrim("response")) >= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "court_request_updates_revision_unique" ON "court_request_updates"("request_id","revision");
--> statement-breakpoint
CREATE INDEX "court_request_updates_request_date_idx" ON "court_request_updates"("request_id","created_at");
