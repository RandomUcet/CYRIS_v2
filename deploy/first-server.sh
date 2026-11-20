#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "Instalace zastavena na řádku $LINENO. Po opravě spusť stejný balíček znovu." >&2' ERR
cd "$(dirname "$0")/.."
[[ $EUID == 0 ]] || { echo "Spusť přes sudo."; exit 1; }
host=${1:?Zadej IPv4 nebo DNS jméno serveru}
[[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 2
release=$(cat RELEASE 2>/dev/null || git rev-parse HEAD)
[[ $release =~ ^[a-f0-9]{40}$ ]] || exit 2
if ip -o -4 addr show | grep -E " inet 10\.15\.69\.2/" >/dev/null; then
  echo "Toto je Spark. Vyber samostatnou VM pro CYRIS."; exit 1
fi
exec 9>/run/cyris-first-install.lock
flock -n 9 || { echo "Instalace již běží."; exit 1; }
envfile=/etc/cyris/cyris.env
marker=/etc/cyris/first-server
if [[ -e $marker ]]; then
  [[ $(cat "$marker") == "$release $host" ]] || { echo "Server byl připraven pro jinou verzi nebo adresu."; exit 1; }
elif [[ -e $envfile || -d /var/lib/cyris || -d /opt/cyris ]]; then
  echo "Nalezena existující instalace. Tento průvodce je pro nový server."
  exit 1
else
  . /etc/os-release
  [[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo "Vyžadováno Ubuntu 24.04."; exit 1; }
  install -d -m 700 /etc/cyris
  echo "$release $host" > "$marker"
fi
if [[ ! -e /etc/cyris/first-server-complete ]]; then
  bash deploy/install.sh --yes
  systemctl enable --now docker
  # Replace only installer-owned settings, preserving generated secrets across retries.
  python3 - "$envfile" "$host" "$release" <<'PY'
import json, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
settings = {"PUBLIC_WEB_URL": "https://" + sys.argv[2], "CYRIS_WEB_BIND": "127.0.0.1",
            "COMPOSE_PROFILES": "lan-https", "CYRIS_VERSION": sys.argv[3][:12]}
for service in ("api", "worker", "web"):
    settings[f"CYRIS_{service.upper()}_IMAGE"] = f"cyris-local/{service}:{sys.argv[3][:12]}"
lines = [line for line in path.read_text().splitlines() if line.split("=", 1)[0] not in settings]
tmp = path.with_suffix(".new")
with open(tmp, "w") as f:
    os.fchmod(f.fileno(), 0o600)
    print(*lines, *(f"{k}={v}" for k,v in settings.items()), sep="\n", file=f)
os.replace(tmp, path)
manifest = pathlib.Path("/opt/cyris/release-manifest.json")
metadata = json.loads(manifest.read_text())
metadata.update(version=settings["CYRIS_VERSION"], images={
    service: settings[f"CYRIS_{service.upper()}_IMAGE"] for service in ("api", "worker", "web")
})
manifest.write_text(json.dumps(metadata, indent=2) + "\n")
PY
  cat > /opt/cyris/Caddyfile <<EOF
https://$host {
    tls internal
    reverse_proxy web:3000
}
EOF
  cyrisctl config check
  for service in api worker web; do
    docker build -f "docker/$service.Dockerfile" -t "cyris-local/$service:${release:0:12}" .
  done
fi
compose=(docker compose --env-file "$envfile" -f /opt/cyris/docker-compose.yml)
"${compose[@]}" up -d postgres redis typesense minio minio-init
"${compose[@]}" run --rm -T api node dist/scripts/db-migrate.js
"${compose[@]}" run --rm -T api node dist/scripts/search-setup.js
"${compose[@]}" up -d --wait --wait-timeout 240 api worker web gateway
# The parent retains the installation lock during the final checks.
source deploy/finish-server.sh
finish_server
