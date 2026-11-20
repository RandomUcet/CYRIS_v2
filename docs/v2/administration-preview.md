# Participant preview and exercise administration

Administrators can open **Users & Access**, select an exercise and use **View as** on an active participant. The roster shows actual names, active teams, role bindings, account/membership status and the membership creation date. Search covers names, email addresses, teams and roles. Missing teams or roles are shown explicitly.

## Preview guarantees

- Only a current platform administrator may start a preview. It requires an active target account and membership in the selected exercise.
- The browser stores a preview receipt in sessionStorage for the current tab. Every API request from the shared client carries its identifier. No target password or target session is created.
- The server binds the receipt to the administrator and their authenticated session. It rechecks the administrator role and participant membership on every preview request.
- Reads use the participant identity, ordinary backend authorization and the selected exercise. Search, notifications, resource routes, event lists and the current-user profile retain this boundary.
- POST, PUT, PATCH and DELETE operations are refused, including acknowledgements, preference updates and nested previews. The explicit exit endpoint operates as the original administrator. Logout revokes the original session.
- Preview reads do not initialize missing preference or scenario-clock records. Normal default clock reads are also side-effect free.
- A persistent banner identifies the participant and the read-only mode. Starting and ending preview reload the document to discard data and pending UI state from the previous identity.
- Read access expires after 15 minutes. Expiry or revoked permissions fails closed until the administrator explicitly returns to administration; the application never silently resumes administrator privileges in a participant screen.
- Start, allowed reads, blocked operations and explicit exit are audited under the administrator, with the target and preview identifiers. Permission-denial audit records also retain the administrator as actor.

The preview is scoped to one exercise. It is not an impersonation session for external systems, a physical control mode or an opportunity to modify participant data.

## Role boundaries and work queues

Exercise role creation, modification, assignment and revocation validate event scope and the actor server-side. Event role managers cannot assign platform roles, platform permission scopes, identity/provider administration or unknown permissions. A user-based assignment resolves to an active membership in the selected event. Unit-bound roles require a matching active team membership. Role edits and grants are transactional and auditable; concurrent duplicate grants return the same assignment.

Authorization, profiles and search consistently ignore malformed direct-user event grants, foreign-event roles and platform scopes attached to event memberships. Search keeps each unit permission bound to its own unit. Existing data is preserved.

My Work now returns `availableViews` and `availableUnits` from the server. The interface uses those values rather than guessing from a permission name. Members with only ASSIGNED rights see their personal queue; a team leader sees permitted teams; an exercise organizer sees the authorized exercise overview. Task navigation recognizes OWN and ASSIGNED grants without granting access to unrelated records.

## Verification

The repository test runner discovers tests under apps, packages and scripts, uses `tsconfig.tests.json` for workspace imports and Nest parameter decorators, and runs suites sequentially to preserve database fixture invariants. Database tests require an explicitly isolated local database and current migrations.

The administration-preview integration suite exercises role escalation, cross-event access, duplicate grants, roster contracts, legacy invalid grants, preview session binding, blocked writes, expiry, revoked privileges, read side effects and audit identity. Its database is real PostgreSQL; its Redis receipt store is an in-memory test adapter. Runtime/browser verification must additionally use the application with real Redis.

See `docs/STARTUP.md` for startup and migration requirements. External LDAP, DGX Spark and physical siren behavior require their actual configured services/devices; local checks do not establish their live status.

## Local verification record — 20 November 2026

- Production build completed for shared packages, API, worker and web; monorepo typecheck and `git diff --check` passed.
- Regression runner: 98 passed, zero failed, zero skipped; 8 existing TODO placeholders remain for older DEFCON/relationship/laboratory integration coverage. TODO cases are not counted as verified behavior.
- HTTP runtime check used the actual compiled API, Next.js proxy, isolated PostgreSQL and real Redis. It passed login, task creation, roster data, participant identity, personal-only work queues, write denial, cross-event denial, correct audit actor, expiry, explicit exit, original-session preservation, CORS and logout revocation.
- Browser rendering was not verified: local Chromium could not create its required Unix socket in this execution environment. No screenshot-based visual approval is claimed.
- No live external identity provider, AI endpoint or physical control device was contacted during this continuation.
