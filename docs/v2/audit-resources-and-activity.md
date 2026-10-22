# Audit, Resource Graph & Operational Activity Foundation in CYRIS v2

## 1. Audit Log vs. Operational Activity

A key architectural distinction in CYRIS v2 separates **security and administrative audit trails** from **user-facing operational activity feeds**:

| Dimension | Security Audit Trail (`audit_events`) | Operational Activity Feed (`activity_events`) |
|---|---|---|
| **Audience** | Security officers, administrators, compliance inspectors | Exercise participants, investigators, scenario controllers |
| **Purpose** | Forensic accountability, fraud detection, security verification | Case progression, incident timeline, operational awareness |
| **Mutations Tracked** | Auth logins/failures, permission denials, role/unit/event CRUD | Evidence collected, suspect interrogated, lab report issued |
| **Immutability** | Append-only, strictly immutable (PostgreSQL trigger + S3 cold archive) | Append-only timeline entries, subject to exercise visibility filters |
| **Visibility** | Restricted by `audit.read` permission (PLATFORM scope) | Scoped by exercise visibility (`EVENT`, `UNIT`, `RESTRICTED`) |

---

## 2. Audit Immutability & Database Protection

Audit events in CYRIS are strictly append-only:

1. **Service Boundary**: Application services expose no methods for editing or deleting audit events.
2. **PostgreSQL Protection Trigger**: The `audit_events` table is protected at the database engine level with a trigger:
   ```sql
   CREATE OR REPLACE FUNCTION prevent_audit_modification()
   RETURNS TRIGGER AS $$
   BEGIN
     RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted';
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER audit_events_immutable_trg
   BEFORE UPDATE OR DELETE ON audit_events
   FOR EACH ROW
   EXECUTE FUNCTION prevent_audit_modification();
   ```
   Any direct or indirect `UPDATE` or `DELETE` statement executed against `audit_events` results in an immediate SQL exception.

---

## 3. Central Structured Redaction

Before any audit record or metadata is written to storage, sensitive fields are stripped and masked using `redactSensitiveData`:
* Keys matching passwords, hashes, session tokens, API keys, LDAP credentials, and the CYRIS master key are replaced with `***REDACTED***`.
* Passwords and authentication secrets are never stored in `metadata` or `changes`.

---

## 4. Transactional Outbox Pattern & Asynchronous S3 Archival

Reliability requirement: an audit database insert must never be lost due to Redis or Worker downtime.

```
                  Client Action
                       │
                       ▼
        ┌─────────────────────────────┐
        │     API Database Tx         │
        │ ┌─────────────────────────┐ │
        │ │ INSERT audit_events     │ │
        │ └─────────────────────────┘ │
        │ ┌─────────────────────────┐ │
        │ │ INSERT outbox_events    │ │
        │ └─────────────────────────┘ │
        └──────────────┬──────────────┘
                       │ (Committed atomically)
                       ▼
        ┌─────────────────────────────┐
        │   CYRIS Worker Processor    │
        │   - Polls pending outbox    │
        │   - Groups into NDJSON batch│
        │   - Compresses with Gzip    │
        │   - Computes SHA-256 hash   │
        └──────────────┬──────────────┘
                       │
                       ▼
        ┌─────────────────────────────┐
        │    S3 / MinIO Storage       │
        │ audit/YYYY/MM/DD/<batch>.gz │
        │ (Header: SHA-256, metadata) │
        └─────────────────────────────┘
```

1. **Atomic Outbox Insertion**: During any audited operation, both the `audit_events` row and a corresponding `outbox_events` row (`eventType: 'audit.archival'`) are committed inside the same PostgreSQL transaction.
2. **Worker Processing**: The CYRIS Worker runtime (`OutboxProcessorService`) scans for `status: PENDING` outbox events.
3. **S3 Batch Archive Format**:
   * Events are compiled into Newline Delimited JSON (NDJSON) where each line represents one audit event.
   * The batch is compressed with Gzip (`.ndjson.gz`).
   * A SHA-256 checksum is computed over the compressed byte payload.
   * Stored under: `audit/YYYY/MM/DD/<batch-id>.ndjson.gz` with metadata tags (`sha256`, `batchId`, `eventCount`, `archivedAt`).
   * The outbox event is transitioned to `status: PROCESSED`.

---

## 5. Audit Retention Policy

* Audit entries are currently **retained indefinitely** across both PostgreSQL and S3 cold storage.
* Automated deletion or TTL purging is intentionally omitted in this foundation step and will be governed by an explicit compliance retention policy in a future release.

---

## 6. Common Resource Registry (`resources`)

CYRIS will feature diverse domain entities in subsequent steps (Cases, Evidence, Vehicles, Devices, Laboratory Analyses, Court Cases). To prevent siloed domain tables and avoid generic EAV antipatterns, CYRIS introduces a lightweight **Common Resource Registry**:

* **Table `resources`**: Contains `id` (UUIDv7), `eventId`, `resourceType`, `createdAt`.
* Future domain tables will either foreign-key to or share primary keys with `resources.id`.
* Allows universal cross-domain relationships, unified activity timelines, global search indexing, and graph traversals.

---

## 7. Cross-Domain Directed Relationships (`resource_relationships`)

Connects any two resources registered in the system:
* Directed edges: `sourceResourceId` $\rightarrow$ `targetResourceId` with `relationshipType` (e.g. `member_of`, `owns`, `related_to`, `recovered_from`).
* Managed soft-removal: includes `removedAt` timestamp.
* Enforces uniqueness: A partial unique index on `(eventId, sourceResourceId, targetResourceId, relationshipType) WHERE removedAt IS NULL` prevents duplicate active relationships.

---

## 8. Request ID / Correlation Context

* Each incoming HTTP request is tagged with a unique request ID (generated via UUIDv7 or forwarded from incoming `X-Request-ID`).
* Returned to clients on all responses via the `X-Request-ID` header.
* Persisted in `audit_events.requestId` and structured application logs for end-to-end tracing.

---

## 9. Redis-Backed Rate Limiting

* Shared distributed rate-limiting counters stored in Redis (`cyris:ratelimit:id:<identifier>`, `cyris:ratelimit:ip:<ip>`).
* Evaluates both normalized login identifier and remote IP address.
* Preserves generic failure responses ("Invalid credentials or account disabled") upon wrong credentials, returning HTTP 429 when thresholds are exceeded.

---

## 10. Corrected Permission Scope Semantics

Scopes in CYRIS v2 are **NOT** structured as a simple linear hierarchy ($PLATFORM > EVENT > UNIT > ASSIGNED > OWN$ is invalid):

* **`PLATFORM`**: Platform-wide scope. Satisfies platform and general event/unit contexts where appropriate.
* **`EVENT`**: Bounded strictly within one event exercise. Satisfies event and unit contexts inside that event.
* **`UNIT`**: Bounded strictly within a specific organizational unit and its subordinate units.
* **`OWN`**: Contextual predicate — applies only when the authenticated user is the owner/author of the resource.
* **`ASSIGNED`**: Contextual predicate — applies only when the authenticated user is explicitly assigned to the resource.

`OWN` and `ASSIGNED` are independent contextual predicates, not subordinate organizational ranks. Neither satisfies the other, and organizational units do not inherently satisfy ownership or assignment predicates.
