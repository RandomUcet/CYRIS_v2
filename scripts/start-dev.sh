#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHILD_PIDS=()
PID_FILE="$ROOT_DIR/.cyris-dev-pids"

log() {
  printf '\n[CYRIS] %s\n' "$1"
}

fail() {
  printf '\n[CYRIS] ERROR: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  trap - INT TERM EXIT
  if ((${#CHILD_PIDS[@]} > 0)); then
    log "Stopping API, worker, and web processes..."
    kill "${CHILD_PIDS[@]}" 2>/dev/null || true
    wait "${CHILD_PIDS[@]}" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

trap cleanup INT TERM EXIT

command -v pnpm >/dev/null 2>&1 || fail "pnpm is required. Install pnpm 12 or run corepack enable."
command -v docker >/dev/null 2>&1 || fail "Docker is required and must be available on PATH."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is required."

for port in 3000 4000; do
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $port is already in use. Stop the existing CYRIS process before running pnpm dev again."
  fi
done

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
fi

log "Starting PostgreSQL, Redis, Typesense, MinIO, Mailpit, and bucket initialization..."
docker compose up -d postgres redis typesense minio mailpit minio-init

log "Waiting for infrastructure health checks..."
for attempt in {1..30}; do
  if docker compose ps --status running --format '{{.Service}} {{.Health}}' |
    awk '$1 != "minio-init" && $2 != "healthy" {bad=1} END {exit bad}'; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    docker compose ps
    fail "Infrastructure did not become healthy within 150 seconds."
  fi
  sleep 5
done

log "Applying database migrations..."
pnpm db:migrate

if [[ "${CYRIS_SEED_ON_START:-1}" == "1" ]]; then
  log "Seeding the canonical local baseline..."
  pnpm seed:system
fi

log "Starting API..."
pnpm dev:api &
CHILD_PIDS+=("$!")

log "Starting worker..."
pnpm dev:worker &
CHILD_PIDS+=("$!")

log "Starting web..."
pnpm dev:web &
CHILD_PIDS+=("$!")
{
  printf 'api %s\n' "${CHILD_PIDS[0]}"
  printf 'worker %s\n' "${CHILD_PIDS[1]}"
  printf 'web %s\n' "${CHILD_PIDS[2]}"
} > "$PID_FILE"

log "Waiting for API and web..."
for attempt in {1..30}; do
  api_ok=0
  web_ok=0
  curl -fsS http://localhost:4000/health >/dev/null 2>&1 && api_ok=1 || true
  curl -fsS http://localhost:3000/ >/dev/null 2>&1 && web_ok=1 || true
  if [[ "$api_ok" -eq 1 && "$web_ok" -eq 1 ]]; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    fail "API or web did not become reachable. Check the process output above."
  fi
  sleep 2
done

log "CYRIS development environment is ready."
printf '  Web:       http://localhost:3000\n'
printf '  API:       http://localhost:4000\n'
printf '  API health:http://localhost:4000/health/ready\n'
printf '  Mailpit:   http://localhost:8025\n'
printf '  MinIO:     http://localhost:9001\n'
printf '  Stop:      press Ctrl+C\n'

while true; do
  for pid in "${CHILD_PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      status=$?
      if [[ "$status" -ne 0 ]]; then
        fail "A CYRIS application process exited with status $status."
      fi
      exit 0
    fi
  done
  sleep 2
done
