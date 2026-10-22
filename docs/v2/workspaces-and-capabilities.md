# CYRIS v2 — Workspaces & Capability Architecture

## 1. Executive Summary & Design Rationale

In operational exercises and emergency command software such as CYRIS (Cybertron Registry & Intelligence System), diverse specialist agencies and tactical teams collaborate within an exercise context. 

A critical structural failure in legacy systems is conflating **Organizational Structure**, **Authority**, and **Application Navigation**:
- *False assumption 1*: "One navigation module = One team" (e.g. assuming all specialist analysts are one generic 'Laboratory', or that only investigators can see evidence).
- *False assumption 2*: "Permissions define navigation, or capabilities grant permissions."

CYRIS v2 Phase 2 strictly disentangles these four dimensions:
1. **Unit**: *Who and where* the operator belongs.
2. **Role**: *What named tier of authority* the operator holds.
3. **Permission**: *What atomic action* the operator may execute.
4. **Capability**: *What operational functionality and workspace* is relevant to the unit.

---

## 2. Core Concepts: Unit vs. Role vs. Permission vs. Capability

| Concept | Dimension | Entity / Model | Example |
| :--- | :--- | :--- | :--- |
| **Unit** | Belonging | `organizational_units` | `Investigation`, `Chemical Laboratory`, `Digital Forensics`, `JSOC`, `Scenario Control`, `Command`, `Medical`, `Evaluation` |
| **Role** | Authority Bundle | `roles` | `Lead Investigator`, `Laboratory Analyst`, `Evidence Officer`, `Platform Administrator` |
| **Permission** | Authorization Atom | `role_permissions` | `case.read`, `case.update`, `task.create`, `medical.triage`, `evaluation.score` |
| **Capability** | Workspace Relevance | `unit_capabilities` | `investigation`, `chemical_analysis`, `digital_forensics`, `crisis_management`, `medical_operations`, `evaluation` |

