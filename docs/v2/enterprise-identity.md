# CYRIS v2 — Enterprise Identity Integration (LOCAL, LDAP/AD, OIDC)

> **Reference**: Phase 2 / Step 5 — Internationalization, Notifications, Enterprise Identity and Production Acceptance.

---

## 1. Identity Architecture Overview

CYRIS v2 supports hybrid multi-provider enterprise identity:

```
                  ┌─────────────────────────────────────────┐
                  │               Login UI                  │
                  └────────────┬──────────────┬─────────────┘
                               │              │
                   [Credentials Form]   [OIDC SSO Button]
                               │              │
                               ▼              ▼
                 ┌──────────────────┐   ┌──────────────────┐
                 │ Local Auth (Argon2)  │ OIDC Provider    │
                 │ LDAP / AD Search │   │ (PKCE, State,    │
                 │ & Bind Auth      │   │ Nonce, Discovery)│
                 └─────────┬────────┘   └─────────┬────────┘
                           │                      │
                           ▼                      ▼
                 ┌─────────────────────────────────────────┐
                 │  Canonical Identity Resolution          │
                 │  (users + user_identities tables)       │
                 └────────────────────┬────────────────────┘
                                      │
                                      ▼
                 ┌─────────────────────────────────────────┐
                 │ CYRIS Server-Side Session               │
                 │ (Redis session store + HttpOnly cookie) │
                 └─────────────────────────────────────────┘
```

Primary design invariants:
1. **LOCAL Independence**: Local password authentication operates independently of external networks. External network failures or directory server crashes can never prevent LOCAL logins.
2. **Break-Glass Local Admin**: Production deployments must retain at least one break-glass LOCAL system administrator account to ensure emergency access during corporate SSO outages.
3. **Session Consistency**: All authentication methods terminate in standard CYRIS server-side sessions with secure HttpOnly cookies. JWTs are never used as long-lived browser authentication tokens.

---

## 2. Cryptographic Secret Storage

All sensitive identity provider credentials (LDAP `BIND_PASSWORD` and OIDC `CLIENT_SECRET`) are encrypted at rest using AES-256-GCM envelope encryption backed by `CYRIS_MASTER_KEY` via `IntegrationSecretsService`.
- Secret values are **never returned over the REST API**.
- Secret payloads are marked with `hasSecret: true` in administrative API responses.

---

## 3. LDAP / Active Directory Integration

### Configuration Fields
- **Display Name**: Human-readable label (e.g. `Cybertron Military AD`).
- **URL & TLS**: `ldap://` or `ldaps://` endpoint with startTLS or LDAPS verification.
- **Service Bind**: `bindDn` and encrypted `bindPassword` used to search the directory tree.
- **Search Parameters**: `baseDn`, `userFilter` (e.g. `(&(objectClass=user)(sAMAccountName={username}))`), attribute mappings for `username`, `email`, and `displayName`.
- **Group Mapping (Optional)**: `groupBaseDn` and `groupFilter` for mapping Active Directory security groups to initial CYRIS roles and unit memberships.

### Safe Authentication Flow
1. **Bind**: API connects to LDAP using configured service account.
2. **User Lookup**: Search `baseDn` for the requested username attribute.
3. **User Authentication**: Re-bind as the located user DN using the participant-provided password.
4. **Resolution**: If valid, match against `user_identities` (provider: `ldap`, provider_user_id: user DN or GUID).
5. **JIT Provisioning**: If user is unknown and JIT is enabled, create a new CYRIS user account without elevated permissions.

---

## 4. OpenID Connect (OIDC) Integration

### Standards & Security Compliance
- **Specification**: Standards-compliant OpenID Connect Core 1.0 utilizing the mature `jose` cryptographic library.
- **Auto-Discovery**: Resolves endpoints via `/.well-known/openid-configuration`.
- **State & Nonce Validation**: Ephemeral, single-use cryptographically random tokens stored in Redis with 10-minute TTL to defend against replay and CSRF attacks.
- **PKCE (Proof Key for Code Exchange)**: S256 code challenge generated during redirect and verified during token exchange to protect authorization codes.
- **Token Validation**: Strictly validates signature, issuer URL, client ID (audience), and expiration timestamp before extracting claims.

---

## 5. Just-In-Time (JIT) Provisioning & Principle of Least Privilege

When JIT provisioning is enabled on an external provider:
- Successful external authentication of a first-time user automatically registers a CYRIS user profile.
- **Least Privilege Guarantee**: New JIT users receive **no automatic event memberships** and **no administrative roles**. An exercise administrator must assign the user to specific events, units, or workspaces.
- External directory membership does not automatically grant sovereign CYRIS platform permissions.

---

## 6. Safe Identity Linking

Accounts are tracked in `users` and linked via `user_identities`:
- A single user may possess multiple identities (`LOCAL` + `LDAP` + `OIDC`).
- **Takeover Prevention**: Automatic account takeover by unverified email matching is prohibited. Linking external identities to existing local accounts requires explicit administrative linking or verified provider trust policy.
