# Operational UX quality contract

Scope: CYRIS is a training workspace, not a test of interface familiarity. Preserve the existing visual identity; improve hierarchy and language rather than adding decorative dashboards.

## Evidence and decisions
- W3C WCAG 2.2 (https://www.w3.org/TR/WCAG22/): keyboard operation, visible/unobscured focus, reflow, target size, error identification, and programmatic status. Target AA; do not claim conformance from a smoke test.
- Nielsen Norman Group, 10 Usability Heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/) and complex applications (https://www.nngroup.com/articles/usability-heuristics-complex-applications/): visible state, terminology matching task, recognition, prevention and recovery. Heuristics are inspection guidance, not proof of effectiveness in CYRIS.

## Acceptance protocol (proposed; no human results yet)
Use synthetic exercise data, separate actual participant roles, new and experienced users. Give an unscored practice task. Include keyboard-only, zoom/reflow, contrast and screen-reader review, and users needing accessibility adjustments. Ask participants to explain what the state means and what they would do next. Track task completion without help, critical errors, navigation reversals, help requests, time as diagnostic not as automatic performance score, and user-reported ease. Separate permission denial, system fault and comprehension error. Record version and task context; no biometric inference or covert monitoring. Obtain consent and minimize personal data. No grading change from UI telemetry alone.

Initial tasks: find personal queue; submit evidence; locate assigned sample; accept/return report; understand denial and recover; use admin permission review; complete other specialist flows. Proposed release rule: zero unresolved critical blockers in tested core paths, no unauthorized visibility, keyboard route reachable, mobile content usable. Human validation and independent accessibility review still needed. Follow-up: design tokens, terminology consistency, forms, EXCON, admin and all specialist modules. Record negative findings and avoid interpreting automated pass as human usability evidence.
