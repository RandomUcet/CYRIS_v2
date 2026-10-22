# CYRIS v2 — Domain Workflows & Resource Operations

## 1. Architectural Principles & Locked Decisions

### 1.1 Shared Resource Identity
In CYRIS v2, every typed operational domain entity is backed by the common resource foundation and shares the exact same UUID as `resources.id`:
```
resources.id = X
persons.id   = X (PK + FK -> resources.id ON DELETE CASCADE)
cases.id     = X (PK + FK -> resources.id ON DELETE CASCADE)
evidence.id  = X (PK + FK -> resources.id ON DELETE CASCADE)
```
There is **no separate `resourceId` column** on domain tables. One real-world or scenario object has exactly one canonical UUID across:
- Domain APIs & CRUD
- Common relationship graph (`resource_relationships`)
- Activity stream (`activity_events`)
- Search indices (`Typesense`)
- Future AI context & Graph views

### 1.2 Concurrency-Safe Human-Readable Identifiers
While UUIDs represent permanent canonical identity, human operators require short, readable identifiers (e.g. `INC-0001`, `CASE-0001`, `E-0001`, `LAB-0001`).

CYRIS uses an atomic PostgreSQL sequence allocator (`identifier_counters` table) with row-level locking via `ON CONFLICT (event_id, entity_type) DO UPDATE SET last_value = identifier_counters.last_value + 1 RETURNING last_value`. This prevents race conditions and eliminates naive `MAX() + 1` concurrency bugs.

---

## 2. Resource Access Control & Security Model

CYRIS resource access is strictly centralized in `ResourceAccessService.canAccessResource(user, resourceId, permission)`. Visibility logic is never scattered across controllers.

### 2.1 Visibility Scopes
- **EVENT**: Accessible to any event member with the required permission.
- **UNIT**: Accessible only to members of the owning organizational unit (or parent units) with the required permission.
- **RESTRICTED**: Accessible only to:
  1. The resource creator/owner
  2. Principals (users or units) explicitly granted access via `resource_access_control` table
  3. Platform administrators
- **SCENARIO**: Reserved for organizer/scenario controllers. Inaccessible to standard scenario participants.

### 2.2 Contextual Predicates (OWN and ASSIGNED)
- `OWN`: Evaluated dynamically when `resource.ownerUserId === user.id`.
- `ASSIGNED`: Evaluated dynamically against active `resource_assignments` entries where `user_id = user.id` or `unit_id IN (user's unit memberships)`.

---

## 3. Scenario Registry Entities

Scenario registry objects represent fictional scenario assets, personas, and targets—not CYRIS operator accounts.

- **Person**: `displayName`, `givenName`, `familyName`, `dateOfBirth`, `nationality`, `status`, `aliases` (JSONB).
- **Organisation**: `name`, `legalName`, `registrationNumber`, `status`, `description`.
- **Location**: `name`, `addressText`, `locationType`, `description`.
- **Vehicle**: `label`, `registrationPlate`, `vin`, `make`, `model`, `colour`, `status`.
- **Device**: `label`, `deviceType`, `manufacturer`, `model`, `serialNumber`, `hostname`, `status`.

Entities connect through the common directed graph `resource_relationships` (`member_of`, `owns`, `observed_at`, `uses`, `associated_with`, `related_to`).

---

## 4. Investigation: Incidents & Cases

### 4.1 Incident
- Identifier: `INC-0001`
- Lifecycle: `NEW` ➔ `ACTIVE` ➔ `CONTAINED` ➔ `RESOLVED` ➔ `CLOSED`
- Priorities: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- Tracks: `occurredAt`, `detectedAt`, `owningUnitId`, `leadUserId`.

### 4.2 Case
- Identifier: `CASE-0001`
- Lifecycle: `OPEN` ➔ `INVESTIGATING` ➔ `PENDING` ➔ `REFERRED` ➔ `CLOSED` ➔ `ARCHIVED`
- Connects arbitrary domain entities using `resource_relationships` (e.g. `Incident --investigated_in--> Case`, `Person --subject_of--> Case`).

---

## 5. Evidence & Chain of Custody

### 5.1 Evidence Entity
- Identifier: `E-0001`
- Lifecycle: `REGISTERED` ➔ `SECURED` ➔ `IN_TRANSIT` ➔ `STORED` ➔ `UNDER_ANALYSIS` ➔ `RELEASED` ➔ `DISPOSED`
- Current state tracks: `currentHolderType` (`USER`, `UNIT`, `STORAGE`), `currentHolderId`, `condition`, `securedAt`, `securedByUserId`.

### 5.2 Chain of Custody History
Custody history is strictly immutable and append-only in `evidence_custody_transfers`. Past transfers are never updated or deleted.
A custody transfer transaction atomically:
1. Asserts `evidence.transfer` permission.
2. Inserts an immutable row in `evidence_custody_transfers` with `fromHolderType/Id`, `toHolderType/Id`, `reason`, `notes`.
3. Updates current holder and status on the `evidence` record.
4. Records structured audit log (`evidence.transferred`).
5. Emits an operational activity event (`evidence.transferred`).
6. Triggers a transactional search index update in the outbox.

---

## 6. Laboratory Analysis Workflow

### 6.1 Unified Lifecycle
Rather than separate disconnected CRUD requests and result tables, CYRIS uses a single coherent analysis workflow:
```
REQUESTED ➔ ACCEPTED ➔ IN_PROGRESS ➔ COMPLETED ➔ APPROVED
    │           │            │
    └─ REJECTED └─ CANCELLED └─ CANCELLED
```

### 6.2 Evidence Linkage
Analyses reference existing evidence resources via `lab_analysis_evidence` join table without duplicating evidence metadata.

### 6.3 Transition Permissions & Audit
- `lab.request`: Creates the analysis in `REQUESTED` status.
- `lab.accept`: Accepts or rejects the request (`ACCEPTED` / `REJECTED`).
- `lab.work`: Transitions to `IN_PROGRESS` and records laboratory methods.
- `lab.complete`: Records findings and conclusions, transitions to `COMPLETED`.
- `lab.approve`: Senior review transition to `APPROVED`.

---

## 7. Global Search Projections & Fail-Closed Confidentiality

All 9 domain object types are registered with `SearchProjectionRegistry`:
- `person`, `organisation`, `location`, `vehicle`, `device`
- `incident`, `case`
- `evidence`, `lab_analysis`

### Fail-Closed Principle for RESTRICTED & SCENARIO Resources
If a resource has visibility `RESTRICTED` or `SCENARIO`, the projection provider returns `null` and suppresses indexing into Typesense. This guarantees zero information leakage during index replication or asynchronous ACL lag.
