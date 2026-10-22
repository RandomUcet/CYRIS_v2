# CYRIS v2 — Local Infrastructure Guide

This document describes the local containerized development infrastructure for **CYRIS v2**, established in **STEP 1/8**.

---

## 1. Architectural Roles & Future Design Principles

The local stack provides the foundation for the CYRIS v2 platform. To maintain architectural purity across subsequent development steps, the following system boundaries are strictly defined:

| Service | Architectural Role | Future Usage & Boundaries |
| :--- | :--- | :--- |
| **PostgreSQL (`pgvector/pgvector:pg16`)** | **Primary Source of Truth** | All relational domain models, audit logs, cases, evidence metadata, workflows, and vector embeddings reside here. Vector extension is enabled; application tables will be introduced in subsequent steps. |
| **Redis (`redis:7-alpine`)** | **Background Jobs & Cache** | Serves BullMQ queues, asynchronous task orchestration (indexing pipelines, file processing, background AI jobs, scheduled LDAP synchronizations). Queues will be created as workers are implemented. |
| **Typesense (`typesense/typesense:27.1`)** | **Derived Search Index** | Global ultra-fast search engine. Indexes people, organisations, cases, incidents, evidence, laboratory records, documents, technical indicators, and relationships. Indexes are purely derived from the primary source of truth (PostgreSQL) and can be rebuilt at any time. |
| **MinIO (`pgsty/silo:latest`)** | **S3-Compatible Object Store** | Stores binary assets (evidence files, documents, laboratory images, attachments, and generated PDF/XLSX reports). **Rule:** Application code must use standard S3 SDK concepts (e.g., AWS SDK S3 client), never MinIO-specific proprietary APIs. |
| **Mailpit (`axllent/mailpit`)** | **Local SMTP Capture** | Catches all outbound development emails (user invites, verification tokens, password resets, incident notifications) and presents an interactive web UI. |

### Long-Term AI & Security Constraints
1. **DGX Spark Connectivity**: DGX Spark will later connect **exclusively** through an application-level AI provider abstraction. DGX Spark must **never** receive direct database or storage access.
2. **Server-Side Secret Encryption**: Integration credentials (such as LDAP bind passwords, OIDC client secrets, and DGX Spark tokens) will be encrypted at rest using envelope encryption backed by `CYRIS_MASTER_KEY`.
3. **No Legacy Migration**: CYRIS v2 is a greenfield implementation; no legacy schema migrations or backwards-compatibility shims are used.

---

## 2. Infrastructure Services & Topology

All containers communicate over an isolated user-defined Docker bridge network named `cyris-network`.

| Service Name | Container Name | Host Port | In-Network Port | Image | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `postgres` | `cyris-postgres` | `5432` | `5432` | `pgvector/pgvector:pg16` | PostgreSQL 16 with pgvector extension |
| `redis` | `cyris-redis` | `6379` | `6379` | `redis:7-alpine` | In-memory key-value cache and job broker |
| `typesense` | `cyris-typesense` | `8108` | `8108` | `typesense/typesense:27.1` | Instant search and typo-tolerant indexing |
| `minio` | `cyris-minio` | `9000`, `9001` | `9000`, `9001` | `pgsty/silo:latest` (pinned sha256) | S3 API (`9000`) & Web Console (`9001`) |
| `minio-init` | `cyris-minio-init` | — | — | `pgsty/mc:latest` (pinned sha256) | One-shot bucket provisioner (`cyris-storage`) |
| `mailpit` | `cyris-mailpit` | `1025`, `8025` | `1025`, `8025` | `axllent/mailpit:latest` (pinned sha256) | SMTP Server (`1025`) & Web UI (`8025`) |

### Persistent Volumes
- `postgres_data` -> `/var/lib/postgresql/data`
- `redis_data` -> `/data`
- `typesense_data` -> `/data`
- `minio_data` -> `/data`

---

## 3. Getting Started

### Prerequisites
- Docker Engine 24+ and Docker Compose v2.20+ (Docker Desktop on macOS Apple Silicon / ARM64 or Linux).

### Environment Configuration
1. Initialize the local `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
2. Adjust any local passwords or secrets if necessary. The default configuration in `.env.example` provides secure, working local defaults.

### Starting the Infrastructure
Start all services in detached mode:
```bash
docker compose up -d
```

### Checking Status & Health
```bash
docker compose ps
```
All persistent services (`postgres`, `redis`, `typesense`, `minio`, `mailpit`) should display state `healthy` or `running`. The `minio-init` container will show `Exited (0)` upon successfully initializing the default S3 bucket.

### Viewing Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f postgres
```

### Stopping the Infrastructure
```bash
# Stop containers without removing persistent data
docker compose down

# Stop containers and remove named volumes (clean slate)
docker compose down -v
```

---

## 4. Verification Endpoints

- **PostgreSQL**: Connect with `psql -h localhost -p 5432 -U cyris -d cyris`
- **Redis**: Connect with `redis-cli -h localhost -p 6379 ping` (returns `PONG`)
- **Typesense Health**: `curl http://localhost:8108/health` (returns `{"ok":true}`)
- **MinIO S3 API**: `http://localhost:9000`
- **MinIO Console**: `http://localhost:9001` (User: `cyris_minio_admin`, Password: `cyris_minio_super_secret_password`)
- **Mailpit Web UI**: `http://localhost:8025`
- **Mailpit SMTP**: `localhost:1025`
