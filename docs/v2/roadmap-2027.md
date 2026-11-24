# CYRIS — roadmap to CzechCybertron 2027

Goal: dependable operational information layer for a multidisciplinary exercise. Preserve modular backend, role/event boundaries, Redis, search, object storage and local AI; simplify workflows rather than removing domain capabilities.

## Release strategy
- Bundle substantial end-to-end capability improvements into stable updates; keep published releases immutable. A passing CI run is not a publication decision. Do not cut a release for every small fix or count lines of code as a goal.
- Keep a cumulative development branch / draft PR across work sessions. Run CI continuously; merge and trigger publication only after the agreed release scope and acceptance are satisfied. Critical security or production-blocking hotfixes may be isolated.
- Current 2.4.22 scope expands beyond workspace polish: EXCON operational overview (clock, phase timeline, actionable workload), inter-team workflow improvements, measured performance work where evidence is available, and targeted UX/role acceptance. Remaining items must be tracked explicitly rather than implied complete.
- Exact-head CI, database tests, encrypted backup restoration, multiarchitecture image and digest checks remain required.
- Use a dedicated nonproduction exercise for interactive acceptance. Do not confuse simulated data with CYLAB infrastructure telemetry.

## Delivery tracks (proposed priorities, not completed capabilities)

| Track | Next deliverables | Acceptance |
| --- | --- | --- |
| UX / accessibility | Audit list/detail/form patterns, responsive tables, theme contrast, keyboard navigation and Czech labels | Desktop/mobile, light/dark, seven role walkthroughs; no clipped controls |
| EXCON | Actionable alerts, phase/clock visibility, team readiness and handover workflow, scheduled-message visibility | Accurate status and timing; role-scoped actions; no fabricated online presence |
| Spark | Generation profiling, controlled workload, resumable draft UX, inspect/review data and assets before import | Measure real DGX durations and success rate; preserve data and human approval |
| Inter-team workflow | Connect authorized records, lab/forensics requests, court materials and technical simulation findings | End-to-end multi-role exercise; no cross-event data leakage |
| Operations / security | Review CSP, ingress, CSRF, limits, audit and secret handling; test backup restore and service outages | Threat review, regression suite, documented recovery exercise and realistic load measurements |
| Evaluation | Define rubric and outcomes, reliable timelines and aggregate after-action reporting | Reproducible counts, authorized export, no claims of physical completion without verification |
| Administration | Improve onboarding and templates, safe event cleanup only after verified backup and dependency/retention checks | Dry-run impact, recovery rehearsal, explicit confirmation; no unsafe DELETE |
| CYLAB integration | Define read-only, authenticated integration contract for real telemetry and separate it from simulated JSOC | Explicit provenance and access control; independent verification before enabling |
| Demonstration | Dedicated fictional dataset and guided seven-team demo, product reveal using actual UI | Repeatable reset, offline fallback, no participant personal data |

## Current milestone 2.4.22
Brand spacing, table reliability, preview-state handling, JSOC reference copying, EXCON attention and freshness, legal inbox failure handling. Actual browser acceptance and production benchmark still outstanding.

## Next implementation order
1. Accumulate the larger 2.4.22 scope on PR #51; do not publish solely because CI passes.
2. Improve EXCON time/phase and handover visibility; map cross-team workflow bottlenecks. Validate on a dedicated exercise and collect browser feedback.
3. Run measured Spark and concurrent-user tests before changing defaults.
4. Implement remaining operations/security and evaluation tasks as verified requirements, not speculative features.
