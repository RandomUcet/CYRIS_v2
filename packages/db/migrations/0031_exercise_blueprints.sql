CREATE TABLE "exercise_blueprints" (
 "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
 "revision" integer NOT NULL CHECK ("revision" > 0),
 "title" varchar(160) NOT NULL,
 "brief" text NOT NULL CHECK (length(btrim("brief")) BETWEEN 10 AND 12000),
 "objectives" text NOT NULL CHECK (length("objectives") <= 6000),
 "constraints" text NOT NULL CHECK (length("constraints") <= 4000),
 "duration_hours" integer NOT NULL CHECK ("duration_hours" BETWEEN 1 AND 168),
 "review_after_hours" integer NOT NULL CHECK ("review_after_hours" BETWEEN 1 AND 72),
 "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "updated_at" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("event_id","revision")
);
