# Operational UX quality contract

Scope: CYRIS is a training workspace, not a test of interface familiarity. Preserve the existing visual identity; improve hierarchy and language rather than adding decorative dashboards.

## Evidence and decisions
- W3C WCAG 2.2 (https://www.w3.org/TR/WCAG22/): keyboard operation, visible/unobscured focus, reflow, target size, error identification, and programmatic status. Target AA; do not claim conformance from a smoke test.
- Nielsen Norman Group, 10 Usability Heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/) and complex applications (https://www.nngroup.com/articles/usability-heuristics-complex-applications/): visible state, terminology matching task, recognition, prevention and recovery. Heuristics are inspection guidance, not proof of effectiveness in CYRIS.

## Acceptance protocol (proposed; no human results yet)
Use synthetic exercise data, separate actual participant roles, new and experienced users. Give an unscored practice task. Include keyboard-only, zoom/reflow, contrast and screen-reader review, and users needing accessibility adjustments. Ask participants to explain what the state means and what they would do next. Track task completion without help, critical errors, navigation reversals, help requests, time as diagnostic not as automatic performance score, and user-reported ease. Separate permission denial, system fault and comprehension error. Record version and task context; no biometric inference or covert monitoring. Obtain consent and minimize personal data. No grading change from UI telemetry alone.

Initial tasks: find personal queue; submit evidence; locate assigned sample; accept/return report; understand denial and recover; use admin permission review; complete other specialist flows. Proposed release rule: zero unresolved critical blockers in tested core paths, no unauthorized visibility, keyboard route reachable, mobile content usable. Human validation and independent accessibility review still needed. Follow-up: design tokens, terminology consistency, forms, EXCON, admin and all specialist modules. Record negative findings and avoid interpreting automated pass as human usability evidence.

## Record detail acceptance
A record header must retain readable identity, status, responsible unit and actions with long names and narrow screens; metadata is structured, status is textual and color supplementary. Error prevention must preserve work already typed. Browser acceptance covers completion without conclusion (no transition, draft remains) and header reflow. Automated evidence does not establish human usability.

## Laboratory correction acceptance
Replace the blocking native reason prompt with an inline labelled form, explicit target state, trimmed minimum reason, pending state and local error feedback. Cancel returns focus to the trigger; failed requests retain the reason. Existing correction permission and server authorization remain authoritative. Before confirmation, warn that unsaved report edits must be saved. Browser acceptance still required: authorized organizer opens, cancels and reopens by keyboard; whitespace reason does not send; denied request retains text; successful request refreshes status; ordinary analyst and View As cannot open the form; 390px reflow. No human validation claim.

## Laboratory assignment acceptance
Switch between two laboratories while the first worker lookup is pending; old responses must not repopulate the new selection. Verify retry on failed lookup, keyboard submission, queue versus named-worker action, retained reason after failed mutation, narrow viewport and unchanged authorization. Browser verification pending.

## Organizer laboratory browser acceptance (prepared)
The mandatory browser smoke now exercises actual correction and assignment after approved report return, including ordinary analyst denial, keyboard focus return, whitespace validation, narrow viewport, real correction response and assigned worker verification. Exact CI pending; this does not establish human usability. Failed network mutation and rapid cross-unit lookup remain separate acceptance tasks.

## Medical triage acceptance (prepared)
The form displays the record's existing category instead of choosing an unrelated priority, uses programmatic labels, clear pending state and no View As mutation controls. A separate canonical medical operator creates a synthetic UNIT record, finds it in the queue, deliberately changes the category via the UI, confirms persistence and checks unrelated BPS and cross-event denial. Mobile dialog and desktop queue screenshots planned. No clinical guidance or human validation claim; exact CI pending.


## Medical list keyboard acceptance (pending)
With a canonical medical operator and a synthetic encounter, use Tab to reach the named search and triage controls, filter to the encounter, Tab to its underlined identifier, verify visible focus and press Enter. Verify the correct detail opens, then return and confirm pointer row navigation still works. Repeat in CS and EN at 390px, including horizontal table scrolling. No browser result or accessibility conformance claimed yet.
