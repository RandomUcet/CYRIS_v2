#!/usr/bin/env bash

# Shared by startup and status. Missing/stopped services must never count as healthy.
compose_service_state() {
  local service="$1" container_id
  container_id="$(docker compose ps --all --quiet "$service" 2>/dev/null)" || return 1
  [[ -n "$container_id" && "$container_id" != *$'\n'* ]] || return 1
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.ExitCode}}' "$container_id" 2>/dev/null
}

infrastructure_ready() {
  local service state
  for service in postgres redis typesense minio mailpit; do
    state="$(compose_service_state "$service")" || return 1
    [[ "$state" == 'running healthy 0' ]] || return 1
  done
  state="$(compose_service_state minio-init)" || return 1
  [[ "$state" == 'exited none 0' ]]
}
