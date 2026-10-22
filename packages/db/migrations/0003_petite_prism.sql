CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"event_id" uuid,
	"provider_id" uuid,
	"capability" varchar(64) NOT NULL,
	"operation_type" varchar(64) NOT NULL,
	"model" varchar(128) NOT NULL,
	"prompt_template_version" varchar(32),
	"context_resource_ids" jsonb DEFAULT '[]' NOT NULL,
	"request_id" varchar(128),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"status" varchar(32) DEFAULT 'SUCCESS' NOT NULL,
	"usage_metadata" jsonb,
	"error_category" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_secrets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"integration_id" uuid NOT NULL,
	"secret_key" varchar(64) NOT NULL,
	"encrypted_value" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"algorithm" varchar(32) DEFAULT 'aes-256-gcm' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"category" varchar(64) DEFAULT 'AI_PROVIDER' NOT NULL,
	"provider_type" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'NOT_CONFIGURED' NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_provider_id_integrations_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_user_id_idx" ON "ai_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_runs_event_id_idx" ON "ai_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ai_runs_operation_idx" ON "ai_runs" USING btree ("operation_type","status");--> statement-breakpoint
CREATE INDEX "ai_runs_started_at_idx" ON "ai_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_secrets_integration_key_idx" ON "integration_secrets" USING btree ("integration_id","secret_key");--> statement-breakpoint
CREATE INDEX "integrations_category_idx" ON "integrations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "integrations_enabled_idx" ON "integrations" USING btree ("enabled");