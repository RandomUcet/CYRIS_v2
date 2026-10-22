# Gemini deployment handoff

## Mission

Build a production-grade CYRIS deployment and operations layer for Ubuntu
Server 24.04 LTS.

## Source / distribution

- GitHub repository
- GitHub Releases
- Future GitHub Container Registry versioned images

## Target first install

On a fresh Ubuntu Server 24.04 LTS:

```bash
git clone <repository>
cd CYRIS
sudo ./deploy/install.sh
sudo cyrisctl deploy
sudo cyrisctl doctor --full
```

Exact commands may evolve.

## Target operations

```text
cyrisctl deploy
cyrisctl status
cyrisctl doctor
cyrisctl doctor --full
cyrisctl start
cyrisctl stop
cyrisctl restart
cyrisctl logs
cyrisctl backup
cyrisctl backup verify
cyrisctl restore
cyrisctl update
cyrisctl update --version
cyrisctl versions
cyrisctl self-update
cyrisctl diagnostics
cyrisctl config check
cyrisctl db status
cyrisctl db migrate
cyrisctl admin create
```

## Target filesystem

```text
/opt/cyris
/etc/cyris
/var/lib/cyris
/var/backups/cyris
```

## Core requirements

- Idempotent installation.
- Production must not run from a development checkout.
- Immutable, versioned application images.
- No production secrets committed to Git.
- Automatic migrations and readiness checks.
- A real end-to-end smoke test.
- Verified pre-update backup.
- PostgreSQL, MinIO, and configuration backups.
- Typesense must be rebuildable.
- Treat Redis as transient where appropriate.
- Safe update process with compatibility/release manifest.
- Do not pretend every database migration is reversible.
- Recovery from a verified backup when necessary.
- Acceptance test on a clean Ubuntu 24.04 VM.

## Important environment note

DGX Spark may be unavailable when CYLAB VPN is disabled. Production deployment
must not fail merely because optional AI infrastructure is temporarily
unreachable.

## Application P1 backlog

- Visually verify MY TEAM / MY SUBTEAM using a real non-admin operational
  account.
- Replace remaining raw UUID-oriented advanced inputs with human-readable
  selectors where appropriate:
  - Court
  - Lab
  - Forensics
  - Evidence
  - Relationships
- No current P0 product defect is known.
- Current `pnpm typecheck`, `pnpm build`, and `git diff --check` pass.
