# CYRIS v2 — Medical Response Architecture

## 1. Overview & Operational Capability

Medical Response (`medical_operations`) is a dedicated operational capability in CYRIS v2. It provides casualty tracking, exercise triage, vital observation recording, operational interventions, and field-to-hospital dispositions.

Key architectural boundaries:
- **Canonical Person Link**: Medical records reference the canonical `Person` registry entity where known (`personId`). Unknown casualties initially exist without a linked `personId` and may be linked later.
- **Laboratory Link**: Medical records may link to canonical Chemical/Toxicology Lab Analyses (`LAB-XXXX`) or Evidence (`E-XXXX`) via resource relationships without duplicating findings into medical tables.
- **Strict Confidentiality**: Default visibility is `UNIT`. Medical details (chief complaints, vital observations, clinical interventions) are never exposed to other units or participants simply because they belong to the same event.
- **Limited Command Summary**: Command workspaces receive an intentionally limited operational summary (aggregate casualty counts by disposition and triage category), completely devoid of clinical notes or individual patient identities.
- **No AI Clinical Decisions**: CYRIS strictly prohibits AI from calculating triage categories, recommending medical interventions, or performing diagnostic evaluation.

---

## 2. Data Model

The schema comprises three primary tables:
1. `medical_encounters` (`MED-XXXX`, backed by `resources`)
2. `medical_observations` (structured vitals and measurements)
3. `medical_interventions` (procedures and outcomes)

```sql
CREATE TABLE "medical_encounters" (
  "id" uuid PRIMARY KEY NOT NULL REFERENCES "resources"("id") ON DELETE cascade,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
  "medical_number" varchar(64) NOT NULL,
  "person_id" uuid REFERENCES "persons"("id") ON DELETE set null,
  "status" varchar(32) NOT NULL DEFAULT 'RECEIVED',
  "triage_category" varchar(32) DEFAULT 'UNKNOWN',
  "incident_id" uuid REFERENCES "incidents"("id") ON DELETE set null,
  "location_id" uuid REFERENCES "locations"("id") ON DELETE set null,
  "chief_complaint" text,
  "mechanism_of_injury" text,
  "assessment_summary" text,
  "disposition" varchar(64) DEFAULT 'SCENE',
  "assigned_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE set null,
  "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "stabilized_at" timestamp with time zone,
  "transferred_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

---

## 3. Lifecycle & Triage

### Operational Lifecycle
- `RECEIVED`: Casualty received by medical response unit.
- `TRIAGED`: Initial triage category assigned.
- `UNDER_CARE`: Active intervention and observation.
- `STABILIZED`: Vital parameters brought under operational control.
- `TRANSFERRED`: Transferred to next echelon of care (`AID_STATION`, `AMBULANCE`, `HOSPITAL`).
- `CLOSED`: Medical response concluded.
- `DECEASED`: Exceptional condition required by scenario inject.

### Exercise Triage Categories
- `IMMEDIATE` (Red): Life-threatening, immediate priority.
- `DELAYED` (Yellow): Serious injury, stable for short interval.
- `MINOR` (Green): Walking wounded.
- `EXPECTANT` (Black): Non-viable or deceased.
- `UNKNOWN`: Pending medical assessment.

---

## 4. Permissions & Activity Timeline

Focused permissions:
- `medical.read`
- `medical.create`
- `medical.update`
- `medical.triage`
- `medical.observe`
- `medical.intervene`
- `medical.transfer`
- `medical.close`

Explicit timeline events emitted:
- `medical.encounter.created`
- `medical.triaged`
- `medical.stabilized`
- `medical.transferred`
- `medical.closed`

*Note*: Individual vital sign observations are kept in the encounter observation history and are not emitted into the global participant timeline.
