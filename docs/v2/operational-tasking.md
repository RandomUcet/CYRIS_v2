# CYRIS v2 — Operational Tasking Architecture

## 1. Overview & Architectural Principle

Operational tasking in CYRIS v2 provides a shared, event-scoped operational task primitive (`operational_tasks`) across all exercise agencies and units:
- Investigation
- Tactical / Field Teams
- JSOC / Technical Operations
- Medical Response
- Chemical Laboratory
- Command / Crisis Management
- Scenario Control

Rather than building isolated task queues for individual units, CYRIS implements a unified task resource (`resources.id === operational_tasks.id`) with deterministic concurrency-safe numbering (`TASK-0001`), shared lifecycle semantics, explicit assignment, and resource access security.

---

## 2. Data Model

The `operational_tasks` table is backed by the canonical `resources` table:

```sql
CREATE TABLE "operational_tasks" (
  "id" uuid PRIMARY KEY NOT NULL REFERENCES "resources"("id") ON DELETE cascade,
  "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
  "task_number" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "priority" varchar(32) NOT NULL DEFAULT 'NORMAL',
  "owning_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE set null,
  "assigned_unit_id" uuid REFERENCES "organizational_units"("id") ON DELETE set null,
  "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "source_type" varchar(64),
  "source_resource_id" uuid,
  "due_at" timestamp with time zone,
  "acknowledged_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "completion_note" text,
  "blocked_reason" text,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

### Owning Unit vs. Assigned Unit
A key operational distinction supported in CYRIS is that a task may have an **owning unit** distinct from its **assigned unit**:
- Example: Owning unit is `Investigation`; Assigned unit is `Digital Forensics`.
- The task tracks who requested/governs the work versus who is currently assigned to execute it.

---

## 3. Explicit Lifecycle & Transitions

Transitions between task states are explicit and validated:
- `OPEN` -> `ACKNOWLEDGED` -> `IN_PROGRESS` -> `COMPLETED`
- `IN_PROGRESS` / `ACKNOWLEDGED` -> `BLOCKED` (requires `blockedReason`)
- `BLOCKED` -> `IN_PROGRESS` (upon unblocking)
- `*` -> `CANCELLED` (requires optional cancellation reason)
- Reopening a `COMPLETED` task cannot happen silently; it requires an explicit action with a mandatory justification reason.

---

## 4. Permissions & Activity Timeline

Focused permissions govern task mutations without role-name checks:
- `task.read`
- `task.create`
- `task.update`
- `task.assign`
- `task.acknowledge`
- `task.work`
- `task.complete`
- `task.cancel`

Explicit activity events are recorded on the event timeline:
- `task.created`
- `task.assigned`
- `task.acknowledged`
- `task.started`
- `task.blocked`
- `task.completed`
- `task.cancelled`
- `task.reopened`

---

## 5. UI Run-Sheet Design

The Tasks workspace (`/events/:eventId/tasks`) strictly adopts a dense, operational run-sheet / table design without cards:
- Fast status & priority badges
- Quick filters: `Assigned to me`, `Assigned to my unit`, `Open / In Progress`, `Blocked`, `Completed`
- Side slide-over drawer for executing lifecycle actions without losing table context.
