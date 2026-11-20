# CYRIS local startup

## Prerequisites

- Node.js 22 or newer
- The pnpm version pinned in `package.json`
- Docker Desktop or Docker Engine with Docker Compose

## Start an empty installation

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Review `.env` for this installation. `pnpm dev` builds the internal packages,
starts PostgreSQL, Redis, Typesense, MinIO and Mailpit, waits for each service
and successful bucket initialization, applies pending migrations, and starts
the API, worker and web application. The existing database and accounts are
preserved. A normal start does not seed, delete data, reset passwords, change
exercise status, create sample participants, or configure external providers.

Open http://localhost:3000. In another terminal, create the first administrator
explicitly and enter the credentials requested by the command:

```bash
pnpm admin:create
```

There is no automatically provisioned account or shared default password.
Create the exercise through the administration UI, then optionally initialize
its team and role templates as described below. LDAP, OIDC and AI providers
are configured separately by an administrator using their real settings.

## Optional team and role templates

`pnpm seed:system` is an additive, transactional command. Without an exercise
selector it creates only a missing platform administrator role; it creates no
exercise, accounts or operational data. To initialize the seven CzechCybertron
teams and event role templates for an existing exercise:

```bash
CYRIS_SEED_EVENT_ID='<exercise-uuid>' pnpm seed:system
```

Alternatively use its slug. A missing exercise is created only when an
explicit name is supplied; a new exercise starts as `DRAFT`:

```bash
CYRIS_SEED_EVENT_SLUG='exercise-slug' \
CYRIS_SEED_EVENT_NAME='Exercise name' \
pnpm seed:system
```

Repeated runs preserve existing names, lifecycle, role permissions, team
capabilities, membership, passwords and integration settings. Customized
existing templates are not overwritten or automatically repaired. All seed
changes commit together; concurrent seed runs are serialized. No fixed year
or exercise date is inferred.

The `Exercise Organizer` template uses an explicit allowlist of `EVENT`
permissions for scenario control (including secret material and overrides),
command/DEFCON, tasks, registry, cases, evidence, laboratory correction,
forensics, medical response, court work, documents and evaluation. It also
supports exercise membership, unit and role administration. It grants no
platform administration, exercise creation, identity/provider management,
global preferences or notification administration. The template is not
assigned to anyone automatically; an administrator assigns it within the
selected exercise. Existing customized `EXCON` and organizer roles are left
unchanged on repeated bootstrap.

If a local workflow requires an additive seed at every start, explicitly set
`CYRIS_SEED_ON_START=1` in the launching environment together with the chosen
exercise selector. It remains non-destructive. Do not use the separate
`seed:demo` command with operational data; it is not part of normal startup.

## Status and shutdown

```bash
pnpm dev:status
```

The status command reports API readiness, individual container state and the
managed worker process. A running worker process alone does not prove that a
particular job or external integration succeeded. The API readiness endpoint
is http://localhost:4000/health/ready by default; `PORT` can change the API port.
The web application stays on port 3000. Mailpit is available on port 8025 and
the MinIO console on port 9001.

Press `Ctrl+C` in the `pnpm dev` terminal to stop the supervised API, worker
and web process groups. Any unexpected application exit also stops the other
applications and returns failure. Docker volumes and containers remain for
the next start. Stop infrastructure without deleting its data with:

```bash
docker compose down
```

## Verification

```bash
pnpm build
pnpm typecheck
pnpm test:run
git diff --check
```

`pnpm test` also builds the shared packages before running the discovered
regression tests. Tests requiring PostgreSQL are explicitly skipped unless
both `CYRIS_TEST_DATABASE_URL` (a local disposable database) and
`CYRIS_TEST_DATABASE_ISOLATED=true` are set. Apply all migrations to that test
database first. Remaining unimplemented checks are reported as `TODO`, never
as successful coverage. `scripts/system-bootstrap.integration.test.ts` checks
preservation of accounts, passwords, operational resources, audit, integration
configuration, exercise lifecycle and customized templates using rolled-back
fixtures.

## Troubleshooting

```bash
docker compose ps --all
docker compose logs --tail=100 postgres redis typesense minio minio-init mailpit
```

A missing or unhealthy service and an unsuccessful bucket initializer block
startup. Resolve the specific container error before retrying. When an API or
web port is already occupied, stop the previous development session first.
Do not start a second session against the same ports.

Schema changes use the checked-in migration history. A startup error is not a
reason to reset volumes or run a schema push over existing data. A command
such as `docker compose down -v` permanently deletes local volumes and is not
part of this startup or recovery procedure.
