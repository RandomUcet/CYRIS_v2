CREATE TABLE "scenario_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"recipient_user_id" uuid,
	"target_unit_id" uuid,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"resource_id" uuid,
	"target_type" varchar(32) DEFAULT 'UNIT' NOT NULL,
	"target_unit_id" uuid,
	"target_user_id" uuid,
	"new_visibility" varchar(32),
	"parameters" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_conditions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"condition_type" varchar(64) NOT NULL,
	"target_resource_id" uuid,
	"target_identifier" varchar(64),
	"target_status" varchar(64),
	"activity_type" varchar(64),
	"expected_value" jsonb,
	"is_satisfied" boolean DEFAULT false NOT NULL,
	"satisfied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_dependencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"depends_on_inject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"release_type" varchar(32) DEFAULT 'MANUAL' NOT NULL,
	"override_reason" text,
	"participant_title" varchar(255) NOT NULL,
	"participant_content" text,
	"audience_snapshot" jsonb NOT NULL,
	"actions_snapshot" jsonb NOT NULL,
	"released_by_user_id" uuid,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_inject_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"inject_id" uuid NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_unit_id" uuid,
	"target_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_injects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"phase_id" uuid,
	"inject_number" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"controller_summary" text NOT NULL,
	"participant_title" varchar(255),
	"participant_content" text,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"priority" varchar(32) DEFAULT 'NORMAL' NOT NULL,
	"trigger_type" varchar(32) DEFAULT 'MANUAL' NOT NULL,
	"release_policy" varchar(32) DEFAULT 'MANUAL_CONFIRMATION' NOT NULL,
	"condition_logic" varchar(8) DEFAULT 'ALL' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"controller_notes" text,
	"created_by_user_id" uuid,
	"released_at" timestamp with time zone,
	"released_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_phases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"planned_start_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"controller_notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD CONSTRAINT "scenario_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD CONSTRAINT "scenario_deliveries_release_id_scenario_inject_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."scenario_inject_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD CONSTRAINT "scenario_deliveries_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD CONSTRAINT "scenario_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_deliveries" ADD CONSTRAINT "scenario_deliveries_target_unit_id_organizational_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_actions" ADD CONSTRAINT "scenario_inject_actions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_actions" ADD CONSTRAINT "scenario_inject_actions_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_actions" ADD CONSTRAINT "scenario_inject_actions_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_actions" ADD CONSTRAINT "scenario_inject_actions_target_unit_id_organizational_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_actions" ADD CONSTRAINT "scenario_inject_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_conditions" ADD CONSTRAINT "scenario_inject_conditions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_conditions" ADD CONSTRAINT "scenario_inject_conditions_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_conditions" ADD CONSTRAINT "scenario_inject_conditions_target_resource_id_resources_id_fk" FOREIGN KEY ("target_resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_dependencies" ADD CONSTRAINT "scenario_inject_dependencies_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_dependencies" ADD CONSTRAINT "scenario_inject_dependencies_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_dependencies" ADD CONSTRAINT "scenario_inject_dependencies_depends_on_inject_id_scenario_injects_id_fk" FOREIGN KEY ("depends_on_inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_releases" ADD CONSTRAINT "scenario_inject_releases_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_releases" ADD CONSTRAINT "scenario_inject_releases_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_releases" ADD CONSTRAINT "scenario_inject_releases_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_targets" ADD CONSTRAINT "scenario_inject_targets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_targets" ADD CONSTRAINT "scenario_inject_targets_inject_id_scenario_injects_id_fk" FOREIGN KEY ("inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_targets" ADD CONSTRAINT "scenario_inject_targets_target_unit_id_organizational_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_inject_targets" ADD CONSTRAINT "scenario_inject_targets_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_injects" ADD CONSTRAINT "scenario_injects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_injects" ADD CONSTRAINT "scenario_injects_phase_id_scenario_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."scenario_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_injects" ADD CONSTRAINT "scenario_injects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_injects" ADD CONSTRAINT "scenario_injects_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_phases" ADD CONSTRAINT "scenario_phases_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_phases" ADD CONSTRAINT "scenario_phases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenario_deliveries_user_idx" ON "scenario_deliveries" USING btree ("event_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "scenario_deliveries_unit_idx" ON "scenario_deliveries" USING btree ("event_id","target_unit_id");--> statement-breakpoint
CREATE INDEX "scenario_deliveries_release_idx" ON "scenario_deliveries" USING btree ("event_id","release_id");--> statement-breakpoint
CREATE INDEX "scenario_actions_inject_idx" ON "scenario_inject_actions" USING btree ("inject_id");--> statement-breakpoint
CREATE INDEX "scenario_conditions_inject_idx" ON "scenario_inject_conditions" USING btree ("inject_id");--> statement-breakpoint
CREATE INDEX "scenario_conditions_type_idx" ON "scenario_inject_conditions" USING btree ("event_id","condition_type");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_inject_dep_unique_idx" ON "scenario_inject_dependencies" USING btree ("inject_id","depends_on_inject_id");--> statement-breakpoint
CREATE INDEX "scenario_inject_dep_inject_idx" ON "scenario_inject_dependencies" USING btree ("inject_id");--> statement-breakpoint
CREATE INDEX "scenario_releases_inject_idx" ON "scenario_inject_releases" USING btree ("inject_id");--> statement-breakpoint
CREATE INDEX "scenario_releases_event_idx" ON "scenario_inject_releases" USING btree ("event_id","released_at");--> statement-breakpoint
CREATE INDEX "scenario_targets_inject_idx" ON "scenario_inject_targets" USING btree ("inject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_injects_num_idx" ON "scenario_injects" USING btree ("event_id","inject_number");--> statement-breakpoint
CREATE INDEX "scenario_injects_event_status_idx" ON "scenario_injects" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "scenario_injects_event_phase_idx" ON "scenario_injects" USING btree ("event_id","phase_id");--> statement-breakpoint
CREATE INDEX "scenario_phases_event_seq_idx" ON "scenario_phases" USING btree ("event_id","sequence");--> statement-breakpoint
CREATE INDEX "scenario_phases_event_status_idx" ON "scenario_phases" USING btree ("event_id","status");