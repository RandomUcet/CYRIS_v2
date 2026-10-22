# CYRIS v2 — Internationalization & Localization Architecture

> **Reference**: Phase 2 / Step 5 — Internationalization, Notifications, Enterprise Identity and Production Acceptance.

---

## 1. Architectural Philosophy: UI Language vs. Content Language

CYRIS is an operational exercise and incident coordination platform deployed for international cybersecurity exercises (such as Czech Cybertron) where multinational teams participate concurrently.

A strict boundary is maintained between **UI Language** and **Content Language**:

| Concept | Definition | Translation Behavior |
| :--- | :--- | :--- |
| **UI Language** | Static and parameterized text of the CYRIS application shell, navigation, buttons, forms, status badges, timelines, notification frames, and administrative controls. | **Fully Localized**: Translated client-side via the stable translation catalog according to the active user's preference or event default. |
| **Content Language** | Operational evidence, case notes, forensic artifacts, medical triage descriptions, witness statements, court filings, and SITREP reports entered by participants. | **Untranslated / Author-Preserved**: Never silently translated. Author-entered operational truth is sacred; silent machine translation risks legal and forensic corruption. |

Example:
- A German user sees UI label: `"Neue Aufgabe zugewiesen"` (UI Language = `de`).
- The task authored by a Czech participant displays: `"Zajistit diskové pole serveru SRV-01"` (Content Language = `cs`).
- The operational content is preserved exactly as authored unless explicit authored translations or human-approved drafts exist.

---

## 2. Supported Locales & Fallback Resolution

CYRIS v2 ships with production-grade translation catalogs for four initial locales:
1. `en` — English (System baseline & canonical fallback)
2. `cs` — Czech (Czech Cybertron native)
3. `de` — German (Multinational partner teams)
4. `pl` — Polish (Multinational partner teams)

### Language Resolution Hierarchy

When rendering UI strings or selecting participant briefing variants, CYRIS applies the strict three-tier cascade:

```
┌─────────────────────────────────┐
│       1. User Preference        │  (Configured in user profile / user_preferences)
└────────────────┬────────────────┘
                 │ (if unset)
                 ▼
┌─────────────────────────────────┐
│     2. Event Default Locale     │  (Configured in event settings, e.g. 'cs')
└────────────────┬────────────────┘
                 │ (if unset)
                 ▼
┌─────────────────────────────────┐
│     3. Canonical System Fallback│  (Hardcoded 'en')
└─────────────────────────────────┘
```

The system ensures that missing translations in regional catalogs gracefully fall back to English without throwing runtime rendering errors.

---

## 3. Persistent User Preferences

User preferences are stored in the dedicated, typed `user_preferences` table:

```sql
CREATE TABLE "user_preferences" (
  "user_id" varchar(64) PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "locale" varchar(8) NOT NULL DEFAULT 'en',
  "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
  "date_format" varchar(32),
  "time_format" varchar(32),
  "notification_channels" jsonb NOT NULL DEFAULT '{"inApp": true, "email": true}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
```

### Endpoints
- `GET /api/preferences/me`: Retrieves current authenticated user preferences, defaulting to event or system values if not yet configured.
- `PUT /api/preferences/me`: Updates preferences (`locale`, `timezone`, `notificationChannels`). Changes take effect immediately in the frontend session without requiring logout.

---

## 4. Timezone Management & Canonical UTC

1. **Storage**: All database timestamps (`created_at`, `updated_at`, `event_time`, `occurred_at`, `admitted_at`) are strictly stored in UTC with timezone (`timestamptz`).
2. **Rendering**: The client UI formats timestamps using `Intl.DateTimeFormat` configured with the user's active timezone (e.g. `Europe/Prague`, `Europe/Berlin`, `UTC`).
3. **Ambiguity Prevention**: Wherever operational precision matters (e.g. inject release, medical intervention, audit log, forensic timeline), the formatted string explicitly appends the timezone code or offset:
   - Example: `10:42:15 CET` or `09:42:15 UTC`.

---

## 5. Stable Translation Catalog Structure

Translation keys are decoupled from display strings and database enums.

```typescript
// Sample key structure in apps/web/src/lib/i18n.ts
export const translations = {
  en: {
    "nav.operations": "Operations",
    "nav.investigation": "Investigation",
    "status.in_progress": "In Progress",
    "task.assigned": "Task assigned to you",
    "notifications.title": "Notifications",
  },
  cs: {
    "nav.operations": "Operace",
    "nav.investigation": "Vyšetřování",
    "status.in_progress": "Probíhá",
    "task.assigned": "Úkol byl přiřazen vám",
    "notifications.title": "Oznámení",
  },
  de: {
    "nav.operations": "Operationen",
    "nav.investigation": "Ermittlung",
    "status.in_progress": "In Bearbeitung",
    "task.assigned": "Aufgabe Ihnen zugewiesen",
    "notifications.title": "Benachrichtigungen",
  },
  pl: {
    "nav.operations": "Operacje",
    "nav.investigation": "Śledztwo",
    "status.in_progress": "W toku",
    "task.assigned": "Zadanie przypisane do Ciebie",
    "notifications.title": "Powiadomienia",
  }
};
```

Domain database enums remain strictly canonical (e.g., `STATUS = 'IN_PROGRESS'`) across all API contracts and DB tables.

---

## 6. Multilingual Scenario & Briefing Content

Exercise controllers can author localized variants of scenario injects for multinational units without overwriting the master inject.

### Database Schema
```sql
CREATE TABLE "scenario_inject_translations" (
  "id" varchar(64) PRIMARY KEY,
  "inject_id" varchar(64) NOT NULL REFERENCES "scenario_injects"("id") ON DELETE CASCADE,
  "locale" varchar(8) NOT NULL,
  "participant_title" text NOT NULL,
  "participant_content" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_scenario_inject_translations_inject_locale" UNIQUE ("inject_id", "locale")
);
```

### Immutable Delivery Snapshotting
When an inject is released via `POST /api/scenario/injects/:id/release`:
1. The release service resolves the recipient unit/user locale.
2. It fetches matching `scenario_inject_translations` for that locale. If none exists, it falls back to event locale, then original inject content.
3. It creates an immutable `scenario_deliveries` record containing the exact resolved `locale`, `participant_title`, and `participant_content`.
4. **Immutability Guarantee**: Subsequent edits or additions to `scenario_inject_translations` do **not** retroactively modify previously delivered briefing records.

---

## 7. AI Translation Integration Policy

When AI Writing Assistance is invoked for translation:
1. **User-Triggered Only**: Translations must be explicitly requested by an operator; background background auto-translation is prohibited.
2. **Draft State**: Translations are produced in an uncommitted draft state.
3. **Attribution**: AI-generated text is flagged with visual indicators (`[AI Draft Translation]`).
4. **Approval**: An authorized operator must review and confirm the draft before it can be saved to `scenario_inject_translations`.
