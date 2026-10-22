# CYRIS v2 UI Design System & Product Experience

> **Cybertron Registry & Intelligence System**  
> Operational, investigative and information workspace of Czech Cybertron.  
> Character: *European emergency operations software × investigative intelligence platform × modern institutional system.*

---

## 1. Visual Identity & Design Principles (Phase 2 Reset)

CYRIS is professional operational command software for Czech Cybertron:
- **Typeface**: `Inter`, `-apple-system`, `BlinkMacSystemFont` for high-clarity typography. Monospace: `JetBrains Mono`, `Fira Code`.
- **Foundations**: Deep graphite & neutral navy foundations (`#090C10`, `#0F131A`, `#151A24`, `#242C3D`).
- **Operational Accent**: Cool cyan / cobalt blue (`#0284C7`, `#38BDF8`) for interactive focus and active states.
- **CYLAB Orange Accent**: `#E15C19` used sparingly as an identity signal marker and section accent (never as a loud background fill).
- **Core Rule — "One Workspace"**:
  - Treat each screen as one coherent information surface.
  - Do NOT wrap every logical group in a bordered card inside another bordered card.
  - Establish hierarchy through typography, alignment, spacing, thin section separators, and restrained background level changes.
  - A border must have a structural reason.
- **Restrained CYRIS Signature**:
  - Characteristic section rules (`.cyris-section-header`) with the CYLAB orange signal marker (`.cyris-signal-marker`).
  - Disciplined monospace operational identifiers (`CASE-0001`, `INC-0001`, `E-0042`, `LAB-0019`) without bulky surrounding card boxes.
  - Ambient intelligence integration without glowing AI gradients or dedicated giant AI cards.

---

## 2. Design Tokens (`globals.css`)

```css
:root {
  /* Foundations & Surfaces */
  --bg-canvas: #090c10;
  --bg-panel: #0f131a;
  --bg-surface: #151a24;
  --bg-surface-hover: #1b2230;
  --bg-active: #222b3d;
  --bg-inset: #0a0d13;

  /* Borders */
  --border-subtle: #19202c;
  --border-default: #242c3d;
  --border-strong: #374258;
  --border-focus: #38bdf8;

  /* Typography */
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-dim: #475569;

  /* Operational Brand & Accents */
  --accent-primary: #0284c7;
  --accent-hover: #0369a1;
  --accent-subtle: rgba(2, 132, 199, 0.12);
  --accent-active: #38bdf8;

  /* CYLAB Sister Identity Accent (Restrained) */
  --cylab-orange: #e15c19;
  --cylab-orange-subtle: rgba(225, 92, 25, 0.14);

  /* Semantic Status Colors (Only) */
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger: #ef4444;
  --status-info: #0ea5e9;
  --status-restricted: #8b5cf6;

  /* Layout Dimensions */
  --nav-width: 210px;
  --nav-collapsed-width: 52px;
  --topbar-height: 44px;
  --inspector-width: 380px;
}
```

---

## 3. Dynamic Navigation & Simplified Sidebar (`SideNav`)

The sidebar no longer shows all modules to all users, nor does it assume `Team = Module`:
- **Dynamically Resolved**: Navigation sections are loaded from `/events/:eventId/workspace`, resolved from active unit capabilities and authenticated roles.
- **Narrower & Calmer**: Width reduced to `210px` (or `52px` in collapsed icon mode) with subdued section labels and low vertical noise.
- **Role-Appropriate**:
  - Investigation operators see `Overview`, `Timeline`, `Investigation` (Cases, Incidents, Registry), `Evidence`.
  - Chemical Laboratory analysts see `Overview`, `Timeline`, `Analysis` (Work Queue, Chemical Analysis), `Evidence`.
  - Platform Administrators see operational workspaces plus unified `Administration` (Events, Units, Users, Roles, Audit, Integrations).
- **Administration Separation**: Integrations & AI settings are nested under `Administration → Settings → Integrations` rather than dominating daily operations.

---

## 4. Top Context Bar (`TopBar`)

- Functions as a slim, unified tool strip (`44px` height).
- Streamlined event selector with compact status pill.
- Direct breadcrumb pathing without decorative boxes.
- Global search shortcut (`Cmd+K` / `Ctrl+K`).
- User profile & session controls.

---

## 5. Overview Page: Operational Briefing Worksheet

The Overview page has been completely redesigned away from dashboard card grids:
- **No Decorative KPI Boxes**: Removed decorative counts ("Cases: 1, Incidents: 1...") that clutter screen real estate.
- **Briefing Sheet Format**: Content is structured like a unified operational briefing sheet (`.workspace-sheet` and `.workspace-row`).
- **Capability-Aware Composition**:
  - Investigators see Open Investigations, Active Incidents, Evidence, and Recent Operational Activity.
  - Chemical Laboratory analysts see Analysis / Work Queue, Completed Determinations, and Laboratory Activity.
- **Ambient Intelligence**: AI Catch Me Up is integrated as a calm, ambient trigger bar (`Last briefing 10:42 | Catch me up`) without AI gradients or glowing cards.

---

## 6. Record Detail Experience (Workspace Layout)

Record views (such as Case Detail) emphasize work surfaces rather than isolated cards:
- **Typographic Hierarchy**: Structured with clear section titles and characteristic signal markers (`.cyris-section-header`).
- **Separators over Boxes**: No cards around summary, no cards around metadata, no cards around resources.
- **Monospace Identifiers**: `CASE-0001`, `INC-0001`, `E-0042`, `LAB-0019` styled with clean monospace typography without heavy surrounding borders.

---

## 7. Timeline Chronology & Chain of Custody

### Timeline
- A continuous, unbroken vertical spine (`.timeline-spine`, `.timeline-node`, `.timeline-content`).
- Avoids wrapping every event in a bordered card.
- Inline expansion allows inspecting causation IDs, actors, and reasons without destroying the visual chronological flow.

### Chain of Custody Handover Flow
- High-density, compact handover stream (`.custody-stream`):
  ```
  10:44  SECURED   Scene → J. Novák
  11:03  TRANSFER  J. Novák → Digital Forensics (Reason: image acquisition)
  ```
- Eliminates redundant cards for custody transfer events.

---

## 8. Cytoscape Relationship Graph

- Restrained graph aesthetic matching CYRIS palette.
- Neutral graphite nodes (`#151a24`), subtle borders, cool cyan active selection (`#38bdf8`), and dark connectors (`#374258`).
- High-legibility labels with dark backdrop badges, avoiding neon glow effects.
