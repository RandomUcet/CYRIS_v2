CREATE TABLE "unit_capabilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"unit_id" uuid NOT NULL,
	"capability_key" varchar(64) NOT NULL,
	"configuration" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_capabilities" ADD CONSTRAINT "unit_capabilities_unit_id_organizational_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unit_capabilities_unit_key_idx" ON "unit_capabilities" USING btree ("unit_id","capability_key");