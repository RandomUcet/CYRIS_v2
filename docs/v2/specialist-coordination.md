# CYRIS specialist coordination

The integration PR and its latest checkpoint are the source of truth. This contract coordinates scheduled work without assuming runs start or finish serially.

| Role | Branch prefix | Scope |
|---|---|---|
| Backend | agent/cyris-backend | Domain services, contracts, schemas |
| UI/UX | agent/cyris-ux | Frontend, accessibility and UX documentation |
| Security | agent/cyris-security | Authorization, ACL, accounts and role policy |
| QA | agent/cyris-qa | Test fixtures and independent acceptance |
| Lead & DevOps | active release integration branch | Integration, CI, deployment tooling, release |

Specialists keep one draft PR per active workstream targeting the integration branch, not main. Record base and head SHA, test evidence, dependencies and next action in each PR. Never force-push or overwrite another specialist's changes. If another agent owns a needed change, describe the dependency rather than silently duplicating the patch. A completed schedule is not evidence that code exists or is validated.

Lead reviews exact diffs and compatibility, checks base/head again immediately before integration, and does not cancel in-progress mandatory validation by repeatedly pushing. Combine compatible reviewed increments when appropriate, then validate the exact candidate. Keep a single current integration checkpoint and stable release gates. Do not equate specialist branch CI or historical CI with final release acceptance.

For a release, freeze an explicit candidate scope; continue unrelated enhancements separately rather than indefinitely postponing a stable release. Do not omit known defects affecting included changes. Full destructive production operations remain disabled until independent recovery, writer isolation and operator acceptance are demonstrated. No agent deploys or modifies the production host during development. Publication is not production installation.

Current UX contract: [ux-quality.md](ux-quality.md). Persistent work: [delivery-ledger.md](delivery-ledger.md) and [roadmap-2027.md](roadmap-2027.md). No private PROXIS source material belongs in the public repository.
