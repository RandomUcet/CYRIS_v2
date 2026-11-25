# After-action insights and safe event retention preview

This is a non-destructive extension of CYRIS 2.3.0. It is built for CzechCybertron
organizers to assess exercise operations and prepare a retention decision, not to
replace a verified encrypted host backup.

## Administrative overview

Platform administrators use **Administration → Events → Report**.

- The report combines *operational timeline events* and *security/application
  audit events*. These sources have different semantics and are **not** added
  together as if they were unique incidents.
- Each activity bucket is expressed in **UTC** (YYYY-MM-DD), not the browser
  timezone. This avoids inconsistent bucket counts across devices.
- Outcomes distinguish **DENIED** (permission rejected) and **FAILURE**
  (operation error). Counts do not imply a security incident without review.
- **Active audited operators** counts unique non-null actor IDs in audit events,
  not attendance or actual simultaneous users.
- The daily CSV contains only ISO dates and numeric aggregates; it excludes
  names, clinical findings, evidence descriptions and free-form log content.
- Print and JSON export reflect a point-in-time snapshot, not an immutable
  officially signed after-action report. The user can print the snapshot as PDF.

## Partial vs whole-event retention

The preflight selector narrows **direct resource inventory by type**. A blank
selection means all resource categories. The backend rejects unknown category
labels, oversized inputs and unauthenticated/non-admin access.

**The preview cannot delete anything.** It never claims that directly counted
resource rows are all of the dependent records that a purge would affect.

The following are **not** included in the direct resource inventory: object
storage, document versions and attachments, deleted resources, audit and
outbox rows, Redis/worker jobs, notifications, integration artifacts and search
indexes. These must be inventoried and safely handled before enabling partial
or complete deletion.

See [issue #21](https://github.com/RandomUcet/CYRIS_v2/issues/21).

## Release acceptance

- Exact-head build, typecheck, migrations and isolated encrypted-backup smoke.
- Resource type selection helper tests and cross-event database integration
  test for outcome/day counts (including UTC midnight boundaries).
- Admin/non-admin read access verification and CSV formula injection safety:
  exported daily table contains no arbitrary text cells.
- Multi-role browser acceptance and manual print preview on macOS/Windows
  still required; green automated tests alone do not certify production UX.

**Never perform actual event deletion based on this read-only preflight.**

## Bounded retention execution (2.5.2 development)

The web inventory is deliberately non-destructive. The first real cleanup operation is local-root only: `sudo cyrisctl cleanup --event <UUID> --scope read-notifications` or `--scope terminal-tasks`. The preview lists count, dependency blockers and a digest. Apply additionally requires `--apply --confirm <exact-slug> --expected-plan <digest> --backup-copy-dir <absolute-separately-mounted-directory>`. The event must be ARCHIVED. A fresh encrypted full-stack backup is created with application writers paused, verified and copied to the separately mounted filesystem; the copy is checksum-checked and decrypted for verification. A separate filesystem alone is not proof of off-host retention; the administrator must mount a genuine external recovery destination and keep the recovery key separately. The SQL transaction rechecks the plan, rejects unexpected FK dependencies and writes an audit receipt; task search deletions use the existing outbox. Read/dismissed notifications are deletable, and only terminal manual tasks with no graph/source links qualify. Historical audit, activity, user accounts, roles and event itself are preserved. No automatic MinIO deletion or complete event purge is available yet. Never run against production until disposable PostgreSQL and real backup-copy acceptance are passed.
