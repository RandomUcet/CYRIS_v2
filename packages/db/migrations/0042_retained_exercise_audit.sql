-- Audit rows are append-only, including their exercise identity. An ON DELETE
-- SET NULL FK conflicts with the immutable audit trigger. Retain event_id as
-- the original historical identity, without rewriting any existing audit row.
CREATE TABLE "removed_exercise_receipts" (
  "event_id" uuid PRIMARY KEY,
  "slug" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "removed_at" timestamptz NOT NULL DEFAULT now(),
  "audit_count" integer NOT NULL CHECK ("audit_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_event_id_events_id_fk";
--> statement-breakpoint
CREATE FUNCTION "validate_audit_exercise_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_id IS NOT NULL THEN
    -- Same lifetime protection as the former FK during INSERT.
    PERFORM 1 FROM public.events WHERE id=NEW.event_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Audit event requires an existing exercise' USING ERRCODE='23503';
    END IF;
    IF EXISTS (SELECT 1 FROM public.removed_exercise_receipts WHERE event_id=NEW.event_id) THEN
      RAISE EXCEPTION 'Audit event cannot target an exercise pending removal' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_validate_exercise_insert"
BEFORE INSERT ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "validate_audit_exercise_insert"();
--> statement-breakpoint
CREATE FUNCTION "validate_exercise_retention"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  historical_count integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.removed_exercise_receipts WHERE event_id=NEW.id)
       OR EXISTS (SELECT 1 FROM public.audit_events WHERE event_id=NEW.id) THEN
      RAISE EXCEPTION 'Historical exercise identity cannot be reused' USING ERRCODE='23505';
    END IF;
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Exercise identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT count(*)::integer INTO historical_count FROM public.audit_events WHERE event_id=OLD.id;
  IF historical_count>0 OR EXISTS (SELECT 1 FROM public.removed_exercise_receipts WHERE event_id=OLD.id) THEN
    IF OLD.status<>'ARCHIVED' OR NOT EXISTS (
      SELECT 1 FROM public.removed_exercise_receipts r
      WHERE r.event_id=OLD.id AND r.slug=OLD.slug AND r.name=OLD.name AND r.audit_count=historical_count
    ) THEN
      RAISE EXCEPTION 'Audited exercise removal requires a matching archived removal receipt';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "events_validate_retention"
BEFORE INSERT OR UPDATE OF "id" OR DELETE ON "events"
FOR EACH ROW EXECUTE FUNCTION "validate_exercise_retention"();
--> statement-breakpoint
-- A receipt must describe a live archived exercise before removal, not an
-- arbitrary UUID. The lock also serializes the receipt with audit inserts.
CREATE FUNCTION "validate_removed_exercise_receipt_insert"() RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  PERFORM 1 FROM public.events e
    WHERE e.id=NEW.event_id AND e.status='ARCHIVED' AND e.slug=NEW.slug AND e.name=NEW.name
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Removal receipt requires a matching live archived exercise';
  END IF;
  IF NEW.audit_count <> (SELECT count(*) FROM public.audit_events a WHERE a.event_id=NEW.event_id) THEN
    RAISE EXCEPTION 'Removal receipt audit count does not match';
  END IF;
  RETURN NEW;
END;
$;
--> statement-breakpoint
CREATE TRIGGER "removed_exercise_receipt_validate_insert"
BEFORE INSERT ON "removed_exercise_receipts"
FOR EACH ROW EXECUTE FUNCTION "validate_removed_exercise_receipt_insert"();
--> statement-breakpoint
CREATE FUNCTION "validate_removed_exercise_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id=NEW.event_id) THEN
    RAISE EXCEPTION 'Removal receipt requires actual exercise removal in the same transaction';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "removed_exercise_receipt_requires_removal"
AFTER INSERT ON "removed_exercise_receipts" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_removed_exercise_receipt"();
--> statement-breakpoint
CREATE TRIGGER "removed_exercise_receipts_immutable"
BEFORE UPDATE OR DELETE ON "removed_exercise_receipts"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_modification"();
