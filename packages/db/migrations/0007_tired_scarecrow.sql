CREATE TABLE "operational_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"task_number" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"priority" varchar(32) DEFAULT 'NORMAL' NOT NULL,
	"owning_unit_id" uuid,
	"assigned_unit_id" uuid,
	"assigned_user_id" uuid,
	"source_type" varchar(64) DEFAULT 'MANUAL',
	"source_resource_id" uuid,
	"due_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completion_note" text,
	"blocked_reason" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_encounters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"medical_number" varchar(64) NOT NULL,
	"person_id" uuid,
	"status" varchar(32) DEFAULT 'RECEIVED' NOT NULL,
	"triage_category" varchar(32) DEFAULT 'UNKNOWN' NOT NULL,
	"incident_id" uuid,
	"location_id" uuid,
	"chief_complaint" text,
	"mechanism_of_injury" text,
	"assessment_summary" text,
	"disposition" text,
	"assigned_unit_id" uuid,
	"assigned_user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stabilized_at" timestamp with time zone,
	"transferred_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_interventions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"intervention_type" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"performed_by_user_id" uuid NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observation_type" varchar(64) NOT NULL,
	"value" varchar(255) NOT NULL,
	"unit" varchar(64),
	"note" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_criteria" (
	"id" uuid PRIMARY KEY NOT NULL,
	"objective_id" uuid NOT NULL,
	"description" text NOT NULL,
	"measurement_type" varchar(32) DEFAULT 'SCORE' NOT NULL,
	"maximum_score" integer,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(128),
	"scenario_phase_id" uuid,
	"scenario_inject_id" uuid,
	"target_unit_id" uuid,
	"weight" integer DEFAULT 1,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"observer_user_id" uuid NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"objective_id" uuid,
	"criterion_id" uuid,
	"target_unit_id" uuid,
	"target_user_id" uuid,
	"scenario_inject_id" uuid,
	"related_resource_id" uuid,
	"related_activity_event_id" uuid,
	"observation_type" varchar(64) DEFAULT 'NOTE' NOT NULL,
	"note" text NOT NULL,
	"score" integer,
	"result" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_owning_unit_id_organizational_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_assigned_unit_id_organizational_units_id_fk" FOREIGN KEY ("assigned_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_assigned_unit_id_organizational_units_id_fk" FOREIGN KEY ("assigned_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_encounters" ADD CONSTRAINT "medical_encounters_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_interventions" ADD CONSTRAINT "medical_interventions_encounter_id_medical_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."medical_encounters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_interventions" ADD CONSTRAINT "medical_interventions_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_observations" ADD CONSTRAINT "medical_observations_encounter_id_medical_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."medical_encounters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_observations" ADD CONSTRAINT "medical_observations_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_criteria" ADD CONSTRAINT "evaluation_criteria_objective_id_evaluation_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."evaluation_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_objectives" ADD CONSTRAINT "evaluation_objectives_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_objectives" ADD CONSTRAINT "evaluation_objectives_scenario_phase_id_scenario_phases_id_fk" FOREIGN KEY ("scenario_phase_id") REFERENCES "public"."scenario_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_objectives" ADD CONSTRAINT "evaluation_objectives_scenario_inject_id_scenario_injects_id_fk" FOREIGN KEY ("scenario_inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_objectives" ADD CONSTRAINT "evaluation_objectives_target_unit_id_organizational_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_observer_user_id_users_id_fk" FOREIGN KEY ("observer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_objective_id_evaluation_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."evaluation_objectives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_criterion_id_evaluation_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."evaluation_criteria"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_target_unit_id_organizational_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_scenario_inject_id_scenario_injects_id_fk" FOREIGN KEY ("scenario_inject_id") REFERENCES "public"."scenario_injects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_observations" ADD CONSTRAINT "evaluation_observations_related_activity_event_id_activity_events_id_fk" FOREIGN KEY ("related_activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_event_num_idx" ON "operational_tasks" USING btree ("event_id","task_number");--> statement-breakpoint
CREATE UNIQUE INDEX "med_event_num_idx" ON "medical_encounters" USING btree ("event_id","medical_number");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_obj_code_idx" ON "evaluation_objectives" USING btree ("event_id","code");