# CYRIS v2 — Court, Legal & Judicial Workflow

## 1. Architectural Principles

The Court & Prosecution system operates directly upon canonical CYRIS operational resources without duplicating upstream records:
- **No Evidence Duplication**: Court exhibits reference existing `evidence.id`. Chain of custody remains anchored in the Evidence domain and is rendered read-only in court views.
- **No Person Duplication**: Parties reference canonical `persons.id` or `organisations.id`.
- **Shared Documents**: Legal filings, indictments, and motions reference records in the unified `documents` table (`documents.id`).

---

## 2. Court Matter Lifecycle

1. `PREPARATION`: Indictment drafting, party identification, initial evidence collation.
2. `FILED`: Formal matter docketing (`CRT-0001`).
3. `ACTIVE`: Trial / hearing proceedings in session.
4. `DELIBERATION`: Evidentiary hearing completed; judicial panel deliberating.
5. `DECIDED`: Formal judgment, sentencing, or dismissal issued.
6. `CLOSED`: Proceedings concluded.

---

## 3. Core Legal Components

### Parties (`court_case_parties`)
- `role`: `ACCUSED`, `PROSECUTION`, `DEFENCE`, `WITNESS`, `EXPERT`, `OTHER`.
- References `personId` or `organisationId` with representation notes.

### Charges (`charges`)
- Formal allegations filed against the matter (`code`, `title`, `description`, `status`).

### Evidence Exhibits (`court_exhibits`)
- References canonical `evidenceId` and optional `documentId`.
- Lifecycle: `PROPOSED` -> `SUBMITTED` -> `ADMITTED` | `EXCLUDED` | `WITHDRAWN`.
- Tracks `decisionBy`, `decidedAt`, and `decisionReason` (e.g. hearsay exclusion, Fourth Amendment suppression).

### Hearings (`court_hearings`)
- Scheduled sessions with status: `SCHEDULED`, `IN_SESSION`, `ADJOURNED`, `COMPLETED`, `CANCELLED`.

### Filings (`court_filings`)
- Filings link to the shared `documents` table with `filingType` (e.g. `MOTION`, `INDICTMENT_BRIEF`, `RESPONSE`).

### Decisions (`court_decisions`)
- Binding judicial rulings: `INTERLOCUTORY_ORDER`, `BAIL_RULING`, `EVIDENTIARY_RULING`, `JUDGMENT`, `SENTENCING_ORDER`, `DISMISSAL`.

---

## 4. Legal Progression Timeline

The Court Case timeline dynamically aggregates all key legal milestones:
- `court.case.created`
- `court.charge.added`
- `court.exhibit.submitted`
- `court.exhibit.admitted` / `court.exhibit.excluded`
- `court.hearing.started` / `court.hearing.completed`
- `court.decision.issued`

This provides an authoritative chronological record of the judicial process.
