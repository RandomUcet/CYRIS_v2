CREATE TABLE "court_requests" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "court_case_id" uuid NOT NULL REFERENCES "court_cases"("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "details" text NOT NULL,
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requested_from_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE SET NULL,
  "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "revision" integer NOT NULL DEFAULT 1,
  "due_at" timestamptz,
  "response" text,
  "linked_resource_id" uuid REFERENCES "resources"("id") ON DELETE SET NULL,
  "responded_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "responded_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "court_requests_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','FULFILLED','DECLINED','CANCELLED')),
  CONSTRAINT "court_requests_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "court_requests_kind_check" CHECK ("kind" IN ('EVIDENCE','DOCUMENT','FORENSIC_REPORT','LAB_REPORT','MEDICAL_REPORT','EXPERT_OPINION','OTHER'))
);
--> statement-breakpoint
CREATE INDEX "court_requests_event_idx" ON "court_requests"("event_id","status");
--> statement-breakpoint
CREATE INDEX "court_requests_case_idx" ON "court_requests"("court_case_id","created_at");
--> statement-breakpoint
CREATE INDEX "court_requests_recipient_idx" ON "court_requests"("event_id","requested_from_unit_id","status");
