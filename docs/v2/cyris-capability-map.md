# CYRIS v2 — Capability Map & Architecture Reference

> **Document Purpose**: Concise overview of the full CYRIS v2 platform architecture across all operational domains and shared platform foundations.

---

## 1. Platform Foundation (Shared Primitives)

All exercise and operational modules consume standard shared foundational primitives to maintain strict consistency, security, and auditability.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SHARED PLATFORM FOUNDATION                      │
├─────────────────────┬──────────────────────────┬───────────────────────┤
│ Primitive           │ Responsibilities         │ Storage / Engine      │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Identity & Auth** │ LOCAL (Argon2), LDAP/AD, │ `users`,              │
│                     │ OIDC (PKCE), Sessions,   │ `user_identities`,    │
│                     │ JIT Provisioning         │ Redis Session Store   │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Events**          │ Exercise multi-tenancy,  │ `events`,             │
│                     │ default locale/timezone  │ Event scoping         │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Units & Roles**   │ Unit hierarchy, roles,   │ `units`, `roles`,     │
│                     │ granular RBAC permissions│ `memberships`         │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Workspaces**      │ Capability matrices,     │ `workspaces`,         │
│                     │ domain view isolation    │ Workspace mapping     │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Notifications**   │ Targeted alerts (INFO,   │ `notifications`,      │
│                     │ ACTION, URGENT), dedup,  │ In-App & Email SMTP   │
│                     │ In-App & Email delivery  │ (Mailpit)             │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Localization**    │ Stable i18n catalogs     │ `user_preferences`,   │
│                     │ (EN, CS, DE, PL), UTC    │ i18n translation map, │
│                     │ storage, user timezone   │ `scenario_inject_     │
│                     │ formatting               │ translations`         │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Audit**           │ Append-only compliance   │ PostgreSQL + S3       │
│                     │ trail, cryptographic hash│ WORM storage          │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Global Search**   │ Sub-millisecond indexed  │ Typesense Cluster +   │
│                     │ multi-domain discovery   │ RBAC filter sync      │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Relationships**   │ Cross-domain entity graph│ `entity_relationships`│
│                     │ (Case ↔ Evidence ↔ Drug) │ Graph Link Engine     │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Unified Timeline**│ Operational event stream │ Dynamic aggregate over│
│                     │ with filtering & badges  │ domain events         │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Documents**       │ S3 binary storage, MIME  │ `documents`,          │
│                     │ validation, immutability │ S3 `cyris-storage`    │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Intelligence**    │ Writing Assist, summary  │ Ollama / OpenAI / Mock│
│                     │ generation, draft drafts │ Integration Service   │
└─────────────────────┴──────────────────────────┴───────────────────────┘
```

---

## 2. Operational & Domain Modules

### A. Operations
- **Incidents**: Major operational occurrences, priority tracking, containment status.
- **Tasks**: Operational tasking, unit delegation, priority management, state lifecycle (`TODO` $\to$ `IN_PROGRESS` $\to$ `DONE`).
- **Command**: Situational awareness overview, command briefings, operational resource coordination.
- *Primitives Consumed*: Identity, Units, Workspaces, Notifications, Timeline, Global Search, Audit.

### B. Investigation
- **Registry**: Known subjects, companies, physical infrastructure, vehicles, and identifiers.
- **Investigation Cases**: Formal case files, investigative leads, hypotheses, and status workflows.
- **Evidence & Chain of Custody**: Physical & digital seized items, tamper-evident barcode numbering, transfer logs, custodian signatures.
- *Primitives Consumed*: Relationships (Entity Graph), Documents (S3), Global Search, Audit, Timeline.

### C. Specialist Analysis
- **Chemical Laboratory**: Seized substance analysis, spectra logs, purity quantification, precursor tracking.
- **Digital Forensics**: Disk images, mobile dumps, hash verification (SHA-256), artifact extraction, findings.
- **Technical Indicators (IOCs)**: IP addresses, domains, file hashes, network signatures linked to cases and incidents.
- *Primitives Consumed*: Evidence, Documents (S3), Audit, Global Search, Relationships.

### D. Scenario Control
- **Phases**: Chronological exercise phases (`START`, `ESCALATION`, `CRISIS`, `RESOLUTION`).
- **Injects**: Master inject catalog with controller release triggers and condition trees.
- **Participant Briefings**: Directed briefings delivered to unit workspaces.
- **Multilingual Content**: Authoring of `en`, `cs`, `de`, `pl` inject variants with immutable delivery snapshotting.
- **Controlled Disclosure**: Controller-only visibility preventing premature leakage to blue teams.
- *Primitives Consumed*: Localization, Notifications, Identity, Units, Timeline, Audit.

### E. Medical Response
- **Encounters & Patients**: Casualty admissions, patient registry, triage tags (`GREEN`, `YELLOW`, `RED`, `BLACK`).
- **Observations**: Longitudinal vital sign tracking (heart rate, blood pressure, SpO2, Glasgow Coma Scale).
- **Interventions**: Pharmacological administration, surgical/trauma procedures, decontamination.
- **Transfers**: Inter-facility patient routing and evacuation tracking.
- *Primitives Consumed*: Identity, Units, Documents, Relationships, Audit. *Note: Strict confidentiality guarantees mask medical vitals from unauthenticated external emails.*

### F. Legal & Court
- **Prosecution**: Indictments, legal evaluations, penal code references.
- **Court**: Case dockets, judicial chamber assignments, presiding judge tracking.
- **Exhibits**: Legal admissibility review of investigative evidence.
- **Hearings**: Scheduled court proceedings, participant appearances, minutes.
- **Filings & Decisions**: Legal motions, bail determinations, verdicts, warrant orders.
- *Primitives Consumed*: Evidence, Cases, Documents (S3), Timeline, Audit, Search.

### G. Evaluation & After Action Review (AAR)
- **Objectives**: Master exercise training objectives (e.g., incident response containment speed).
- **Criteria**: Granular rubric scoring and behavioral benchmarks.
- **Observations**: Controller/evaluator scorecards and real-time commentary.
- **After Action Review (AAR)**: Synthesis of performance metrics, gap analysis, and final exercise reporting.
- *Primitives Consumed*: Units, Scenario Injects, Audit, Global Search. *Note: Evaluator scoring is protected by evaluator-only RBAC predicates.*

---

## 3. Module-to-Foundation Dependency Matrix

| Domain Module | Identity & RBAC | Events & Units | Notifications | Localization | Audit & S3 | Search | Timeline | Graph Links |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Incidents & Command** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Tasks** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Registry & Cases** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Evidence & Forensics** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Chemical Lab** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Scenario & Briefings**| ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Medical Response** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Court & Legal** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Evaluation / AAR** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
