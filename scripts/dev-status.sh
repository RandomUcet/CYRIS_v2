#!/usr/bin/env bash

set -u

printf 'CYRIS Development Status\n\n'

check_http() {
  local label="$1"
  local url="$2"
  if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    printf '%-16s OK    %s\n' "$label" "$url"
  else
    printf '%-16s DOWN  %s\n' "$label" "$url"
  fi
}

check_compose() {
  local service="$1"
  local label="$2"
  local health
  health="$(docker compose ps --status running --format '{{.Service}} {{.Health}}' 2>/dev/null |
    awk -v service="$service" '$1 == service {print $2}')"
  if [[ "$health" == "healthy" ]]; then
    printf '%-16s OK\n' "$label"
  else
    printf '%-16s DOWN  (%s)\n' "$label" "${health:-not running}"
  fi
}

check_http "Web" "http://localhost:3000/"
check_http "API" "http://localhost:4000/health"
check_compose "postgres" "PostgreSQL"
check_compose "redis" "Redis"
check_compose "typesense" "Typesense"
check_compose "minio" "MinIO"

worker_pid=""
if [[ -f .cyris-dev-pids ]]; then
  while read -r role pid; do
    if [[ "$role" == "worker" ]] && kill -0 "$pid" 2>/dev/null; then
      worker_pid="$pid"
    fi
  done < .cyris-dev-pids
fi
if [[ -n "$worker_pid" ]]; then
  printf '%-16s OK    managed process PID %s\n' "Worker" "$worker_pid"
else
  printf '%-16s UNKNOWN process is not managed by pnpm dev\n' "Worker"
fi
