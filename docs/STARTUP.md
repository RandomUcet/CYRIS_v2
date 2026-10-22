# CYRIS local startup

## Prerequisites

- Node.js 22 or newer
- pnpm 12 (`corepack enable` is recommended)
- Docker Desktop or Docker Engine with Docker Compose

## First setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts the Docker infrastructure, applies migrations, seeds the
canonical local baseline, and starts the API, worker, and web application.
The seed step is local-development-only and removes temporary synthetic users
and operational QA records. Legitimate administrator-managed integrations are
preserved. If the documented local Spark provider is absent, the seed creates
it once with its non-secret endpoint configuration; it never overwrites an
existing provider. Set `CYRIS_SEED_ON_START=0` if you need to preserve local
operational data between restarts.

Open:

- Web/login: http://localhost:3000
- API: http://localhost:4000
- API readiness: http://localhost:4000/health/ready
- Mailpit: http://localhost:8025
- MinIO console: http://localhost:9001

The canonical local administrator is `admin@cyris.local`. The default seed
password is `AdminPassword123!`; change it for any non-local environment.

## Status and shutdown

In another terminal:

```bash
pnpm dev:status
```

Stop the complete development process with `Ctrl+C` in the terminal running
`pnpm dev`. The script terminates the API, worker, and web children. Docker
containers remain available for faster restarts.

To stop infrastructure too:

```bash
docker compose down
```

## Reset local development data

The normal `pnpm dev` seed restores the canonical application baseline. For a
full infrastructure reset, including Docker volumes:

```bash
docker compose down -v
pnpm dev
```

This permanently removes local PostgreSQL, Redis, Typesense, and MinIO data.

## Troubleshooting

Check all service state with:

```bash
pnpm dev:status
docker compose ps
```

If ports `3000`, `4000`, `5432`, `6379`, `8108`, `9000`, `9001`, `1025`, or
`8025` are occupied, stop the owning process or change the local port mapping
and corresponding environment values before starting again. Do not run a
second `pnpm dev` while one is already active.

Application logs are printed in the `pnpm dev` terminal. Docker logs are
available with:

```bash
docker compose logs -f postgres redis typesense minio mailpit
```
