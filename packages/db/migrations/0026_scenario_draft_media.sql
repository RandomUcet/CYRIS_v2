CREATE TABLE "scenario_draft_media" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "batch_id" uuid NOT NULL REFERENCES "scenario_data_batches"("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "record_index" integer NOT NULL,
  "object_key" varchar(512) NOT NULL,
  "bucket" varchar(128) NOT NULL,
  "filename" varchar(255) NOT NULL,
  "mime_type" varchar(128) NOT NULL,
  "byte_size" integer NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "scenario_draft_media_index_check" CHECK ("record_index" >= 0),
  CONSTRAINT "scenario_draft_media_byte_check" CHECK ("byte_size" > 0 AND "byte_size" <= 5242880),
  CONSTRAINT "scenario_draft_media_kind_check" CHECK ("kind" IN ('persons','organisations','locations','vehicles','devices','weapons'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_draft_media_slot_idx" ON "scenario_draft_media"("batch_id","kind","record_index");
--> statement-breakpoint
CREATE INDEX "scenario_draft_media_event_idx" ON "scenario_draft_media"("event_id","batch_id");
