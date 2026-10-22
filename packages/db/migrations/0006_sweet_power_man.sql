CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_note" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"document_number" varchar(64),
	"title" text NOT NULL,
	"description" text,
	"document_type" varchar(64) DEFAULT 'REPORT' NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"object_key" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"uploaded_by_user_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text_extraction_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensic_acquisitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"evidence_id" uuid,
	"device_id" uuid,
	"acquisition_type" varchar(64) DEFAULT 'LOGICAL' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"tool_name" text,
	"tool_version" text,
	"source_size" bigint,
	"hash_algorithm" varchar(32) DEFAULT 'SHA-256' NOT NULL,
	"source_hash" varchar(128),
	"image_hash" varchar(128),
	"storage_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensic_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_number" varchar(32) NOT NULL,
	"event_id" uuid NOT NULL,
	"analysis_type" varchar(64) DEFAULT 'FILE_ANALYSIS' NOT NULL,
	"status" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"priority" varchar(32) DEFAULT 'MEDIUM' NOT NULL,
	"requested_by_user_id" uuid,
	"requested_from_unit_id" uuid,
	"assigned_to_user_id" uuid,
	"assigned_unit_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"purpose" text,
	"methodology" text,
	"findings" text,
	"conclusion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensic_analysis_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensic_analysis_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forensic_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"analysis_id" uuid NOT NULL,
	"finding_type" varchar(64) DEFAULT 'ARTIFACT' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"confidence" varchar(32) DEFAULT 'CONFIRMED' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_indicators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"indicator_type" varchar(32) NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"description" text,
	"verification_state" varchar(32) DEFAULT 'UNVERIFIED' NOT NULL,
	"first_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"code" varchar(64),
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" varchar(32) DEFAULT 'FILED' NOT NULL,
	"related_case_resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_case_parties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"party_resource_id" uuid NOT NULL,
	"party_role" varchar(32) DEFAULT 'DEFENCE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_number" varchar(32) NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" varchar(32) DEFAULT 'PREPARATION' NOT NULL,
	"originating_case_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"decision_type" varchar(64) DEFAULT 'VERDICT_CONVICTION' NOT NULL,
	"summary" text NOT NULL,
	"reasoning" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_exhibits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"document_id" uuid,
	"exhibit_number" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'SUBMITTED' NOT NULL,
	"proposed_by_user_id" uuid,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_filings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"filing_type" varchar(64) DEFAULT 'MOTION' NOT NULL,
	"filed_by_user_id" uuid,
	"filed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_hearings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"court_case_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"status" varchar(32) DEFAULT 'SCHEDULED' NOT NULL,
	"location_resource_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_acquisitions" ADD CONSTRAINT "forensic_acquisitions_analysis_id_forensic_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."forensic_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_acquisitions" ADD CONSTRAINT "forensic_acquisitions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_acquisitions" ADD CONSTRAINT "forensic_acquisitions_device_id_resources_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_requested_from_unit_id_organizational_units_id_fk" FOREIGN KEY ("requested_from_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analyses" ADD CONSTRAINT "forensic_analyses_assigned_unit_id_organizational_units_id_fk" FOREIGN KEY ("assigned_unit_id") REFERENCES "public"."organizational_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analysis_devices" ADD CONSTRAINT "forensic_analysis_devices_analysis_id_forensic_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."forensic_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analysis_devices" ADD CONSTRAINT "forensic_analysis_devices_device_id_resources_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analysis_evidence" ADD CONSTRAINT "forensic_analysis_evidence_analysis_id_forensic_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."forensic_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_analysis_evidence" ADD CONSTRAINT "forensic_analysis_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_findings" ADD CONSTRAINT "forensic_findings_analysis_id_forensic_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."forensic_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forensic_findings" ADD CONSTRAINT "forensic_findings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_indicators" ADD CONSTRAINT "technical_indicators_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_indicators" ADD CONSTRAINT "technical_indicators_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_related_case_resource_id_resources_id_fk" FOREIGN KEY ("related_case_resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_case_parties" ADD CONSTRAINT "court_case_parties_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_case_parties" ADD CONSTRAINT "court_case_parties_party_resource_id_resources_id_fk" FOREIGN KEY ("party_resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_cases" ADD CONSTRAINT "court_cases_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_cases" ADD CONSTRAINT "court_cases_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_cases" ADD CONSTRAINT "court_cases_originating_case_id_cases_id_fk" FOREIGN KEY ("originating_case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_decisions" ADD CONSTRAINT "court_decisions_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_decisions" ADD CONSTRAINT "court_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_decisions" ADD CONSTRAINT "court_decisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_exhibits" ADD CONSTRAINT "court_exhibits_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_exhibits" ADD CONSTRAINT "court_exhibits_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_exhibits" ADD CONSTRAINT "court_exhibits_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_exhibits" ADD CONSTRAINT "court_exhibits_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_exhibits" ADD CONSTRAINT "court_exhibits_decision_by_user_id_users_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_filings" ADD CONSTRAINT "court_filings_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_filings" ADD CONSTRAINT "court_filings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_filings" ADD CONSTRAINT "court_filings_filed_by_user_id_users_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_hearings" ADD CONSTRAINT "court_hearings_court_case_id_court_cases_id_fk" FOREIGN KEY ("court_case_id") REFERENCES "public"."court_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_hearings" ADD CONSTRAINT "court_hearings_location_resource_id_resources_id_fk" FOREIGN KEY ("location_resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_doc_ver_unique" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "document_versions_doc_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "documents_event_idx" ON "documents" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "documents_number_idx" ON "documents" USING btree ("event_id","document_number");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("event_id","document_type");--> statement-breakpoint
CREATE INDEX "documents_extraction_idx" ON "documents" USING btree ("text_extraction_status");--> statement-breakpoint
CREATE INDEX "forensic_acquisitions_analysis_idx" ON "forensic_acquisitions" USING btree ("analysis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forensic_analyses_event_num_unique" ON "forensic_analyses" USING btree ("event_id","analysis_number");--> statement-breakpoint
CREATE INDEX "forensic_analyses_event_status_idx" ON "forensic_analyses" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "forensic_analyses_assigned_unit_idx" ON "forensic_analyses" USING btree ("assigned_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forensic_devices_unique_link" ON "forensic_analysis_devices" USING btree ("analysis_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forensic_evidence_unique_link" ON "forensic_analysis_evidence" USING btree ("analysis_id","evidence_id");--> statement-breakpoint
CREATE INDEX "forensic_findings_analysis_idx" ON "forensic_findings" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "technical_indicators_event_idx" ON "technical_indicators" USING btree ("event_id","indicator_type");--> statement-breakpoint
CREATE INDEX "technical_indicators_norm_val_idx" ON "technical_indicators" USING btree ("event_id","normalized_value");--> statement-breakpoint
CREATE INDEX "charges_case_idx" ON "charges" USING btree ("court_case_id");--> statement-breakpoint
CREATE INDEX "charges_status_idx" ON "charges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "court_case_parties_case_idx" ON "court_case_parties" USING btree ("court_case_id");--> statement-breakpoint
CREATE INDEX "court_case_parties_party_idx" ON "court_case_parties" USING btree ("party_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "court_cases_event_num_unique" ON "court_cases" USING btree ("event_id","court_case_number");--> statement-breakpoint
CREATE INDEX "court_cases_event_status_idx" ON "court_cases" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "court_cases_originating_case_idx" ON "court_cases" USING btree ("originating_case_id");--> statement-breakpoint
CREATE INDEX "court_decisions_case_idx" ON "court_decisions" USING btree ("court_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "court_exhibits_case_num_unique" ON "court_exhibits" USING btree ("court_case_id","exhibit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "court_exhibits_case_evidence_unique" ON "court_exhibits" USING btree ("court_case_id","evidence_id");--> statement-breakpoint
CREATE INDEX "court_exhibits_case_idx" ON "court_exhibits" USING btree ("court_case_id");--> statement-breakpoint
CREATE INDEX "court_filings_case_idx" ON "court_filings" USING btree ("court_case_id");--> statement-breakpoint
CREATE INDEX "court_filings_doc_idx" ON "court_filings" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "court_hearings_case_idx" ON "court_hearings" USING btree ("court_case_id");--> statement-breakpoint
CREATE INDEX "court_hearings_scheduled_idx" ON "court_hearings" USING btree ("scheduled_at");