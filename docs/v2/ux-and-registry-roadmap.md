# CYRIS 2.5 — product quality and missing domain capabilities

## Design acceptance
Use existing CYRIS tokens, actual operational data, deliberate hierarchy. Avoid dashboard-by-template: gradients, repeated equal KPI cards, decorative status colors, redundant labels, all-caps and disclosure for small groups. Dense readable lists and tables for work; scenario clock and actionable exceptions first in EXCON. Presentation is a viewing surface, not a copy of administration. No fabricated metrics or public disclosure. Inspect desktop/mobile/light/dark and keyboard behavior before release; obtain user screenshots for visual acceptance.

## Local test accounts
Existing LocalIdentityProvider hashes with Argon2id; existing preview team switch governs generated preview accounts, not arbitrary local testers. Add admin-only individual provisioning in Users & Access, not reuse shared team passwords. Explicit event, unit and ordinary existing role selection; no platform privilege grants, no LDAP/OIDC auto-link by email, password only once (no audit/logs), revoke sessions on disabling, expiry and audit. Require testing of direct authorization, session revocation, identity collision, no unintended cross-event access, and coexistence with preview mode. No secret in GitHub.

## Scenario permits and licences
Create fictional registry records, not real permit issuance. Distinguish person/organisation holder, permit type, issuing authority, identifier, valid from/to, suspension/revocation and verification status from asset ownership. Link to canonical persons, organizations, weapons, vehicles and documents through existing resource visibility/relationship policies, with event-scoped integrity and audit. Never infer authorization from possession or a missing record; differentiate unknown/expired/revoked/valid-on-selected-date, avoid declaring real legal compliance. Support historical versions, registry search, detail backlinks, printable record and scenario generation with coherent fictional licences. Use verified Czech legal sources if implementing actual legal classification; do not encode speculative categories as law.

## Retained roadmap
Structured draft injects and dependencies, proactive Observer, scenario generation speed, legal corpus import and participant assistant remain in scope. Ship cohesive increments only after CI; server/Spark/browser acceptance remains separate.
