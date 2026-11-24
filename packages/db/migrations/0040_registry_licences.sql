CREATE TABLE "licences" (
  "id" uuid PRIMARY KEY REFERENCES "resources"("id") ON DELETE CASCADE,
  "identifier" varchar(32) NOT NULL,
  "title" varchar(200) NOT NULL,
  "category" varchar(32) NOT NULL,
  "licence_number" varchar(100),
  "valid_from" varchar(10) NOT NULL,
  "valid_until" varchar(10),
  "status" varchar(32) NOT NULL DEFAULT 'ISSUED',
  "description" text,
  "provenance" varchar(32) NOT NULL DEFAULT 'MANUAL',
  "generation_batch_id" varchar(128),
  "generation_seed" varchar(255),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "licences_date_order" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from"),
  CONSTRAINT "licences_status" CHECK ("status" IN ('ISSUED','SUSPENDED','REVOKED','ARCHIVED')),
  CONSTRAINT "licences_category" CHECK ("category" IN ('DRIVING','FIREARMS','PROFESSIONAL','BUSINESS','SECURITY','OTHER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "licences_identifier_unique_idx" ON "licences" ("identifier");
--> statement-breakpoint
CREATE INDEX "licences_category_idx" ON "licences" ("category");
