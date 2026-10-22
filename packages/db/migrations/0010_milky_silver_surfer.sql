CREATE TABLE "registry_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"bucket" varchar(128) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"byte_size" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weapons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" varchar(32),
	"category" varchar(128) NOT NULL,
	"manufacturer" varchar(128),
	"model" varchar(128),
	"serial_number" varchar(128),
	"calibre" varchar(128),
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"provenance" varchar(32) DEFAULT 'MANUAL' NOT NULL,
	"generation_batch_id" varchar(128),
	"generation_seed" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registry_media" ADD CONSTRAINT "registry_media_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapons" ADD CONSTRAINT "weapons_id_resources_id_fk" FOREIGN KEY ("id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registry_media_resource_unique_idx" ON "registry_media" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "weapons_identifier_idx" ON "weapons" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "weapons_serial_idx" ON "weapons" USING btree ("serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_identifier_unique_idx" ON "devices" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_identifier_unique_idx" ON "locations" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_identifier_unique_idx" ON "organisations" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_identifier_unique_idx" ON "persons" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_identifier_unique_idx" ON "vehicles" USING btree ("identifier");--> statement-breakpoint
DO $$
DECLARE
  item RECORD;
  next_value integer;
BEGIN
  FOR item IN SELECT r.event_id, p.id FROM persons p JOIN resources r ON r.id = p.id WHERE p.identifier IS NULL ORDER BY r.event_id, p.id LOOP
    INSERT INTO identifier_counters (event_id, entity_type, last_value) VALUES (item.event_id, 'person', 0) ON CONFLICT (event_id, entity_type) DO NOTHING;
    UPDATE identifier_counters SET last_value = last_value + 1 WHERE event_id = item.event_id AND entity_type = 'person' RETURNING last_value INTO next_value;
    UPDATE persons SET identifier = 'PER-' || lpad(next_value::text, 6, '0') WHERE id = item.id;
  END LOOP;
  FOR item IN SELECT r.event_id, o.id FROM organisations o JOIN resources r ON r.id = o.id WHERE o.identifier IS NULL ORDER BY r.event_id, o.id LOOP
    INSERT INTO identifier_counters (event_id, entity_type, last_value) VALUES (item.event_id, 'organisation', 0) ON CONFLICT (event_id, entity_type) DO NOTHING;
    UPDATE identifier_counters SET last_value = last_value + 1 WHERE event_id = item.event_id AND entity_type = 'organisation' RETURNING last_value INTO next_value;
    UPDATE organisations SET identifier = 'ORG-' || lpad(next_value::text, 6, '0') WHERE id = item.id;
  END LOOP;
  FOR item IN SELECT r.event_id, l.id FROM locations l JOIN resources r ON r.id = l.id WHERE l.identifier IS NULL ORDER BY r.event_id, l.id LOOP
    INSERT INTO identifier_counters (event_id, entity_type, last_value) VALUES (item.event_id, 'location', 0) ON CONFLICT (event_id, entity_type) DO NOTHING;
    UPDATE identifier_counters SET last_value = last_value + 1 WHERE event_id = item.event_id AND entity_type = 'location' RETURNING last_value INTO next_value;
    UPDATE locations SET identifier = 'LOC-' || lpad(next_value::text, 6, '0') WHERE id = item.id;
  END LOOP;
  FOR item IN SELECT r.event_id, v.id FROM vehicles v JOIN resources r ON r.id = v.id WHERE v.identifier IS NULL ORDER BY r.event_id, v.id LOOP
    INSERT INTO identifier_counters (event_id, entity_type, last_value) VALUES (item.event_id, 'vehicle', 0) ON CONFLICT (event_id, entity_type) DO NOTHING;
    UPDATE identifier_counters SET last_value = last_value + 1 WHERE event_id = item.event_id AND entity_type = 'vehicle' RETURNING last_value INTO next_value;
    UPDATE vehicles SET identifier = 'VEH-' || lpad(next_value::text, 6, '0') WHERE id = item.id;
  END LOOP;
  FOR item IN SELECT r.event_id, d.id FROM devices d JOIN resources r ON r.id = d.id WHERE d.identifier IS NULL ORDER BY r.event_id, d.id LOOP
    INSERT INTO identifier_counters (event_id, entity_type, last_value) VALUES (item.event_id, 'device', 0) ON CONFLICT (event_id, entity_type) DO NOTHING;
    UPDATE identifier_counters SET last_value = last_value + 1 WHERE event_id = item.event_id AND entity_type = 'device' RETURNING last_value INTO next_value;
    UPDATE devices SET identifier = 'DEV-' || lpad(next_value::text, 6, '0') WHERE id = item.id;
  END LOOP;
END $$;