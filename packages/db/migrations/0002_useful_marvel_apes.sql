CREATE TABLE "identifier_counters" (
	"event_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "identifier_counters_event_id_entity_type_pk" PRIMARY KEY("event_id","entity_type")
);
--> statement-breakpoint
CREATE TABLE "resource_access_control" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"principal_type" varchar(32) NOT NULL,
	"principal_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"user_id" uuid,
	"unit_id" uuid,
	"assigned_by_user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" varchar(255) NOT NULL,
	"device_type" varchar(64) NOT NULL,
	"manufacturer" varchar(64),
	"model" varchar(64),
	"serial_number" varchar(64),
	"hostname" varchar(128),
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"address_text" text,
	"location_type" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"registration_number" varchar(64),
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"given_name" varchar(128),
	"family_name" varchar(128),
	"date_of_birth" varchar(32),
	"nationality" varchar(64),
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" varchar(255) NOT NULL,
	"registration_plate" varchar(32),
	"vin" varchar(64),
	"make" varchar(64),
	"model" varchar(64),
	"colour" varchar(32),
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_number" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"priority" varchar(32) DEFAULT 'MEDIUM' NOT NULL,
	"owning_unit_id" uuid,
	"lead_user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"incident_number" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'NEW' NOT NULL,
	"priority" varchar(32) DEFAULT 'MEDIUM' NOT NULL,
	"occurred_at" timestamp with time zone,
	"detected_at" timestamp with time zone,
	"owning_unit_id" uuid,
	"lead_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_number" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"evidence_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'REGISTERED' NOT NULL,
	"condition" text,
	"secured_at" timestamp with time zone,
	"secured_by_user_id" uuid,
	"owning_unit_id" uuid,
	"current_holder_type" varchar(32) DEFAULT 'USER' NOT NULL,
	"current_holder_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_custody_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evidence_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transferred_by_user_id" uuid NOT NULL,
	"from_holder_type" varchar(32) NOT NULL,
	"from_holder_id" varchar(64) NOT NULL,
	"to_holder_type" varchar(32) NOT NULL,
	"to_holder_id" varchar(64) NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lab_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_number" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"requested_from_unit_id" uuid,
	"assigned_to_user_id" uuid,
	"assigned_unit_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"analysis_type" varchar(64) NOT NULL,
	"purpose" text,
	"method" text,
	"findings" text,
	"conclusion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_analysis_evidence" (
	"analysis_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_analysis_evidence_analysis_id_evidence_id_pk" PRIMARY KEY("analysis_id","evidence_id")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "source" varchar(64);--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "causation_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "activity_events" ADD COLUMN "related_resource_ids" jsonb;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "visibility" varchar(32) DEFAULT 'EVENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "owning_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "identifier_counters" ADD CONSTRAINT "identifier_counters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_access_control" ADD CONSTRAINT "resource_access_control_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_access_control" ADD CONSTRAINT "resource_access_control_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_unit_id_organizational_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_owning_unit_id_organizational_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owning_unit_id_organizational_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_secured_by_user_id_users_id_fk" FOREIGN KEY ("secured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_owning_unit_id_organizational_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_custody_transfers" ADD CONSTRAINT "evidence_custody_transfers_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_custody_transfers" ADD CONSTRAINT "evidence_custody_transfers_transferred_by_user_id_users_id_fk" FOREIGN KEY ("transferred_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analyses" ADD CONSTRAINT "lab_analyses_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analyses" ADD CONSTRAINT "lab_analyses_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analyses" ADD CONSTRAINT "lab_analyses_requested_from_unit_id_organizational_units_id_fk" FOREIGN KEY ("requested_from_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analyses" ADD CONSTRAINT "lab_analyses_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analyses" ADD CONSTRAINT "lab_analyses_assigned_unit_id_organizational_units_id_fk" FOREIGN KEY ("assigned_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analysis_evidence" ADD CONSTRAINT "lab_analysis_evidence_analysis_id_lab_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."lab_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_analysis_evidence" ADD CONSTRAINT "lab_analysis_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_acl_unique_idx" ON "resource_access_control" USING btree ("resource_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "resource_acl_resource_idx" ON "resource_access_control" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_assignments_resource_idx" ON "resource_assignments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "resource_assignments_user_idx" ON "resource_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resource_assignments_unit_idx" ON "resource_assignments" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "devices_label_idx" ON "devices" USING btree ("label");--> statement-breakpoint
CREATE INDEX "devices_hostname_idx" ON "devices" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "devices_serial_idx" ON "devices" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "locations_name_idx" ON "locations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "organisations_name_idx" ON "organisations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "organisations_reg_num_idx" ON "organisations" USING btree ("registration_number");--> statement-breakpoint
CREATE INDEX "persons_display_name_idx" ON "persons" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "persons_status_idx" ON "persons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vehicles_label_idx" ON "vehicles" USING btree ("label");--> statement-breakpoint
CREATE INDEX "vehicles_plate_idx" ON "vehicles" USING btree ("registration_plate");--> statement-breakpoint
CREATE INDEX "cases_number_idx" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_owning_unit_idx" ON "cases" USING btree ("owning_unit_id");--> statement-breakpoint
CREATE INDEX "cases_lead_user_idx" ON "cases" USING btree ("lead_user_id");--> statement-breakpoint
CREATE INDEX "incidents_number_idx" ON "incidents" USING btree ("incident_number");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_owning_unit_idx" ON "incidents" USING btree ("owning_unit_id");--> statement-breakpoint
CREATE INDEX "incidents_lead_user_idx" ON "incidents" USING btree ("lead_user_id");--> statement-breakpoint
CREATE INDEX "evidence_number_idx" ON "evidence" USING btree ("evidence_number");--> statement-breakpoint
CREATE INDEX "evidence_status_idx" ON "evidence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evidence_owning_unit_idx" ON "evidence" USING btree ("owning_unit_id");--> statement-breakpoint
CREATE INDEX "custody_evidence_occurred_idx" ON "evidence_custody_transfers" USING btree ("evidence_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lab_analyses_number_idx" ON "lab_analyses" USING btree ("analysis_number");--> statement-breakpoint
CREATE INDEX "lab_analyses_status_idx" ON "lab_analyses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lab_analyses_req_unit_idx" ON "lab_analyses" USING btree ("requested_from_unit_id");--> statement-breakpoint
CREATE INDEX "lab_analyses_assigned_unit_idx" ON "lab_analyses" USING btree ("assigned_unit_id");--> statement-breakpoint
CREATE INDEX "lab_analysis_evidence_evidence_idx" ON "lab_analysis_evidence" USING btree ("evidence_id");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owning_unit_id_organizational_units_id_fk" FOREIGN KEY ("owning_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_causation_idx" ON "activity_events" USING btree ("causation_id");--> statement-breakpoint
CREATE INDEX "resources_visibility_idx" ON "resources" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "resources_owning_unit_idx" ON "resources" USING btree ("owning_unit_id");