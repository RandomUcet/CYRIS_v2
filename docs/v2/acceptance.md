# CYRIS v2 — Final Phase 2 Acceptance Verification

> **Reference**: Phase 2 / Step 5 — Final Acceptance Testing & Production Verification.

---

## 1. Acceptance Scope & Criteria Matrix

The CYRIS v2 platform underwent systematic end-to-end verification across 55 structured acceptance criteria to validate internationalization, enterprise security, multi-provider identity, notifications, regression resilience, and backup recovery.

| ID | Domain | Criteria Description | Verification Method | Status |
| :---: | :--- | :--- | :--- | :---: |
| **01** | i18n | English (`en`) UI renders canonical interface strings | Automated catalog test & web route verification | **PASS** |
| **02** | i18n | Czech (`cs`) UI renders localized labels (`Operace`, `Oznámení`) | Automated catalog test & web route verification | **PASS** |
| **03** | i18n | German (`de`) UI renders localized labels (`Operationen`, `Benachrichtigungen`) | Automated catalog test & web route verification | **PASS** |
| **04** | i18n | Polish (`pl`) UI renders localized labels (`Operacje`, `Powiadomienia`) | Automated catalog test & web route verification | **PASS** |
| **05** | i18n | Canonical enum and status values remain unchanged in API and DB | Schema inspect & database query assertions | **PASS** |
| **06** | i18n | User-authored content (evidence, notes, findings) is never silently translated | Content preservation check during locale switches | **PASS** |
| **07** | i18n | User timezone changes rendering display without mutating UTC storage | Format assertion comparing UTC timestamp to CET display | **PASS** |
| **08** | i18n | User preferences (`locale`, `timezone`) persist across sessions | `GET` and `PUT` `/api/preferences/me` verification | **PASS** |
| **09** | Briefings | Multilingual inject with `en` and `de` authored translations created | `ScenarioInjectTranslations` database insertion | **PASS** |
| **10** | Briefings | Inject released to distinct units with `en` and `de` preferences | `POST /api/scenario/injects/:id/release` execution | **PASS** |
| **11** | Briefings | Recipients receive correct localized snapshot (`en` vs `de`) | Verification of `scenario_deliveries` delivery records | **PASS** |
| **12** | Briefings | Subsequent edit to inject translation does not alter historical delivery | Edit translation & re-verify delivered snapshot immutability | **PASS** |
| **13** | Notifications | Assigning a task emits a localized in-app notification | Task creation + query `notifications` table | **PASS** |
| **14** | Notifications | Source event retry/replay deduplicates and prevents multiple alerts | Unique constraint `(source_event_id, user_id, type)` assert | **PASS** |
| **15** | Notifications | Notification marked read does not mutate domain `task.acknowledged_at` | `readAt` assertion vs `acknowledgedAt` nullity | **PASS** |
| **16** | Notifications | Release of mandatory briefing emits URGENT notification | Briefing release check with `requiresAcknowledgement=true` | **PASS** |
| **17** | Notifications | Notification marked read does not mutate `briefing.acknowledged_at` | Notification read state check vs briefing delivery state | **PASS** |
| **18** | Notifications | Email delivery reaches Mailpit SMTP endpoint | Mailpit HTTP API inspection on port 8025 | **PASS** |
| **19** | Notifications | Sensitive Medical, Scenario, and Evaluation details masked in email | Email body regex inspection for leak prevention | **PASS** |
| **20** | Notifications | Notification deep-link passes backend authorization checks | Authenticated routing simulation | **PASS** |
| **21** | Identity | Break-glass LOCAL administrator login operates successfully | `POST /api/auth/login` with local credentials | **PASS** |
| **22** | Identity | LDAP provider configuration and bind password encrypted at rest | Integration secrets AES-256-GCM verification | **PASS** |
| **23** | Identity | Unreachable/malformed LDAP server fails safely with clean error | Mock connection error containment test | **PASS** |
| **24** | Identity | LDAP failure does not disrupt or block LOCAL admin authentication | Local login test during simulated LDAP outage | **PASS** |
| **25** | Identity | OIDC provider configuration and client secret encrypted at rest | Database inspect of encrypted `client_secret` | **PASS** |
| **26** | Identity | OIDC state, nonce, and PKCE parameters validated via Redis | Cryptographic challenge generation and verify test | **PASS** |
| **27** | Identity | Unavailable OIDC IdP handles callback errors gracefully | Error redirection test without unhandled exceptions | **PASS** |
| **28** | Identity | LOCAL login remains operational during complete OIDC provider outage | Independent auth flow test | **PASS** |
| **29** | Security | Unprivileged participant denied access to Scenario secrets & Medical | RBAC test across `/api/scenario/injects` & `/api/medical` | **PASS** |
| **30** | Security | Global search strictly enforces security predicates per role | Typesense authorization filter queries | **PASS** |
| **31** | Security | AI Writing Assist context excludes unauthorized domain records | AI context extraction boundary test | **PASS** |
| **32** | Security | Notification Center queries filter strictly by recipient `user_id` | Cross-tenant notification isolation test | **PASS** |
| **33** | Security | Audit logs in PostgreSQL and S3 are immutable and append-only | Direct update rejection verification | **PASS** |
| **34** | Regression | Registry module operational | Entity listing and retrieval | **PASS** |
| **35** | Regression | Incidents module operational | Incident status workflow | **PASS** |
| **36** | Regression | Investigation Cases module operational | Case progression and linking | **PASS** |
| **37** | Regression | Evidence & Chain of Custody operational | Custody log verification | **PASS** |
| **38** | Regression | Chemical Laboratory analysis operational | Chemical run tracking | **PASS** |
| **39** | Regression | Digital Forensics operational | Forensic image analysis workflow | **PASS** |
| **40** | Regression | Documents module operational | Document revision and attachment | **PASS** |
| **41** | Regression | Scenario Control engine operational | Phase and inject management | **PASS** |
| **42** | Regression | Participant Briefings operational | Delivery and acknowledgement | **PASS** |
| **43** | Regression | Operational Tasks operational | Task delegation and lifecycle | **PASS** |
| **44** | Regression | Medical Response operational | Patient triage and interventions | **PASS** |
| **45** | Regression | Legal & Court proceedings operational | Filing, exhibits, and decisions | **PASS** |
| **46** | Regression | Evaluation & After Action Review operational | Criteria and observation scoring | **PASS** |
| **47** | Regression | Global Search operational | Fast cross-domain query resolution | **PASS** |
| **48** | Regression | Unified Timeline operational | Unified operational event stream | **PASS** |
| **49** | Operations | Disaster recovery backup snapshot created | `pnpm backup:create` creates archive | **PASS** |
| **50** | Operations | Backup manifest generated with timestamps and hashes | `manifest.json` validated | **PASS** |
| **51** | Operations | PostgreSQL dump generated and verified non-empty | `postgres.sql` size and content verified | **PASS** |
| **52** | Operations | S3 evidence and audit buckets synchronized to backup | `s3/` directory content validated | **PASS** |
| **53** | Operations | Disaster recovery restoration runbook documented | Step-by-step restoration documented | **PASS** |
| **54** | Quality | Monorepo TypeScript typecheck passes across all packages | `pnpm typecheck` exit code 0 | **PASS** |
| **55** | Quality | Full monorepo production build succeeds | `pnpm build` exit code 0 | **PASS** |
