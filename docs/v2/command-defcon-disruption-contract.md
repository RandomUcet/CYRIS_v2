# CYRIS Command, DEFCON and Disruption Contract

This document is a future requirements contract. It describes approved product
direction; no command, DEFCON or disruption behavior is implemented by this
document or by CYRIS task 003.

## DEFCON and Exercise Readiness

The future CYRIS Command module shall integrate exercise-scoped authoritative
readiness without replacing the scenario engine or operational health model.

The established DEFCON semantics are:

| Level | Name | Color |
|---|---|---|
| 5 | Klid/Mír | `#29c76f` |
| 4 | Zvýšená bdělost | `#3b82f6` |
| 3 | Pohotovost | `#f3c53b` |
| 2 | Krize | `#ff7a18` |
| 1 | Katastrofa | `#d62d2d` |

Future capabilities shall include exercise-scoped state, operational posture,
exercise lifecycle, announcements, JKS control, organizer override, public and
restricted display profiles, SSE synchronization with polling fallback,
browser audio, unit branding, revision history, and stale-data indicators.

DEFCON 5 shall never be inferred from API failure or an unavailable integration.
The interface shall distinguish actual infrastructure health from the
authoritative simulated exercise state.

## Interactive Disruption and Recovery

The future disruption system shall support full participant-facing outage,
partial module outage, read-only mode, degraded simulated services, AI
unavailability, unit/user/module scope, restart-safe expiry, immediate EXCON
restoration and scheduled scenario restoration.

A disruption shall create an actionable exercise problem rather than blocking
participants invisibly. Depending on scenario and permission, the emergency
portal may publish diagnostic logs, scenario PCAP files, sanitized topology
artifacts, continuity documentation, emergency contacts or an offline recovery
workflow.

Actual secrets, database backups and infrastructure control endpoints shall
never be published as exercise artifacts.

## Participant-Driven Recovery

Recovery may depend on objective completion, recovery report submission,
artifact discovery, technical challenge completion, EXCON approval, scheduled
restoration or verified events from isolated cyber-range systems.

Services should be restored progressively. Scenario recovery should reuse the
existing scenario engine, injects, clocks and scheduler rather than introduce
another workflow engine.

External recovery events shall be authenticated, exercise-scoped, replay-safe,
validated and audited.

## Safety Boundaries

- EXCON and platform administrators shall retain a protected recovery path.
- PostgreSQL shall remain authoritative for exercise state.
- Redis may distribute or cache active states.
- BullMQ may schedule restoration.
- Real and simulated health shall remain separate.
- API operations shall enforce simulated restrictions consistently.
- No simulated condition shall stop or damage PostgreSQL, Redis, BullMQ or
  production containers.
- A simulated DEFCON shall never activate real physical sirens.
- Real emergency controls shall remain independent.
- Scenario artifacts shall not contain real credentials.
