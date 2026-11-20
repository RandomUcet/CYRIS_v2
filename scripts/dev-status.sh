#!/usr/bin/env bash
set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/dev-runtime.sh"

printf 'CYRIS Development Status\n\n'
api_port="$(node --input-type=module -e "import {loadConfig} from './packages/config/dist/index.js'; process.stdout.write(String(loadConfig().PORT))" 2>/dev/null)" || api_port=4000
[[ "$api_port" =~ ^[0-9]+$ ]] || api_port=4000
check_http() {
  local label="$1" url="$2"
  if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    printf '%-16s READY %s\n' "$label" "$url"
  else
    printf '%-16s DOWN  %s\n' "$label" "$url"
  fi
}
check_http 'Web' 'http://127.0.0.1:3000/'
check_http 'API readiness' "http://127.0.0.1:$api_port/health/ready"
for service in postgres redis typesense minio mailpit minio-init; do
  state="$(compose_service_state "$service")" || state='not available'
  printf '%-16s %s\n' "$service" "$state"
done
worker_pid=''
if [[ -f .cyris-dev-pids ]]; then
  while read -r role pid; do
    if [[ "$role" == 'worker' && "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then worker_pid="$pid"; fi
  done < .cyris-dev-pids
fi
if [[ -n "$worker_pid" ]]; then
  printf '%-16s RUNNING PID %s (process check; job execution is not verified here)\n' 'Worker' "$worker_pid"
else
  printf '%-16s UNKNOWN no live managed process\n' 'Worker'
fi
