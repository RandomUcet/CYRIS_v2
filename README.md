# CYRIS

Cybertron Registry & Intelligence System

CYRIS is an operational information and exercise-management platform for
Czech Cybertron / CYLAB.

## Stack

- Next.js
- NestJS
- PostgreSQL
- Redis / BullMQ
- Typesense
- MinIO
- pnpm workspaces

## Running CYRIS locally

The supported local workflow is documented in
[docs/STARTUP.md](./docs/STARTUP.md).

Quick start:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Then open http://localhost:3000. The launcher starts PostgreSQL, Redis,
Typesense, MinIO, Mailpit, the API, the worker, and the Next.js web
application. Use `pnpm dev:status` to check the live services.

For prerequisites, migrations, seeding, shutdown, reset, troubleshooting, and
service URLs, read [docs/STARTUP.md](./docs/STARTUP.md).

## Development checks

```bash
pnpm typecheck
pnpm build
git diff --check
```
