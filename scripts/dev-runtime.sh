#!/usr/bin/env bash

# Probe in a subshell so a failed dynamic loader cannot abort the launcher or leave a core file.
node_can_start() (
  ulimit -c 0
  "$1" --version || exit 1
) >/dev/null 2>&1

use_dev_node() {
  if node_can_start node; then return 0; fi

  if [[ "$(uname -s)" == Darwin ]] && command -v brew >/dev/null 2>&1; then
    local prefix
    if prefix="$(brew --prefix node@22 2>/dev/null)" && [[ -n "$prefix" && -x "$prefix/bin/node" ]]; then
      if node_can_start "$prefix/bin/node"; then
        export PATH="$prefix/bin:$PATH"
        return 0
      fi
      echo '[CYRIS] Homebrew Node.js 22 could not start. Repair it with: brew reinstall node@22' >&2
    else
      echo '[CYRIS] Node.js could not start. Install a working runtime with: brew install node@22' >&2
    fi
  else
    echo '[CYRIS] Node.js could not start. Make Node.js 22 available on PATH.' >&2
  fi
  return 1
}

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
