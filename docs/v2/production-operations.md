# CYRIS v2 — Production Operations, Hardening & Disaster Recovery Runbook

> **Reference**: Phase 2 / Step 5 — Internationalization, Notifications, Enterprise Identity and Production Acceptance.

---

## 1. Single-Server Deployment Architecture

CYRIS v2 is engineered for robust, single-server operations on modern Linux distributions (Ubuntu 22.04 LTS, Debian 12, or AlmaLinux 9) without requiring complex container orchestrators (Kubernetes).

```
                      INTERNET / INTRANET
                               │ (Port 80 / 443)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Reverse Proxy (Caddy or Nginx)              │
│       TLS Termination, Security Headers, Static Routing     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
    /api/*, /health/*, /auth/*                 │ (All other traffic)
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│      Fastify API Backend    │ │      Next.js Web Frontend   │
│         Port: 4000          │ │         Port: 3000          │
└──────────────┬──────────────┘ └─────────────────────────────┘
               │
   ┌───────────┼───────────┬───────────┐
   ▼           ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐
│Postgres│ │ Redis  │ │Typesense│ │  MinIO  │
│ (5432) │ │ (6379) │ │ (8108)  │ │ (9000)  │
└────────┘ └────────┘ └─────────┘ └─────────┘
```

---

## 2. Reverse Proxy Configurations

### Option A: Caddy (Recommended for Automatic HTTPS)
Create `/etc/caddy/Caddyfile`:

```caddy
cyris.cybertron.internal {
    # Reverse proxy backend API endpoints
    handle /api/* {
        reverse_proxy localhost:4000
    }
    handle /health/* {
        reverse_proxy localhost:4000
    }
    handle /auth/* {
        reverse_proxy localhost:4000
    }

    # Reverse proxy frontend web application
    handle {
        reverse_proxy localhost:3000
    }

    # Production Security Headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http: https: ws: wss:; frame-ancestors 'none';"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        -Server
    }
}
```

### Option B: Nginx
Create `/etc/nginx/sites-available/cyris.conf`:

```nginx
server {
    listen 80;
    server_name cyris.cybertron.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cyris.cybertron.internal;

    ssl_certificate /etc/ssl/certs/cyris.crt;
    ssl_certificate_key /etc/ssl/private/cyris.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Fastify API Proxy
    location ~ ^/(api|health|auth)/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Next.js Web Proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 3. Environment Variable Validation & Fail-Fast Policy

The application backend implements startup validation. If any critical configuration is missing, the service terminates immediately with an explicit error code:

- `DATABASE_URL`: PostgreSQL connection string with credentials.
- `REDIS_URL`: Redis queue and session backend.
- `TYPESENSE_API_KEY` & `TYPESENSE_HOST`: Search cluster configuration.
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`: Evidence object store credentials.
- `CYRIS_MASTER_KEY`: 256-bit AES cryptographic root key (32 bytes base64-encoded).
- `PUBLIC_WEB_URL`: Canonical public origin used for safe deep links and OAuth redirects.

*Note: CYRIS never silently generates transient production secrets on startup.*

---

## 4. Health & Readiness Telemetry

Readiness is monitored at `GET /health/ready`:

```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "redis": { "status": "up", "latencyMs": 1 },
    "search": { "status": "up", "latencyMs": 3 },
    "storage": { "status": "up", "latencyMs": 5 },
    "worker": { "status": "up" },
    "mail": { "status": "up", "configured": true }
  },
  "optionalIntegrations": {
    "ldap": { "configured": 1, "status": "operational" },
    "oidc": { "configured": 1, "status": "operational" }
  }
}
```

**Resilience Invariant**: Unreachable or misconfigured optional integrations (e.g. secondary LDAP directory or third-party AI provider) do **not** mark core `/health/ready` as unhealthy.

---

## 5. Backup & Recovery Tooling

### Data Classification
- **Critical (Must Back Up)**:
  - **PostgreSQL**: Authoritative relational data, users, cases, evidence metadata, clinical records, inject definitions, audit references.
  - **MinIO / S3**: Binary evidence artifacts and immutable audit log streams.
- **Transient / Rebuildable (Do Not Back Up)**:
  - **Typesense**: Completely regenerated from PostgreSQL via `pnpm search:reindex`.
  - **Redis**: Transient cache and job queues.

### Operator Backup Commands
```bash
# 1. Create a full disaster recovery snapshot
pnpm backup:create

# 2. Verify snapshot integrity and secrecy compliance
pnpm backup:verify
```

### Secrecy & Decryption Key Dependency
- **Manifest**: Backups produce an atomic archive in `./backups/backup-<timestamp>/` containing `postgres.sql`, `s3/`, and `manifest.json`.
- **Zero Plaintext Secrets**: Integration secrets (LDAP bind passwords, OIDC secrets) are encrypted inside PostgreSQL.
- **Master Key Dependency**: Restoring a database backup requires the exact `CYRIS_MASTER_KEY` under which it was encrypted. Operators must securely store `CYRIS_MASTER_KEY` in an enterprise password manager or hardware vault.

---

## 6. Disaster Recovery Runbook (9-Step Operational Order)

In the event of total server loss or database corruption, execute recovery strictly in this sequence:

1. **Step 1: Host Infrastructure Setup**  
   Provision clean Linux VM, install Docker, Docker Compose, Node.js 20+, and pnpm.
2. **Step 2: Key Injection**  
   Inject original `CYRIS_MASTER_KEY` from password manager into `.env`.
3. **Step 3: Database Restoration**  
   Start PostgreSQL container and restore schema dump:
   ```bash
   cat ./backups/backup-<timestamp>/postgres.sql | docker exec -i cyris_postgres psql -U cyris cyris
   ```
4. **Step 4: Object Storage Restoration**  
   Start MinIO container and restore bucket contents:
   ```bash
   aws --endpoint-url http://localhost:9000 s3 sync ./backups/backup-<timestamp>/s3/cyris-storage s3://cyris-storage
   aws --endpoint-url http://localhost:9000 s3 sync ./backups/backup-<timestamp>/s3/cyris-audit s3://cyris-audit
   ```
5. **Step 5: Schema Migration Validation**  
   Ensure all migrations are synchronized:
   ```bash
   pnpm --filter @cyris/db db:migrate
   ```
6. **Step 6: Search Index Rebuild**  
   Rebuild Typesense schemas and index all records from PostgreSQL:
   ```bash
   pnpm search:reindex
   ```
7. **Step 7: Clean Redis Start**  
   Start fresh Redis instance; no historical state is required.
8. **Step 8: Application Services Start**  
   Start API, Web, and Background Worker processes.
9. **Step 9: Health Verification**  
   Confirm cluster readiness:
   ```bash
   curl -f http://localhost:4000/health/ready
   ```

---

## 7. Production Logging Hygiene

CYRIS implements strict redaction rules on all backend and worker loggers:
- **Redacted Parameters**: `password`, `bindPassword`, `clientSecret`, `token`, `session`, `cookie`, `CYRIS_MASTER_KEY`, `authorization`.
- **Confidentiality Rules**:
  - Medical patient vitals and triage notes are never printed to operational logs.
  - Scenario controller inject release triggers and secrets are excluded from logs.
  - All log entries preserve `requestId` and `userId` for audit traceability without leaking sensitive business payloads.
