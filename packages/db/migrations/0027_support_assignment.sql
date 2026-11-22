ALTER TABLE "support_requests"
  ADD COLUMN "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "support_requests_assignee_idx"
  ON "support_requests"("event_id", "assigned_to_user_id", "status");
