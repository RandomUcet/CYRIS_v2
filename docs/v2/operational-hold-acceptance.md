# CYRIS: Operational pause v1 — architecture and acceptance gate

> **Review branch only. Not a production release.** Keep deployed v2.1.1 unchanged until these gates pass.

## Why a separate control
The existing `exercise_disruptions` represent **simulated** module outages that teams may investigate. They are not the same thing as a real operator-initiated writing lock (lunch break, safety intervention, administration). Operational holds therefore use their own table `exercise_operation_holds`, controller and enforcement interceptor. They must never affect DEFCON or imply real infrastructure is down.

## Implemented in this review
- Platform administrators can activate and restore holds with a reason, at EVENT, UNIT or USER scope, across ALL interactive event API writes or one selected feature/module. An optional automatic expiry is supported.
- Writes, including event-scoped uploads, fail at the API before controller mutation with `EXERCISE_WRITE_PAUSED`, not merely disabled buttons.
- Guards derive event identity from the authenticated request's registered route parameters; selected root resource/case routes derive ownership from the database.
- Read paths remain usable; support and admin recovery remain available to avoid administrator lockout. Read-only View As stays read-only.
- Database validation constrains target shape and expiry; user/team existence checked against the selected event.
- Optimistic revision prevents a stale restore from racing with another operator. Creation and restoration are audit logged with a reason.
- Participant notice displays the relevant operator-supplied reason and feature. Admin controls appear separately above simulated module restrictions.
- Event-wide holds on ALL, scenario or briefings now also suppress AUTO scenario-inject releases in the DB runtime, including the worker scheduler. Manual operator actions are still mediated by HTTP access control.

## Not yet a complete global freeze (hard gates before calling it one)
This v1 locks **interactive registered event API write routes**, not all scheduled/background writes, non-event notification/preference writes, external integrations, or direct database operations. For a true whole-exercise stop, the following must be implemented and tested before release:
1. Extend the implemented event-wide AUTO inject gate to **UNIT and USER** recipient scopes, other scheduled broadcasts, queued uploads, and non-scenario worker actions, without losing queued work.
2. Audit every mutation endpoint for event ownership resolution (including all non-event paths); add contract tests enumerating controller routes so no new write route can bypass the hold.
3. Atomically authorize and recheck holds inside long-running or concurrent write transactions so a request already executing cannot commit after the hold is activated. Define a drain/in-flight window and explicit UI confirmation.
4. Protect long-lived subscriptions, uploads and external callback workers; define safe handling of webhooks and idempotent retries.
5. Confirm UI on 1440/900/390px, CS/EN/DE/PL; audit event/role boundaries and race conditions; implement push/poll invalidation rather than assuming each user reloads.
6. Verify migration 0025 on a **disposable PostgreSQL with realistic fixtures**, including restoration from an encrypted backup. No actual server operation is implied by a passing unit test.

## Backup administration: security boundary
`cyrisctl backup` currently runs as a privileged host command and pauses infrastructure for a cold snapshot. **Do not expose Docker or a root shell through an API endpoint**, or give web administrators filesystem/backup-key access. A safe web-initiated backup requires a separate authenticated local agent/queue with a fixed allowlist of operations, one-shot confirmation, rate limits, audit, host-side privilege separation, encrypted archive validation and an off-host vault. Implement and penetration-test this before presenting a working backup button. For now use the existing `sudo cyrisctl backup`, `backups` and `backup verify` console commands.

## Remaining refoundation requirements from the user
- Fix all remaining medical modal layouts with browser screenshots and validated mobile/tablet flows; don't infer success from component tests.
- DEFCON sound on actual transition only: include wallboard/browser-session integration and multiple clients.
- Spark generator: allow safe image selection/attachment during **draft** generation (not just published records); validate magic/MIME, ownership and object storage, and separate model output from media transmission.
- Relations: complete feature discovery, hierarchy/filtering/graph navigation and accessibility with real exercise data.
- Support: triage, automatic eligible team assignment, context-aware AI and escalation without data leakage.
- Admin: broad cross-module correction with detailed immutable audit, restricted View As, team/person/feature operations, and safe hosted backup workflow.
- Full security review: RBAC/IDOR cross-event tests, session/CSRF, file handling, S3 ACL, audit integrity, SSRF, network/container privileges, supply chain, backup recovery. Do not promise 100% security.

## Required acceptance before any stable release
- CI build/typecheck/unit/DB migration/backup-restore must pass on the exact review SHA.
- Exercise pause: live participant POST/PATCH/PUT/DELETE + upload denied, GET succeeds, support reachable, admin can restore; check event/unit/user/module scopes and both positive and negative RBAC.
- Verify that no other event or unrelated team is affected; expiry, race/retry and concurrent restore.
- Check scheduled injection and worker bypass **before** labeling this an all-exercise operational freeze.
- Only then propose a separate stable release, with an operator-controlled production upgrade and rollback point.
