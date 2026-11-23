CREATE TABLE "exercise_broadcast_plans" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" varchar(16) NOT NULL,
  "audience" varchar(8) NOT NULL,
  "unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE SET NULL,
  "title" varchar(120) NOT NULL,
  "message" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'DRAFT',
  "scheduled_at" timestamptz,
  "sent_at" timestamptz,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 1,
  "failure_code" varchar(40),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "excon_plan_kind_check" CHECK ("kind" IN ('INFO','UPDATE','INSTRUCTION','URGENT')),
  CONSTRAINT "excon_plan_audience_check" CHECK ("audience" IN ('ALL','UNIT')),
  CONSTRAINT "excon_plan_target_check" CHECK (("audience"='UNIT' AND "unit_id" IS NOT NULL) OR ("audience"='ALL' AND "unit_id" IS NULL)),
  CONSTRAINT "excon_plan_status_check" CHECK ("status" IN ('DRAFT','SCHEDULED','SENT','CANCELLED','FAILED')),
  CONSTRAINT "excon_plan_schedule_check" CHECK ("status"<>'SCHEDULED' OR "scheduled_at" IS NOT NULL),
  CONSTRAINT "excon_plan_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "excon_plan_delivered_check" CHECK ("delivered_count" >= 0),
  CONSTRAINT "excon_plan_text_check" CHECK (length(btrim("title")) BETWEEN 3 AND 120 AND length(btrim("message")) BETWEEN 3 AND 900)
);
--> statement-breakpoint
CREATE INDEX "excon_plan_due_idx" ON "exercise_broadcast_plans"("status","scheduled_at");
--> statement-breakpoint
CREATE INDEX "excon_plan_event_created_idx" ON "exercise_broadcast_plans"("event_id","created_at");
