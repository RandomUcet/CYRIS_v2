# CYRIS delivery ledger — persistent continuation state

This is the execution companion to [master roadmap](roadmap-2027.md), not a replacement.
Status definitions: **OPEN** not accepted; **ACTIVE** current workstream; **IMPLEMENTED** code exists, exact-head CI and acceptance may still be missing; **VERIFIED** cite the exact evidence; **BLOCKED** name the external prerequisite and return step. Do not infer completion from a commit or older green CI. Do not jump to unrelated features simply because another chat says "continue".

## ACTIVE: ADM-01 — Exercise data lifecycle and administration

Owner: CYRIS development. Current working PR #54 (2.5.2); check actual head and CI before editing.

| Acceptance item | State | Evidence / next action |
|---|---|---|
| Admin inventory and standalone data page; complete/partial selection, counts, JSON export | IMPLEMENTED | 29e619b plus follow-up, browser acceptance pending. No raw UUID in routine exercise table. |
| Safe partial execution, read/dismissed notices and standalone terminal manual tasks | IMPLEMENTED | 883ccf3 host CLI with exact slug/digest, archived guard, separate verified encrypted recovery copy, transactional audit and search outbox. Disposable SQL acceptance test passed in exact-head CI 45629525529 (7a3a674). Actual host recovery acceptance still open. |
| Dependency-aware execution, including FK blockers, cross-event protection, stale plan, rollback | IMPLEMENTED (bounded scopes only) | SQL acceptance test, extend to every new scope. Do not equate direct FK inventory with a full dependency graph. |
| Database records: whole exercise data purge while retaining event/team/role configuration | OPEN | Build complete dependency closure, include operational records, scenario, support, ACLs, documents and references; staged dry-run, backup and audit. |
| Full event removal including memberships/units/roles, while preserving audit evidence and users shared with other exercises | OPEN | Explicit distinct profile and tombstone/audit policy; no blind cascades. |
| File/object deletion and recovery: current & historic documents, registry media, scenario draft media, forensic storage, shared objects | OPEN | Host-only read-only inventory now implements bounded actual S3 namespace listing, exact HEAD checks, cross-event known reference matching, protected bucket exclusion and aggregate import into admin UI. CI pending on new head; real MinIO/host, versioned objects, staged deletion and restore still open. |
| Async cleanup: queued/processing outbox, Typesense, Redis, AI and exercise jobs, external links | OPEN | Task search delete is queued; new read-only host inventory counts Typesense event documents, pending/failed outbox and generating/exercise jobs. Redis reconciliation, unknown references and full execution still open. |
| UI-triggered safe execution with privileged bounded maintenance worker or explicit operator-assisted flow | OPEN | Current UI is host-only; no unsafe shell endpoint. Design authorization, plan signing/expiry and real recovery proof. |
| Real host acceptance, separate recovery media, restore after actual cleanup, browser screenshots with populated data | BLOCKED on access to disposable host/browser if not available | Use isolated CI first; explicitly record remaining host/browser actions. Do not run destructive operations on user's server during development. |
| Admin event list, team module configuration, role/user administration and local test accounts | IMPLEMENTED in parts | New event filters/pagination and stale team editor protection; further admin roster audit and real screenshot acceptance needed. |

### Return rule

At the start of every continuation: read this file, actual PR head and exact-head CI. Fix any failure first. Stay with the active workstream until its acceptance items are complete or specific blockers are documented. If an item is blocked externally, advance a safe dependent or parallel item, with an explicit return step. Update this ledger with exact commit/CI evidence at every merge or material checkpoint. Never close the entire track because one category or preview works.

## Persistent backlog (all original IDs retained)

| ID | State / return work |
|---|---|
| REL-01 | OPEN: exact-head checks, release assets, production upgrade and rollback from deployed version. |
| SEC-01 | OPEN: complete cross-role/direct URL/revocation/preview/LDAP/local-account acceptance. |
| UX-01 | OPEN: entire sidebar, singleton groups, active route, locale consistency and accessibility. |
| UX-02 | OPEN: UUID-free pickers and contextual names in all modules. |
| UX-03 | OPEN: EXCON and broadcast/presentation rework; notification UI and broken forms; real populated browser screenshots. |
| UX-04 | OPEN: multitasking, drafts, inspectors, graph/timeline navigation. |
| AI-01 | OPEN: actual DGX Spark inference and latency/throughput, minimum generation, no silent fallback. |
| AI-02 | OPEN: Architect coherent world, media, relations, permits, reviewed injects and scenario preparation. |
| AI-03 | OPEN: Observer and role-aware assistant, bounded hints and privacy. |
| OPS-01 | OPEN: host diagnostics, scheduled collector, persistent history, admin health, Spark analysis. |
| OPS-02 | OPEN: deterministic monitoring, outage cooldown/alerting, external collector. |
| OPS-03 | OPEN: bounded maintenance catalog, verified recovery, locks, no root web shell. |
| DOM-01 | OPEN: licence/permit holder and issuer, effective dates, history, print, search and generated data. |
| DOM-02 | IMPLEMENTED in parts: lab/forensics request→assignment→approved result, evidence linkage, approval and notifications. Cross-team disclosure, role/browser acceptance and load still open. |
| DOM-03 | IMPLEMENTED in parts: medical intake/handoff/receipt/print/queue. Formal medical requests and returned reports, confidentiality acceptance open. |
| DOM-04 | IMPLEMENTED in parts: prosecutor/judge, legal requests/results, report access guard, notification ACL. Defence, controlled disclosure and complete legal corpus/role/browser acceptance open. |
| EX-01 | OPEN: DEFCON sound-only-on-change, clocks, wallboard, real physical integration verification. |
| EX-02 | OPEN: organizer corrective support, targeting and types of notifications, exercise pause/recovery, EXCON controls. |
| EX-03 | OPEN: evaluation, rubrics, reports and print coverage, export/retention. |
| ADM-01 | ACTIVE: see above. |
| INT-01 | OPEN: CYLAB authenticated read-only telemetry distinct from simulated JSOC. |
| QA-01 | OPEN: demo exercise, load, accessible real-browser acceptance, Spark and production upgrade rehearsal. |

## Verified baseline and current branch

- Exact head 4212b42: CI 45628003209 succeeded (previous cross-team workflows, before retention changes).
- 883ccf3: bounded host cleanup implementation, acceptance not yet established.
- 29e619b: dedicated data administration UI and isolated SQL test, CI 45628922921 initially in progress.
- Follow-up in same branch: object-reference counts, unexpected FK test, admin event list and team-editor guards. Verify latest exact head before release.

Do not publish a release with unverified new destructive functionality or imply that a browser/host test ran when it did not.

- Exact head 7a3a674: CI 45629525529 succeeded, including isolated SQL cleanup regression and encrypted restore smoke. This does not verify actual host cleanup or UI screenshots.
- Next material checkpoint: host inventory reader and admin import. Return to ADM-01: verify real S3 and Redis reconciliation, implement staged full exercise-data deletion and distinct complete event deletion after dependency closure. No production mutation.
