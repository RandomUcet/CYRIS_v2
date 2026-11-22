-- Administrative write locks are distinct from simulated exercise disruptions.
CREATE TABLE "exercise_operation_holds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "target_type" varchar(16) NOT NULL,
  "target_id" uuid,
  "module" varchar(32) NOT NULL DEFAULT 'ALL',
  "reason" text NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "expires_at" timestamptz,
  "revision" integer NOT NULL DEFAULT 1,
  "restored_at" timestamptz,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "restored_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_operation_holds_target_check" CHECK (
    ("target_type" = 'EVENT' AND "target_id" IS NULL) OR
    ("target_type" IN ('UNIT', 'USER') AND "target_id" IS NOT NULL)
  ),
  CONSTRAINT "exercise_operation_holds_window_check" CHECK (
    "expires_at" IS NULL OR "expires_at" > "starts_at"
  ),
  CONSTRAINT "exercise_operation_holds_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX "exercise_operation_holds_event_window_idx" ON "exercise_operation_holds"("event_id","starts_at","expires_at");
--> statement-breakpoint
CREATE INDEX "exercise_operation_holds_scope_idx" ON "exercise_operation_holds"("event_id","target_type","target_id");
