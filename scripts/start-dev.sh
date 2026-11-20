#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/dev-runtime.sh"

log() { printf '\n[CYRIS] %s\n' "$1"; }
fail() { printf '\n[CYRIS] ERROR: %s\n' "$1" >&2; exit 1; }

command -v pnpm >/dev/null 2>&1 || fail "pnpm is required. Install the version in package.json."
command -v docker >/dev/null 2>&1 || fail "Docker is required and must be available on PATH."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is required."

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
fi

log "Building shared packages required by migrations, API, worker, and web..."
pnpm build:packages

log "Starting persistent infrastructure..."
docker compose up -d postgres redis typesense minio mailpit minio-init

log "Waiting for every infrastructure service and successful bucket initialization..."
for attempt in {1..30}; do
  if infrastructure_ready; then break; fi
  if [[ "$attempt" -eq 30 ]]; then
    docker compose ps --all
    fail "Infrastructure did not become ready. Check container health and minio-init logs."
  fi
  sleep 5
done

log "Applying database migrations..."
pnpm db:migrate

if [[ "${CYRIS_SEED_ON_START:-0}" == "1" ]]; then
  log "Adding missing system templates for the explicitly selected exercise..."
  pnpm seed:system
fi

log "Starting application processes. Existing exercise data and accounts are preserved."
exec node scripts/dev-apps.mjs
