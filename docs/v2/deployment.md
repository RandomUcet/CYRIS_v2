# CYRIS v2 — Production Deployment & Operations Guide

> **Specification Reference**: STEP 8/8 — CYRIS Intelligence, Integration Security and Production Readiness.  
> **Target Environment**: Single-server bare metal / virtualization running Docker & Linux. No Kubernetes or Terraform required.

---

## 1. System Architecture & Prerequisites

CYRIS v2 is engineered for streamlined single-server deployment. All persistence and infrastructure dependencies run in localized Docker containers, with the NestJS API backend and Next.js frontend running either as containerized services or supervised Node.js processes.

```
┌─────────────────────────────────────────────────────────────┐
│                      Host / Reverse Proxy                    │
│                        (Nginx / Caddy)                      │
│        Port 80/443 → Frontend (3000) & API (4000)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────┐         ┌───────────────────────┐
│     Next.js Web (3000)    │         │    NestJS API (4000)  │
│      (SSR & Client)       │         │  (Fastify, Business)  │
└───────────────────────────┘         └───────────┬───────────┘
                                                  │
       ┌──────────────────┬───────────────────────┼──────────────────┐
       ▼                  ▼                       ▼                  ▼
┌──────────────┐   ┌──────────────┐        ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │        │  Typesense   │   │   MinIO S3   │
│  + pgvector  │   │  (Queue/Job) │        │(Authoritative│   │   (Evidence  │
│  (Port 5432) │   │ (Port 6379)  │        │Search: 8108) │   │ Storage:9000)│
└──────────────┘   └──────────────┘        └──────────────┘   └──────────────┘
```

### Hardware Requirements
- **CPU**: 4+ Cores (ARM64 or x86_64).
- **RAM**: 8 GB minimum (16 GB recommended for active exercise workloads).
- **Disk**: 100+ GB SSD (storage scales with evidence attachments).
- **Operating System**: Linux (Ubuntu 22.04 LTS, Debian 12, or AlmaLinux 9) or macOS.
- **Runtimes**: Node.js 20+ LTS, pnpm 9+, Docker 24+ & Docker Compose v2.

---

## 2. Environment Variables & Security Configuration

Create a production `.env` file in the repository root based on `.env.example`:

```bash
# ==============================================================================
# CYRIS v2 — Production Environment Configuration (.env)
# ==============================================================================

NODE_ENV=production
PORT=4000

# 1. PostgreSQL with pgvector (Canonical Business Source of Truth)
POSTGRES_DB=cyris
POSTGRES_USER=cyris
POSTGRES_PASSWORD=YOUR_STRONG_POSTGRES_PASSWORD
DATABASE_URL=postgresql://cyris:YOUR_STRONG_POSTGRES_PASSWORD@localhost:5432/cyris

# 2. Redis (Transient Outbox, Queues & Caching)
REDIS_URL=redis://localhost:6379

# 3. Typesense (Global Fast Search Engine - Rebuildable)
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=YOUR_STRONG_TYPESENSE_KEY

# 4. S3 Object Storage / MinIO (Evidence Files & Immutability)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=cyris-storage
S3_AUDIT_BUCKET=cyris-audit
S3_ACCESS_KEY=YOUR_MINIO_ACCESS_KEY
S3_SECRET_KEY=YOUR_MINIO_SECRET_KEY

# 5. Mail Service (Alerts & Invitations)
SMTP_HOST=localhost
SMTP_PORT=1025

# 6. Cryptographic Envelope Root Key (CRITICAL: 256-bit AES-256-GCM Master Key)
# Must be exactly 32 bytes encoded in Base64 or 64 hex characters.
CYRIS_MASTER_KEY=GENERATE_WITH_PNPM_SECRETS_KEYGEN
```

