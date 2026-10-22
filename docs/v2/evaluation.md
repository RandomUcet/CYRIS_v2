# CYRIS v2 — Observer & Evaluation Architecture

## 1. Overview & Exercise Control Quarantine

The Observer & Evaluation capability (`evaluation`) is an exercise-control function designed for evaluators, umpires, and controllers.

### Core Secrecy & Quarantine Principles:
1. **Live Quarantine**: During the `ACTIVE` exercise state, participants must never see evaluation objectives, criteria, expected actions, or observer notes.
2. **Search Quarantine**: Evaluation entities (`evaluation_objectives`, `evaluation_criteria`, `evaluation_observations`) are completely excluded from the global participant search engine and typesense projections.
3. **Timeline Quarantine**: Raw observer notes and scoring events do not appear on the participant timeline. Evaluation maintains an isolated, evaluator-only chronology.
4. **AI Containment**: AI assistants (Catch Me Up, Case Summarization, Timeline Explain) are strictly prohibited from consuming evaluation data unless the querying user explicitly possesses `evaluation.read`. AI never calculates grades, never generates missing scores, and never invents exercise observations.
5. **No Role-Name Checks**: Evaluator visibility is governed strictly by the `evaluation.*` permission family, not by role strings. Command staff and Scenario Controllers do not gain evaluation access automatically unless assigned.

---

## 2. Data Model

The evaluation schema comprises three main tables:
1. `evaluation_objectives` (`OBJ-XXXX`)
2. `evaluation_criteria`
3. `evaluation_observations`

```sql
CREATE TABLE "evaluation_objectives" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
  "code" varchar(32) NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" varchar(64),
  "scenario_phase_id" uuid,
  "scenario_inject_id" uuid,
  "target_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE set null,
  "weight" numeric(5, 2) DEFAULT 1.0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "evaluation_criteria" (
  "id" uuid PRIMARY KEY NOT NULL,
  "objective_id" uuid NOT NULL REFERENCES "evaluation_objectives"("id") ON DELETE cascade,
  "description" text NOT NULL,
  "measurement_type" varchar(32) NOT NULL DEFAULT 'OBSERVATION',
  "maximum_score" numeric(5, 2),
  "sequence" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "evaluation_observations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
  "observer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "objective_id" uuid REFERENCES "evaluation_objectives"("id") ON DELETE set null,
  "criterion_id" uuid REFERENCES "evaluation_criteria"("id") ON DELETE set null,
  "target_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE set null,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "scenario_inject_id" uuid,
  "related_resource_id" uuid,
  "related_activity_event_id" uuid,
  "observation_type" varchar(32) NOT NULL DEFAULT 'NOTE',
  "note" text NOT NULL,
  "score" numeric(5, 2),
  "result" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

---

## 3. Human Observation & Fact Linkage

Evaluations are human-driven:
- Observers record field observations linked to canonical CYRIS facts (`relatedResourceId`: e.g. `E-0042`, `INC-0004`, `TASK-0021`).
- Activity events can be referenced (`relatedActivityEventId`).
- Automated scoring is strictly avoided; human observers assign scores and results based on demonstrated performance against criteria.

---

## 4. Lifecycle & After-Action Review (AAR)

The evaluation process follows four distinct lifecycle phases:
- `DRAFT`: Objectives and criteria are drafted prior to exercise start.
- `ACTIVE`: Live exercise observation. Complete quarantine from participants.
- `LOCKED`: Evaluation is closed to prevent retroactive tampering after exercise completion.
- `PUBLISHED`: Authorized controllers may release specific after-action findings and summaries.

The After Action Review (AAR) workspace aggregates:
- Objectives achieved
- Observation tallies and human scores
- Significant canonical timeline events
- Generates structured After Action Report documents (`AFTER_ACTION_REPORT`) using the canonical Documents infrastructure.