### Critical Rule: Capabilities NEVER Grant Authorization
- **Capabilities** determine *workspace relevance* (what navigation sections, toolbars, and briefing areas appear in the operator's workspace).
- **Backend Authorization** (`PermissionsGuard`, `AuthorizationService`) remains strictly authoritative. A capability without the corresponding permission will never allow an operator to execute a restricted action or bypass security predicates (`PLATFORM`, `EVENT`, `UNIT`, `OWN`, `ASSIGNED`).

---

## 3. Capability Catalog

The capability catalog is stored in `packages/contracts/src/workspaces.ts` and backed by `unit_capabilities`:

```sql
CREATE TABLE "unit_capabilities" (
  "id" uuid PRIMARY KEY NOT NULL,
  "unit_id" uuid NOT NULL REFERENCES "organizational_units"("id") ON DELETE cascade,
  "capability_key" varchar(64) NOT NULL,
  "configuration" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "unit_capabilities_unit_key_idx" UNIQUE ("unit_id", "capability_key")
);
```

### Standard Capability Catalog
- `investigation`: Case management, inquiries, investigative synthesis.
- `incident_operations`: First response, incident containment, triage.
- `evidence`: Physical & digital evidence vault, chain of custody tracking.
- `chemical_analysis`: Specialist hazardous material, toxicological, and chemical workflows.
- `digital_forensics`: Acquisition, disk extraction, mobile forensics, device triage.
- `technical_operations`: JSOC telemetry, indicator tracking, infrastructure mapping.
- `crisis_management`: Strategic command, inter-agency situational coordination, operational picture.
- `tactical_operations`: Field security perimeters, tactical interventions.
- `medical_operations`: Casualty triage, vital observations, clinical interventions, transfers.
- `prosecution`: Indictments, legal review, evidentiary filings.
- `defence`: Discovery review, defensive submissions.
- `court_proceedings`: Judicial dockets, hearings, trial custody.
- `scenario_control`: Exercise control (EXCON), inject execution, timeline orchestration.
- `evaluation`: Objective benchmarking, observer scoring, lessons learned.

---

## 4. Dynamic Workspace Resolution Architecture

Workspace resolution is executed via `WorkspaceResolverService` (`GET /events/:eventId/workspace`):

```
User
  ↓
Active Event Membership
  ↓
Assigned Units (1..N)
  +
Roles & Permissions
  +
Unit Capabilities (Union across assigned units)
  ↓
WorkspaceResolverService
  ↓
Resolved Navigation Sections (Deduplicated)
```

### Resolution Rules
1. **Deduplication**: If an operator belongs to multiple units (e.g. *Investigation* and *Digital Forensics*), the resolver yields the clean union of relevant workspace sections. Duplicate navigation targets are merged and suppressed.
2. **Specialist Separation**:
   - A **Command / Crisis Management** staff member (`crisis_management`, `incident_operations`) sees:
     - `COMMAND` (Operational Picture, Incidents, Tasking, Briefings, Timeline)
     - `DOCUMENTS` (SITREP generation & archives)
   - A **Medical Response** team member (`medical_operations`, `evidence`) sees:
     - `MEDICAL` (Active Cases, Triage, Transfers)
     - `EVIDENCE` (Evidence access for biological/toxicological samples)
     - `OPERATIONS` (Tasks, Briefings, Timeline)
   - A **Tactical / First Response** operator (`tactical_operations`, `incident_operations`, `evidence`) sees:
     - `OPERATIONS` (Tasks, Incidents, Evidence, Briefings, Timeline)
   - An **Observer / Evaluator** (`evaluation`) sees:
     - `EVALUATION` (Objectives, Live Observation, After Action Review)
   - A **Chemical Laboratory** analyst sees:
     - `OVERVIEW` (Briefing tailored to pending lab determinations and incoming evidence)
     - `LABORATORY` (Work Queue, Lab Analyses)
     - `EVIDENCE` (Evidence Vault & Chain of Custody)
   - A **Digital Forensics / Technical Operations** analyst sees:
     - `OVERVIEW`
     - `FORENSICS / TECHNICAL` (Work Queue, Analyses, Indicators)
     - `EVIDENCE`
     - `INVESTIGATION` (Cases, Registry)
   - A **Prosecution** legal officer sees:
     - `OVERVIEW`
     - `LEGAL` (Case Preparation, Court Cases, Filings)
     - `EVIDENCE`
     - `DOCUMENTS`
   - A **Defence** counsel sees:
     - `OVERVIEW`
     - `LEGAL` (Assigned Cases, Evidence Access, Filings)
     - `DOCUMENTS`
   - A **Court / Judge** officer sees:
     - `OVERVIEW`
     - `COURT` (Docket, Hearings, Exhibits, Decisions)
     - `DOCUMENTS`
   - An **Investigator** sees:
     - `OVERVIEW` (Briefing tailored to active cases and trigger incidents)
     - `INVESTIGATION` (Cases, Incidents, Registry, Relationships)
     - `EVIDENCE`
     - `DOCUMENTS`
3. **Empty Workspace Behavior**: If a user lacks a capability, CYRIS does not display empty modules or confusing disabled links; it simply omits the irrelevant workspace section.

---

## 5. Shared Platform Capabilities

While specialist units have separate operational foci, they all share core CYRIS platform infrastructure:
- **Shared Tasks**: First-class operational tasking shared across units with distinct owning and assigned units.
- **Evidence & Chain of Custody**: A physical device or chemical sample flows unbroken from field seizure through forensic imaging to laboratory testing.
- **Operational Timeline**: Every custody handover, state transition, and analyst determination is recorded as an immutable activity event on the timeline spine.
- **Global Search**: Typesense-backed index resolves entities across cases, evidence, and actors with strict authorization filtering.
- **Resource Relationships**: Typed graph nodes and edges interconnect resources without monolithic coupling.

---

## 6. Administration & Governance

Authorized administrators manage capabilities via **Administration → Units & Teams**:
- A dedicated capability editor allows toggling capabilities per unit.
- The interface enforces clear conceptual separation between capabilities and permissions.
- Updating capabilities triggers an audit event (`unit.capabilities_updated`) and immediately invalidates client-side cached workspaces.