### Generating `CYRIS_MASTER_KEY`
Run the dedicated key generator:
```bash
pnpm secrets:keygen
```
Copy the printed base64 string into your `.env` file.  
**CRITICAL**: Never commit `CYRIS_MASTER_KEY` into git or store it in PostgreSQL. Back up this key in your password manager or vault; losing it will render all stored integration secrets unrecoverable.

---

## 3. Step-by-Step Production Initialization

### Step 1: Install Dependencies
```bash
pnpm install --frozen-lockfile
```

### Step 2: Start Infrastructure Services
```bash
docker compose up -d
```
Verify all four core services report healthy:
```bash
docker compose ps
```

### Step 3: Run Database Migrations
Applies all DDL migrations (`0000` to `0003`) to PostgreSQL:
```bash
pnpm db:migrate
```

### Step 4: Build Packages
```bash
pnpm build
```

### Step 5: Initialize Search Collections
Sets up Typesense collections and field schemas:
```bash
pnpm --filter @cyris/api run search:setup
```

### Step 6: Create First Administrator
Creates the default platform administrator (`admin@cyris.local`):
```bash
pnpm --filter @cyris/api run admin:create
```
To update or rotate the administrator password:
```bash
pnpm --filter @cyris/api run admin:password
```

### Step 7: Start Application Daemons
In production, manage processes using `pm2`, `systemd`, or Docker:

#### Using Systemd or PM2:
```bash
# Terminal 1 / Service: API Server
pnpm --filter @cyris/api start

# Terminal 2 / Service: Web Frontend
pnpm --filter @cyris/web start
```

---

## 4. Disaster Recovery & Backup Strategy

CYRIS clearly separates authoritative business records from rebuildable or transient state:

```
┌────────────────────────────────────────┐
│      CRITICAL BACKUP DATA (MUST SAVE)  │
│  1. PostgreSQL (Relational Truth)      │
│  2. MinIO / S3 (Files & Objects)       │
│  3. .env (CYRIS_MASTER_KEY)            │
└────────────────────────────────────────┘
                    │
┌───────────────────┴────────────────────┐
│      REBUILDABLE / TRANSIENT DATA      │
│  • Typesense: Reindexed from Postgres │
│  • Redis: Ephemeral cache & jobs       │
└────────────────────────────────────────┘
```

### Automated Backup & Verification Commands
CYRIS v2 includes automated backup snapshot and verification scripts:
```bash
# Create complete snapshot (PostgreSQL dump + S3 evidence mirror + manifest)
pnpm backup:create

# Verify snapshot integrity, manifest hashes, and secrecy compliance
pnpm backup:verify
```

---

## 5. Enterprise Identity Integration (LDAP / AD & OIDC)

CYRIS v2 supports hybrid multi-provider enterprise identity:
- **LOCAL**: Always available independent break-glass admin authentication.
- **LDAP / Active Directory**: School/military AD directory search and bind.
- **OIDC**: Standards-compliant SSO with PKCE, state/nonce validation, and JIT provisioning.

Configure directory providers at **Administration → Identity Providers**.
All bind passwords and client secrets are encrypted using `CYRIS_MASTER_KEY` via AES-256-GCM.
See the [administrator handbook](../prirucka-spravce.md) for directory group rules and individual team placement.

---

## 6. Reverse Proxy & Production Hardening

Deploy CYRIS behind a reverse proxy (Caddy or Nginx) terminating TLS:
- All API and Web traffic routed through ports 80/443.
- Strict security headers (`CSP`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `HSTS`).
- See [production-operations.md](file:///Users/mac/Documents/Projekty/CYRIS_v2/docs/v2/production-operations.md) for complete Caddy/Nginx configs and the 9-step disaster recovery runbook.

---

## 7. Connecting NVIDIA DGX Spark

The database migration creates **CYRIS DGX Spark**. From a host with access to
the CYLAB network, copy [the setup script](../../deploy/spark/setup.sh) to the
device. Follow the [administrator handbook](../prirucka-spravce.md) to start
the two runtimes, verify the connection from CYRIS and enable the profile.

