# CYRIS v2 — Timeline Architecture & Operational Activity

## 1. Timeline as a First-Class Product Feature

In CYRIS, the timeline is an operational product capability for incident commanders, investigators, and laboratory analysts. It is **not** a raw technical debug trace or a database change feed.

### Audit vs Activity Separation
| Dimension | Audit Log (`audit_events`) | Operational Activity (`activity_events`) |
| :--- | :--- | :--- |
| **Audience** | Security officers, auditors, compliance | Operators, investigators, analysts |
| **Granularity** | Technical mutation diffs (`before`/`after`) | Meaningful operational narrative |
| **Trigger** | Every state-altering mutation | Explicit domain service workflow events |
| **Retention** | Immutable regulatory compliance log | Active incident & case situational awareness |

---

## 2. Explicit Domain Activity Philosophy

CYRIS strictly rejects generic database triggers or ORM hooks that automatically write timeline rows on every SQL `INSERT`/`UPDATE`. Only the domain service understands:
- **WHAT** happened (`evidence.transferred`)
- **WHEN** it happened (`occurredAt`)
- **WHO** performed it (`actorUserId`)
- **WHY** it happened (`reason`)
- **WHAT OBJECTS** were involved (`resourceId`, `relatedResourceIds`)
- **WHAT CAUSED IT** (`causationId`)

### Initial Activity Catalog
- **Incidents**: `incident.created`, `incident.status_changed`
- **Cases**: `case.created`, `case.status_changed`, `case.assigned`, `case.resource_linked`
- **Registry**: `registry.person.created`, `registry.organisation.created`, `registry.vehicle.created`, `registry.device.created`, `registry.location.created`
- **Relationships**: `relationship.created`, `relationship.removed`
- **Evidence**: `evidence.registered`, `evidence.secured`, `evidence.transferred`, `evidence.status_changed`, `evidence.linked`
- **Laboratory**: `lab.requested`, `lab.accepted`, `lab.started`, `lab.completed`, `lab.approved`, `lab.rejected`

---

## 3. Causation & Explainability

Activity events support explicit causation tracking through `causationId`:
- A custody transfer caused by a laboratory analysis request.
- A laboratory analysis completion caused by a specific case forensic instruction.
- A case escalation caused by forensic findings.

Causation is explicitly passed by domain workflows rather than inferred heuristically. This will power future "Why did this happen?" provenance queries and AI explanation trees.

---

## 4. Aggregation Strategies & Endpoints

### 4.1 Event Timeline (`GET /events/:eventId/timeline`)
- Returns operational activity across an event, filtered by permissions, time range, and activity type.
- If an activity event references a resource, the API verifies the caller has `timeline.read` or domain read permission for that resource. Restricted resources are omitted to prevent leakage.

### 4.2 Resource Timeline (`GET /resources/:resourceId/timeline`)
- Returns activity events directly concerning that resource (`resourceId = :id` or `:id = ANY(relatedResourceIds)`).

### 4.3 Case Timeline Bounded Aggregation (`GET /cases/:caseId/timeline`)
A Case timeline must display the full investigation story without doing unbounded recursive graph traversals. CYRIS implements a **bounded four-tier aggregation**:
1. Direct Case activities (`resourceId = caseId` or `causationId = caseId`).
2. Directly related resources (from active `resource_relationships` where `sourceResourceId = caseId` or `targetResourceId = caseId`).
3. Evidence resources attached to the Case.
4. Laboratory analyses linked to those Evidence items via `lab_analysis_evidence`.

All retrieved activity events are filtered against caller permissions before returning.
