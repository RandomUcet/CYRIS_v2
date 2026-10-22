# CYRIS v2 — Application Foundation Guide

This document describes the application architecture, monorepo structure, and technical foundation established in **STEP 2/8**.

---

## 1. Monorepo Structure

CYRIS v2 is organized as a modular monolith managed with `pnpm` workspaces:

```
CYRIS_v2/
├── apps/
│   ├── api/          # NestJS backend API with Fastify adapter
│   ├── web/          # Next.js frontend web application
│   └── worker/       # Standalone NestJS background worker runtime
│
├── packages/
│   ├── config/       # Strongly typed Zod environment validation & secret masking
│   ├── contracts/    # Shared API contracts, DTOs & response schemas
│   ├── db/           # Drizzle ORM client, connection pool & pgvector types
│   └── shared/       # Domain-agnostic errors, utilities & result types
│
├── docker/
│   └── postgres/     # PostgreSQL init scripts (pgvector extension)
│
├── docs/
│   └── v2/           # Architecture & operational documentation
│
├── compose.yml       # Production-shaped local Docker infrastructure
├── .env.example      # Environment variable template
└── pnpm-workspace.yaml
```

---

## 2. Responsibilities of Applications & Packages

### Applications (`apps/`)

- **`api` (`@cyris/api`)**:
  - Modular NestJS backend running on the Fastify adapter (`@nestjs/platform-fastify`).
  - Provides REST endpoints, request validation, authentication, and service orchestration.
  - Hosts infrastructure modules: `ConfigModule`, `DatabaseModule`, `StorageModule`, `SearchModule`, `QueueModule`, `MailModule`, and `HealthModule`.
  - Exposes `/health` (liveness) and `/health/ready` (system readiness verifying Postgres, Redis, Typesense, S3).
- **`web` (`@cyris/web`)**:
  - Next.js web application (React 18 / Next 14 App Router).
  - Communicates with the backend strictly via the API client boundary (`@/lib/api-client.ts`), never querying PostgreSQL or internal databases directly.
- **`worker` (`@cyris/worker`)**:
  - Dedicated standalone Node/NestJS process.
  - Connects to PostgreSQL and Redis to host BullMQ queue processors for background tasks (indexing pipelines, file processing, AI jobs, and scheduled LDAP sync).

### Packages (`packages/`)

- **`@cyris/config`**:
  - Parses and validates environment variables at startup using Zod schemas.
  - Ensures secret values (`POSTGRES_PASSWORD`, `S3_SECRET_KEY`, `TYPESENSE_API_KEY`, `CYRIS_MASTER_KEY`) are never exposed or logged.
- **`@cyris/contracts`**:
  - Framework-agnostic TypeScript types and Zod schemas shared between the API and frontend.
  - Maintains API contract integrity without coupling the backend exclusively to frontend-only RPC or server actions.
- **`@cyris/db`**:
  - Drizzle ORM database client with pooled `postgres` driver.
  - Configured with pgvector support (`vector` custom type) for vector search embeddings.
  - Migrations directory managed via `drizzle-kit`.
- **`@cyris/shared`**:
  - Base application error hierarchy (`BaseAppError`, `NotFoundError`, `ValidationError`, `InfrastructureError`).

---

## 3. Dependency Direction & Core Architectural Rules

> **CRITICAL RULE**:
> **Domain modules may depend on infrastructure abstractions, but infrastructure must not contain CYRIS business logic.**

```
┌──────────────┐         ┌──────────────┐
│   apps/web   │         │ apps/worker  │
└──────┬───────┘         └──────┬───────┘
       │ HTTP                   │
       ▼                        ▼
┌──────────────┐         ┌──────────────┐
│   apps/api   │────────▶│ packages/db  │
└──────┬───────┘         └──────┬───────┘
       │                        │
       ├───────────────┬────────┘
       ▼               ▼
┌──────────────┐ ┌──────────────┐
│ packages/    │ │ packages/    │
│ contracts    │ │ config       │
└──────────────┘ └──────────────┘
```

### Inviolable Architecture Rules
1. **Web never talks directly to PostgreSQL**: The frontend talks solely to the API layer via typed contracts.
2. **PostgreSQL is the source of truth**: All authoritative relational records, audit logs, and vector embeddings reside here.
3. **Typesense is derived state**: Typesense indexes can be wiped and re-indexed from PostgreSQL at any time.
4. **S3 contains binary objects; PostgreSQL contains metadata**: Evidence files, laboratory scans, and generated PDFs are stored in S3; checksums, access policies, and metadata live in PostgreSQL.
5. **Worker handles asynchronous/background processing**: Long-running jobs must not block API request loops.
6. **Redis is not persistent business state**: Redis is reserved for BullMQ queues, ephemeral cache, and rate-limiting.
7. **DGX Spark will never receive database credentials**: Compute workloads and AI models on DGX Spark connect strictly via the AI Gateway / Provider abstraction.
8. **Secrets must not be committed or logged**: All sensitive parameters are masked in configuration output.
9. **Avoid global singleton spaghetti**: Services use dependency injection and explicit lifecycle hooks.
10. **Do not introduce abstractions without a concrete reason**: Modular monolith over premature microservices.

---

## 4. Development Commands

```bash
# Install dependencies across all packages and apps
pnpm install

# Start local Docker infrastructure (Postgres, Redis, Typesense, MinIO, Mailpit)
docker compose up -d

# Run all applications concurrently in development mode (API, Worker, Web)
pnpm dev

# Run individual applications
pnpm dev:api       # NestJS Fastify API (http://localhost:4000)
pnpm dev:worker    # Standalone BullMQ Worker runtime
pnpm dev:web       # Next.js Frontend (http://localhost:3000)

# Build all packages and applications for production
pnpm build

# Run typechecking across the entire monorepo
pnpm typecheck
```

---

## 5. Health Endpoints

- **`GET http://localhost:4000/health`**:
  Basic liveness probe returning application status, version, and uptime.
- **`GET http://localhost:4000/health/ready`**:
  Deep readiness probe confirming active connectivity to:
  - PostgreSQL (`SELECT 1`)
  - Redis (`PING`)
  - Typesense (`/health`)
  - MinIO / S3 (`HeadBucket`)
