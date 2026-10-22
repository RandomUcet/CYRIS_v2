# CYRIS v2 — Scenario Control, Inject Engine & Controlled Disclosure

## Overview

**Scenario Control / EXCON (Exercise Control)** is the operational exercise orchestration layer of CYRIS v2. It provides controllers with the capability to orchestrate exercise progression, manage scenario stimuli (Injects), evaluate state-based and timeline conditions, schedule future releases, target specific units or participants, and disclose hidden operational resources under strict institutional isolation.

---

## 1. Core Architectural Concepts

### Separation of Concerns: Unit vs. Role vs. Permission vs. Capability
- **Unit**: Where the operator belongs (e.g., *Exercise Control*, *Investigation*, *Chemical Laboratory*).
- **Role**: What authority level the operator holds (e.g., *Scenario Controller*, *Lead Analyst*, *Participant*).
- **Permission**: Atomic authorization checks evaluated by backend guards (`scenario.read`, `scenario.manage`, `scenario.release`, `scenario.secret.read`, `scenario.override`, `briefing.read`, `briefing.acknowledge`).
- **Capability**: Determines workspace navigation relevance (`scenario_control`). **Capabilities NEVER grant permissions.**

---

## 2. Scenario Phase Model

Phases represent ordered exercise progression (e.g. *Phase 01: Initial Response* → *Phase 02: Incident Response* → *Phase 03: Investigation*).

### Lifecycle:
`DRAFT` → `PLANNED` → `ACTIVE` → `COMPLETED` (or `CANCELLED`)

### Single Active Phase Invariant:
Normally, exactly **one** phase is `ACTIVE` at any given time.
- If a controller attempts to activate a phase while another is already active, the API rejects the transition unless `forceActive: true` is explicitly provided.
- Confirmed transition audits the superseded phase completion and records the timeline activity `scenario.phase.activated` under `ActivityVisibility.SCENARIO`.

---

## 3. Inject Lifecycle & Condition Engine

An **Inject** (`INJ-0001`, `INJ-0002` allocated via event-scoped atomic sequence) is an exercise stimulus or controlled information release.

### Lifecycle:
- `DRAFT`: In preparation by scenario controllers.
- `BLOCKED`: Prerequisites (prior injects) or state conditions are not yet satisfied.
- `READY`: All prerequisite dependencies and conditions are satisfied; waiting for controller release confirmation.
- `SCHEDULED`: Scheduled for release at a future timestamp (`scheduledAt <= now()`).
- `RELEASED`: Released to intended participant audience; immutable snapshot created.
- `CANCELLED`: Withdrawn from exercise execution.

### Trigger Types:
1. `MANUAL`: Controllers manually review and trigger release once READY.
2. `SCHEDULED_TIME`: Automatically released by the scheduler when `scheduledAt <= now()`.
3. `CONDITION`: Becomes READY when domain state or timeline conditions are met.

### Release Policy:
- `MANUAL_CONFIRMATION` (Default): Transitions from `BLOCKED` → `READY` when conditions are met; awaits explicit human confirmation.
- `AUTO_RELEASE`: Automatically executes release immediately upon condition satisfaction.

### Typed Condition Engine:
Supports clean, non-executable, inspectable domain predicates:
- `INJECT_RELEASED`: Prerequisite inject has status `RELEASED`.
- `ACTIVITY_OCCURRED`: Specific activity type occurred on timeline.
- `CASE_STATUS`: Target case reached specific status (e.g. `CASE-0001.status == REFERRED`).
- `INCIDENT_STATUS`: Target incident reached specific status.
- `EVIDENCE_STATUS`: Target evidence item reached specific status (e.g. `E-0001.status == SECURED`).
- `LAB_STATUS`: Laboratory analysis reached specific status (e.g. `LAB-0001.status == COMPLETED`).

Condition logic groups: `ALL` (all conditions must be satisfied) or `ANY` (at least one condition must be satisfied).

### Dependency Cycle Prevention:
Adding prerequisite dependencies (`dependsOnInjectId`) validates graph acyclicity via Depth-First Search (DFS), rejecting circular dependencies with `400 Bad Request`.

---

## 4. Controlled Resource Disclosure

Scenario releases can disclose existing CYRIS resources (Persons, Vehicles, Evidence, Locations, Devices) to participants without copying or duplicating database records:

### Release Actions:
1. `DELIVER_BRIEFING`: Delivers participant-facing text message to target audience.
2. `GRANT_RESOURCE_ACCESS`: Inserts explicit access control grant into `resource_access_control` (`principalType: 'UNIT' | 'USER'`). The resource itself can remain `visibility: 'SCENARIO'` or `RESTRICTED` while becoming accessible to the targeted audience.
3. `CHANGE_RESOURCE_VISIBILITY`: Elevates resource visibility (e.g. `SCENARIO` → `EVENT` or `RESTRICTED`). Requires explicit confirmation.

---

## 5. Immutable Release Snapshot & Idempotency

Releasing an inject is atomic and strictly idempotent:
1. Row lock on inject (`SELECT ... FOR UPDATE`).
2. If already `RELEASED`, returns existing snapshot without duplicate deliveries or disclosures.
3. Creates immutable release snapshot in `scenario_inject_releases` capturing participant title, body prose, audience snapshot, and executed disclosure actions.
4. Generates participant `scenario_deliveries`.
5. Executes resource disclosure grants.
6. Updates inject status to `RELEASED`.
7. Audits transition and records separate scenario activity (controller-only) and participant timeline activity (`briefing.delivered`).
8. Transaction committed; future edits to the draft inject cannot alter participant-received content.

---

## 6. Participant Briefing Gateway

Participant-facing deliveries are exposed via `/events/:eventId/briefings`:
- Dedicated participant DTOs **physically omit** all controller fields (`controllerSummary`, `controllerNotes`, `conditions`, `dependencies`, `triggerType`, `releasePolicy`).
- Deliveries are targeted to:
  - Entire event (`recipientUserId IS NULL AND targetUnitId IS NULL`)
  - Specific organizational unit (`targetUnitId = userUnitId`)
  - Specific user (`recipientUserId = userId`)
- Participants can mark briefings as read and acknowledge receipt (`briefing.acknowledge`), which records an audit event and timeline activity.

---

## 7. Security & Information Containment

1. **Zero Controller Leaks**: Participant endpoints never serialize controller prose, conditions, or unreleased injects.
2. **Search Security**: Unreleased injects and controller secrets are NOT indexed in global Typesense search.
3. **AI Context Isolation**: CYRIS Intelligence context builder only loads records the user is authorized to read (`canAccessResource`). Unreleased scenario records are never included in normal participant AI contexts.
4. **Timeline Isolation**: Controller activity events use `visibility: 'SCENARIO'` and are automatically filtered out for participants lacking `scenario.read` or `scenario.secret.read`.
