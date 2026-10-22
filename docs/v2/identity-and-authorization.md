# Identity, Events, Memberships & Authorization in CYRIS v2

## 1. User vs. Scenario Person

A core architectural boundary in CYRIS v2 is the strict separation between:

* **CYRIS User (`users` table)**:
  * A **real human operator** (e.g., student, instructor, scenario director, forensic investigator) who logs into the CYRIS web application or accesses the API.
  * Owns authentication credentials, active sessions, platform roles, and event memberships.
* **Scenario Person (future Registry module)**:
  * A **fictional entity** existing within a training or exercise scenario (e.g., suspect, witness, victim, corporate executive).
  * Has personal identification, fictional phone records, vehicle registrations, and evidence references.
  * **Never logs in** and has **no user account, sessions, or authorization roles**.

---

## 2. User ↔ Identity Model

Authentication identities are separated from the core user profile to support multi-provider authentication without schema churn:

```
                  ┌──────────────┐
                  │    User      │
                  │ (profile)    │
                  └──────┬───────┘
                         │ 1:N
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌───────────────┐┌───────────────┐┌───────────────┐
│ UserIdentity  ││ UserIdentity  ││ UserIdentity  │
│  type: LOCAL  ││  type: LDAP   ││  type: OIDC   │
│ Argon2id hash ││  (pre-wired)  ││  (pre-wired)  │
└───────────────┘└───────────────┘└───────────────┘
```

* **`users`**: Contains application-level operator identity (`id` [UUIDv7], `email`, `displayName`, `status: ACTIVE | DISABLED`, `lastLoginAt`).
* **`user_identities`**: Contains provider-specific authentication records (`providerType: LOCAL | LDAP | OIDC`, `providerSubject`, `passwordHash`, `metadata`).
* Password hashing exclusively uses **Argon2id**. Passwords and hashes are never logged.

---

## 3. Session Architecture

Browser authentication uses **server-side Redis-backed sessions** rather than stateless JWTs:

1. **Token Generation**: On successful authentication, CYRIS generates a cryptographically secure 32-byte hex opaque token.
2. **Redis Storage**: The session payload (`userId`, `createdAt`, `lastSeenAt`) is stored in Redis under `cyris:session:<token>` with a configurable TTL (default: 8 hours).
3. **Session Set**: Each user maintains a set `cyris:user_sessions:<userId>` tracking all active session IDs, enabling instant single-session or all-sessions revocation (`revokeAllSessions(userId)`).
4. **Transport**: Delivered to the browser via an `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie named `cyris_session`. Alternatively accepted via `Authorization: Bearer <token>`.
5. **Session Rotation**: Successful login automatically invalidates the previous session and issues a fresh session token to prevent session fixation.
6. **Account Invalidation**: If a user is marked `DISABLED`, subsequent requests immediately invalidate the session and return `401 Unauthorized`.

---

## 4. Identity Provider Abstraction

CYRIS exposes a pluggable `IdentityProvider` interface:

```typescript
export interface IdentityProvider {
  readonly type: IdentityProviderType;
  authenticate(credentials: unknown): Promise<AuthenticationResult>;
}
```

* **`LocalIdentityProvider`** *(Operational)*: Validates local email/password pairs against Argon2id hashes in `user_identities`.
* **`LdapIdentityProvider`** *(Boundary prepared)*: Reserved for institutional LDAP/Active Directory integration.
* **`OidcIdentityProvider`** *(Boundary prepared)*: Reserved for Single Sign-On (Keycloak, Google Workspace, Azure AD).

---

## 5. Event Membership & Hierarchy

CYRIS supports multiple concurrent exercises (e.g., *Czech Cybertron 2027*, *Czech Cybertron 2028*, *Exercise Alpha*). Users do not automatically have access to all events.

* **`events`**: Distinct editions/exercises (`slug`, `name`, `status: DRAFT | PREPARATION | ACTIVE | CLOSED | ARCHIVED`).
* **`event_memberships`**: Connects a `User` to an `Event` (`status: INVITED | ACTIVE | SUSPENDED`). Unique constraint on `(eventId, userId)`.
* **Platform Admin vs. Event Admin**: Platform administrators manage global configuration and event creation, but do not automatically pollute scenario rosters. Event roles apply strictly within their event context.

---

## 6. Generic Organizational Units

Units within an exercise are dynamic and hierarchical to allow organizational changes across years without database migrations:

```
Czech Cybertron 2027
├── Investigation (kind: TEAM)
│   ├── Team Alpha (kind: SQUAD, parentUnitId: Investigation.id)
│   └── Team Bravo (kind: SQUAD, parentUnitId: Investigation.id)
├── SOC (kind: TEAM)
├── Digital Forensics (kind: TEAM)
├── Chemical Laboratory (kind: LAB)
├── Tactical Unit (kind: TACTICAL)
├── Prosecution (kind: LEGAL)
└── Court (kind: JUDICIAL)
```

* **`organizational_units`**: Event-scoped organizational node (`eventId`, `parentUnitId`, `name`, `slug`, `kind`).
* **`membership_unit_assignments`**: Assigns an event member to one or more units (`membershipId`, `unitId`).

---

## 7. Role-Based Access Control (RBAC)

### 7.1. Roles as Named Bundles of Permissions

A Role in CYRIS is strictly a named container for permission keys. Application code **must never** branch on role names:

```typescript
// FORBIDDEN IN CYRIS V2:
if (user.role === 'investigator') { ... }

