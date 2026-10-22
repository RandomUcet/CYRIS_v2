CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" varchar(16) DEFAULT 'en' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"date_format" varchar(32),
	"time_format" varchar(32),
	"notification_channels" jsonb DEFAULT '{"inApp": true, "email": true}' NOT NULL,
	"notification_categories" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_translations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inject_id" uuid NOT NULL,
	"locale" varchar(16) NOT NULL,
	"participant_title" varchar(255) NOT NULL,
	"participant_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid,
	"type" varchar(64) NOT NULL,
	"severity" varchar(32) DEFAULT 'INFO' NOT NULL,
	"template_key" varchar(128) NOT NULL,
	"template_params" jsonb DEFAULT '{}' NOT NULL,
	"resource_id" uuid,
	"action_url" varchar(512),
	"source_event_id" varchar(128),
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "default_locale" varchar(16) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "default_timezone" varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD COLUMN "locale" varchar(16) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD COLUMN "participant_title" varchar(255);--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD COLUMN "participant_content" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_translations" ADD CONSTRAINT "scenario_inject_translations_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_inject_translations_inject_locale_idx" ON "scenario_inject_translations" USING btree ("inject_id","locale");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_idx" ON "notifications" USING btree ("source_event_id","user_id","type");