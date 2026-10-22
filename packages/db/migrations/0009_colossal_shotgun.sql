ALTER TABLE "devices" ADD COLUMN "identifier" varchar(32);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "asset_tag" varchar(64);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "operating_system" varchar(128);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "mac_address" varchar(64);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "ip_address" varchar(64);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "generation_batch_id" varchar(128);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "generation_seed" varchar(255);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "identifier" varchar(32);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "city" varchar(128);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "region" varchar(128);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "country" varchar(128);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "postal_code" varchar(32);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "latitude" varchar(32);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "longitude" varchar(32);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "generation_batch_id" varchar(128);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "generation_seed" varchar(255);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "identifier" varchar(32);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "short_name" varchar(128);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "phone" varchar(64);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "generation_batch_id" varchar(128);--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "generation_seed" varchar(255);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "identifier" varchar(32);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "middle_name" varchar(128);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "emails" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "phones" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "generation_batch_id" varchar(128);--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "generation_seed" varchar(255);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "identifier" varchar(32);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "variant" varchar(128);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "model_year" varchar(4);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "generation_batch_id" varchar(128);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "generation_seed" varchar(255);