// REQUIRED IN CYRIS V2:
await authorizationService.authorize({
  user,
  permission: Permissions.UNIT_MANAGE,
  context: { eventId, unitId }
});
```

### 7.2. Permission Catalog

Stable permission string atoms:

| Key | Description |
|---|---|
| `platform.manage` | Platform-level system administration |
| `event.read` | View event metadata and roster |
| `event.create` | Create new events/exercises |
| `event.update` | Modify event configuration |
| `event.archive` | Archive an event |
| `membership.read` | View memberships in an event |
| `membership.manage` | Add, update, or remove event members |
| `unit.read` | View organizational units |
| `unit.manage` | Create, modify, or archive units |
| `role.read` | Inspect role definitions |
| `role.manage` | Create, edit, and assign roles |
| `audit.read` | Access security audit logs |

*(Domain modules in subsequent steps will add `case.*`, `evidence.*`, `lab.*`, etc.)*

### 7.3. Scopes & Contextual Predicates

CYRIS permission scopes are **not** modeled as one single linear hierarchy. Scopes are partitioned into organizational boundaries and contextual predicates:

```
Organizational Scopes:
  PLATFORM  ──►  EVENT  ──►  UNIT

Contextual Predicates:
  OWN       (User is resource author/owner)
  ASSIGNED  (User is explicitly assigned to resource)
```

* **`PLATFORM`**: Granted across the entire CYRIS installation (e.g., Platform Admin). Covers platform context and satisfies general event/unit contexts where appropriate.
* **`EVENT`**: Granted across all units and resources within a specific event (e.g., Scenario Director / Exercise Admin). Satisfies general unit context within the event.
* **`UNIT`**: Bounded strictly within the assigned organizational unit and its sub-units (e.g., Team Chief).
* **`OWN`**: Contextual predicate — applies only when the authenticated user is the owner/author of the resource.
* **`ASSIGNED`**: Contextual predicate — applies only when the authenticated user is explicitly assigned to the resource.

`OWN` and `ASSIGNED` are independent contextual predicates, not subordinate organizational ranks. Neither satisfies the other, and organizational scopes do not inherently satisfy them without ownership or assignment validation. Deny by default.

---

## 8. Concrete Authorization Examples

### Example 1: Platform Admin creating an Event
* **User**: Platform Administrator (`platform-admin` role assigned directly to `user`).
* **Required Permission**: `event.create` (scope: `PLATFORM`).
* **Evaluation**: User has `platform-admin` containing `platform.manage` and `event.create` with `PLATFORM` scope. Access granted.

### Example 2: Event Administrator managing Units
* **User**: Jan Novak (Member of *Czech Cybertron 2027*).
* **Role**: `Event Director` assigned to Jan's `event_membership`.
* **Permissions on Role**: `unit.manage` with scope `EVENT`.
* **Action**: `POST /events/:eventId/units` for `Czech Cybertron 2027`.
* **Evaluation**: Jan has active membership for `eventId`; membership has role granting `unit.manage` at `EVENT` scope. Scope matches context. Access granted.

### Example 3: Unit-level Investigator trying to archive the Event
* **User**: Eva Svobodova (Member of *Czech Cybertron 2027*, assigned to *Team Alpha*).
* **Role**: `Investigator` assigned to Eva's membership with permissions at `UNIT` scope (`unit.read`, `case.create`).
* **Action**: `PATCH /events/:eventId` (`event.update` or `event.archive`).
* **Evaluation**: Eva's roles do not contain `event.archive` or `event.update`. Authorization fails with `403 Forbidden`.

---

## 9. Administrator CLI Bootstrap

CYRIS provides an interactive bootstrap command that provisions the first platform administrator securely without defaults or `.env` credential leaks:

```bash
pnpm admin:create
```

* Prompts interactively for Email, Display Name, Password, and Password Confirmation.
* Uses `argon2id` hashing.
* Assigns the built-in `platform-admin` role.
* Safe against duplicates: running repeatedly with the same email will gracefully report that the administrator already exists.
