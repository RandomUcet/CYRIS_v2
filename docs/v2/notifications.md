# CYRIS v2 — Notification System Architecture

> **Reference**: Phase 2 / Step 5 — Internationalization, Notifications, Enterprise Identity and Production Acceptance.

---

## 1. Conceptual Separation

CYRIS clearly separates three distinct event tracking streams to prevent notification fatigue and ensure regulatory compliance:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CYRIS Event Stream Types                        │
├─────────────────────┬──────────────────────────┬───────────────────────┤
│ Concept             │ Question Answered        │ Storage & Audience    │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Timeline**        │ What happened            │ Event/Incident logs;  │
│                     │ operationally?           │ all unit members      │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Audit**           │ Who changed what and     │ Immutable S3 audit    │
│                     │ when (compliance)?       │ log; security admins  │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ **Notification**    │ What requires THIS       │ Targeted in-app &     │
│                     │ user's attention right   │ email inbox; specific │
│                     │ now?                     │ user only             │
└─────────────────────┴──────────────────────────┴───────────────────────┘
```

Notifications are **not** created for general background events or unprompted CRUD changes. Only actionable operational signals generate notifications.

---

## 2. Notification Data Model

Notifications are stored in the PostgreSQL `notifications` table:

```sql
CREATE TABLE "notifications" (
  "id" varchar(64) PRIMARY KEY,              -- UUIDv7
  "user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_id" varchar(64) REFERENCES "events"("id") ON DELETE CASCADE,
  "type" varchar(64) NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'INFO', -- 'INFO' | 'ACTION' | 'URGENT'
  "template_key" varchar(128) NOT NULL,
  "template_params" jsonb NOT NULL DEFAULT '{}',
  "resource_id" varchar(64),
  "action_url" varchar(255),
  "source_event_id" varchar(64),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "read_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  CONSTRAINT "uq_notifications_dedup" UNIQUE ("source_event_id", "user_id", "type")
);
```

### Key Schema Characteristics
1. **Parameterized Templates**: Notifications store `template_key` (e.g. `task.assigned`) and a structured JSON payload `template_params` (`{"taskNumber": "TASK-0042", "title": "Secure workstation media"}`). The text is translated at display time in the recipient's UI language.
2. **Deduplication / Idempotency**: The unique index `(source_event_id, user_id, type)` guarantees that worker retries, outbox replays, or idempotent domain re-executions never generate duplicate alerts.

---

## 3. Severity Levels

| Severity | Purpose | Example |
| :--- | :--- | :--- |
| **`INFO`** | Non-blocking awareness updates. | Unit transfer completed; document published. |
| **`ACTION`** | Direct operational tasking requiring user action. | Task assigned to user; forensic analysis assigned. |
| **`URGENT`** | Time-critical operational demands. Used sparingly. | Briefing requires mandatory acknowledgement; high-severity incident escalation. |

---

## 4. Separation of Read State vs. Domain Acknowledgement

A critical architectural principle is that interacting with a notification does **not** mutate domain state:

- `notification.read_at` $\neq$ `task.acknowledged_at`
- `notification.read_at` $\neq$ `briefing.acknowledged_at`

Dismissing or marking a notification as read simply clears the user's personal alert queue. Formal operational acknowledgement must occur through the authoritative domain API (`POST /api/tasks/:id/acknowledge` or `POST /api/scenario/briefings/:id/acknowledge`).

---

## 5. Notification Provider Architecture

```
                       ┌─────────────────────────┐
                       │      Domain Service     │
                       │ (Tasks, Briefings, etc.)│
                       └────────────┬────────────┘
                                    │ emit notification intent
                                    ▼
                       ┌─────────────────────────┐
                       │  NotificationsService   │
                       │ (Deduplication & Router)│
                       └──────┬───────────┬──────┘
                              │           │
                 ┌────────────┘           └────────────┐
                 ▼                                     ▼
   ┌───────────────────────────┐         ┌───────────────────────────┐
   │ InAppNotificationProvider │         │ EmailNotificationProvider │
   │   (Database Persistence)  │         │   (SMTP / Mailpit Client) │
   └───────────────────────────┘         └───────────────────────────┘
```

Future providers (`MatrixNotificationProvider`, `DiscordNotificationProvider`, `WebhookNotificationProvider`) implement the same `NotificationProvider` contract.

---

## 6. Security & Confidentiality Safeguards

Notifications must **never** become an authorization bypass or leak classified exercise information:

1. **Information Masking in External Channels (Email)**:
   - For sensitive domains (**Scenario secrets**, **Medical casualty vitals**, **Evaluation grading**, **Restricted Evidence**), emails contain zero confidential payload.
   - Example Email: `"A new CYRIS operational briefing requires your attention. Open CYRIS: https://cyris.internal/briefings/brf_123"`
   - Under no circumstances does an email contain patient vitals (e.g., `"SpO2 72%, Cyanide poisoning"`) or inject inject injection triggers.
2. **Targeted In-App Delivery**: In-app notifications are only routed to users who hold permission on the underlying event/resource.
3. **Deep-Link Authorization**: Clicking `action_url` directs the user to the web UI, where all standard backend authorization and capability checks are strictly enforced before displaying resource data.
