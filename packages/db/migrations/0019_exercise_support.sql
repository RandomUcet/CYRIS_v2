CREATE TABLE "support_requests" (
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
CREATE INDEX "support_requests_event_status_idx" ON "support_requests" ("event_id","status","updated_at");
--> statement-breakpoint
CREATE INDEX "support_requests_requester_idx" ON "support_requests" ("event_id","requester_id");
--> statement-breakpoint
CREATE TABLE "support_messages" (
"id" uuid PRIMARY KEY,
"request_id" uuid NOT NULL REFERENCES "support_requests"("id") ON DELETE CASCADE,
"author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
"author_kind" varchar(16) NOT NULL CHECK ("author_kind" IN ('PARTICIPANT','EXCON')),
"body" text NOT NULL CHECK (length("body") BETWEEN 1 AND 4000),
"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "support_messages_request_idx" ON "support_messages" ("request_id","created_at");
