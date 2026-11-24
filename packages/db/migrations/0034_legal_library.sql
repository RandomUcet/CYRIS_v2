CREATE TABLE "legal_library" (
 "id" uuid PRIMARY KEY,
 "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
 "act" varchar(16) NOT NULL,
 "provision" varchar(100) NOT NULL,
 "heading" varchar(250) NOT NULL,
 "text" text NOT NULL CHECK (length("text") BETWEEN 20 AND 12000),
 "effective_from" date NOT NULL,
 "effective_to" date CHECK ("effective_to" > "effective_from"),
 "source_url" text NOT NULL,
 "sha256" varchar(64) NOT NULL,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 UNIQUE ("event_id","act","provision","effective_from")
);
--> statement-breakpoint
CREATE INDEX "legal_library_event_date_idx" ON "legal_library"("event_id","effective_from","effective_to");
