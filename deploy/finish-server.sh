#!/usr/bin/env bash
set -Eeuo pipefail

finish_server() {
  local release host legacy updated
  local conf=/opt/cyris/Caddyfile
  local compose=(docker compose --env-file /etc/cyris/cyris.env -f /opt/cyris/docker-compose.yml)
  read -r release host < /etc/cyris/first-server
  [[ $release =~ ^[a-f0-9]{40}$ && $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || return 1
  if [[ $host =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    legacy=$(printf 'https://%s {\n    tls internal\n    reverse_proxy web:3000\n}' "$host")
    updated=$(printf '{\n    default_sni %s\n}\n\n%s' "$host" "$legacy")
    if [[ $(cat "$conf") == "$legacy" ]]; then
      printf '%s\n' "$updated" | "${compose[@]}" exec -T gateway caddy validate --config - --adapter caddyfile
      # Keep the inode used by the running container's single-file bind mount.
      printf '%s\n' "$updated" > "$conf"
    fi
    if [[ $(cat "$conf") == "$updated" ]]; then
      "${compose[@]}" exec -T gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
    fi
  fi
  ca=/var/lib/cyris/caddy/caddy/pki/authorities/local/root.crt
  for attempt in {1..30}; do
    if [[ -s $ca ]] && curl -fsS --noproxy "*" --cacert "$ca" --resolve "$host:443:127.0.0.1" --max-time 5 "https://$host/" >/dev/null &&
      curl -fsS --noproxy "*" --cacert "$ca" --resolve "$host:443:127.0.0.1" --max-time 5 "https://$host/api/health/ready" >/dev/null; then break; fi
    if [[ $attempt == 30 ]]; then echo "HTTPS nebo API není připravené." >&2; "${compose[@]}" logs --tail 20 gateway >&2; return 1; fi
    sleep 2
  done
  install -m 644 "$ca" /opt/cyris/CYRIS-root.crt
  if [[ ! -e /etc/cyris/first-server-complete ]]; then
    read -rp 'E-mail prvního správce CYRIS: ' CYRIS_ADMIN_EMAIL
    read -rp 'Jméno správce: ' CYRIS_ADMIN_NAME
    read -rsp 'Nové heslo CYRIS (alespoň 8 znaků): ' CYRIS_ADMIN_PASSWORD; echo
    read -rsp 'Zopakuj heslo: ' confirmation; echo
    [[ -n $CYRIS_ADMIN_NAME && $CYRIS_ADMIN_PASSWORD == "$confirmation" && ${#CYRIS_ADMIN_PASSWORD} -ge 8 ]] || { echo "Zkontroluj jméno a heslo."; exit 1; }
    export CYRIS_ADMIN_EMAIL CYRIS_ADMIN_NAME CYRIS_ADMIN_PASSWORD
    "${compose[@]}" run --rm -T -e CYRIS_ADMIN_EMAIL -e CYRIS_ADMIN_NAME -e CYRIS_ADMIN_PASSWORD api node dist/scripts/create-admin.js
    unset CYRIS_ADMIN_PASSWORD confirmation
    touch /etc/cyris/first-server-complete
  fi
  echo "CYRIS je dostupný na https://$host/login"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  [[ $EUID == 0 ]] || { echo "Spusť přes sudo."; exit 1; }
  exec 9>/run/cyris-first-install.lock
  flock -n 9 || { echo "Instalace již běží."; exit 1; }
  finish_server
fi
