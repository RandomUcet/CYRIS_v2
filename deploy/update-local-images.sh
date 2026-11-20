#!/usr/bin/env bash
# Upgrade a first-server installation in place when the DB schema is unchanged.
set -Eeuo pipefail
step='ověření instalace'
trap 'echo "[CYRIS] Krok «$step» selhal na řádku $LINENO (kód $?)." >&2' ERR
echo "[CYRIS] Sudo potvrzeno. Kontroluji instalaci a zámek."
cd "$(dirname "$0")/.."
release=${1:?}
old=${2:?}
directory=${3:?}
[[ $EUID == 0 && $release =~ ^[a-f0-9]{40}$ && $old =~ ^[a-f0-9]{12}$ && $directory =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "[CYRIS] Neplatné parametry nebo oprávnění aktualizátoru." >&2; exit 2; }
envfile=/etc/cyris/cyris.env
manifest=/opt/cyris/release-manifest.json
cfg=/opt/cyris/docker-compose.yml
tag=${release:0:12}
[[ -f /etc/cyris/first-server-complete ]] || { echo "Dokonči první instalaci."; exit 1; }
exec 9>/run/cyris-first-install.lock
flock -n 9 || { echo "Probíhá jiná změna instalace."; exit 1; }
grep -Fxq "CYRIS_VERSION=$old" "$envfile" || { echo "Verze serveru se změnila. Spusť aktualizaci znovu."; exit 1; }
read -r _ host < /etc/cyris/first-server
[[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "[CYRIS] Neplatná adresa instalace v /etc/cyris/first-server." >&2; exit 2; }
services=(api worker web)
for svc in "${services[@]}"; do
  step="kontrola původního obrazu $svc"
  echo "[CYRIS] Ověřuji cyris-local/$svc:$old."
  grep -Fxq "CYRIS_${svc^^}_IMAGE=cyris-local/$svc:$old" "$envfile" || {
    echo "[CYRIS] CYRIS_${svc^^}_IMAGE neodpovídá očekávanému obrazu cyris-local/$svc:$old." >&2
    exit 1
  }
  docker image inspect "cyris-local/$svc:$old" >/dev/null
done
compose=(docker compose -f "$cfg")
check_https() {
  local route
  for route in /login /api/health/ready; do
    curl -fsS --noproxy '*' --cacert /opt/cyris/CYRIS-root.crt --resolve "$host:443:127.0.0.1" \
      --retry 8 --retry-all-errors --retry-delay 2 --max-time 5 "https://$host$route" -o /dev/null || return 1
  done
}
if [[ $old == "$tag" ]]; then check_https; echo "Verze $tag je nasazená."; exit 0; fi
step="příprava konfigurace pro $tag"
echo "[CYRIS] $step"
umask 077
stage=$(mktemp -d /etc/cyris/.update.XXXXXXXX)
manifest_tmp=$(mktemp /opt/cyris/.manifest.XXXXXXXX)
trap 'rm -rf -- "$stage"; rm -f -- "$manifest_tmp"' EXIT
cp -p "$envfile" "$stage/previous.env"
cp -p "$manifest" "$stage/previous.json"
python3 - "$envfile" "$manifest" "$tag" "$stage/next.env" "$manifest_tmp" <<'PY'
import json, pathlib, sys
env, manifest, version, staged_env, staged_manifest = sys.argv[1:]
images = {s: f"cyris-local/{s}:{version}" for s in ("api", "worker", "web")}
updates = {"CYRIS_VERSION": version, **{f"CYRIS_{s.upper()}_IMAGE": image for s, image in images.items()}}
lines = pathlib.Path(env).read_text().splitlines(keepends=True)
for i, line in enumerate(lines):
    key = line.partition("=")[0]
    if key in updates:
        lines[i] = f"{key}={updates[key]}\n"
pathlib.Path(staged_env).write_text("".join(lines))
metadata = json.loads(pathlib.Path(manifest).read_text())
metadata.update(version=version, images=images)
pathlib.Path(staged_manifest).write_text(json.dumps(metadata, indent=2) + "\n")
PY
chmod --reference="$manifest" "$manifest_tmp"
"${compose[@]}" --env-file "$stage/next.env" config --quiet
for svc in "${services[@]}"; do
  step="sestavení $svc"
  echo "[CYRIS] Sestavuji $svc pro verzi $tag."
  BUILDKIT_PROGRESS=plain docker build -f "docker/$svc.Dockerfile" -t "cyris-local/$svc:$tag" .
done
step="kontrola LDAPS"
echo "[CYRIS] Ověřuji LDAPS na $directory z nového API."
# Use the new API image with the installed DNS, CA volume and environment before switching.
"${compose[@]}" --env-file "$stage/next.env" run --rm --no-deps -T api node -e '
const tls = require("node:tls");
const host = process.argv[1];
const socket = tls.connect({host, servername: host, port: 636, rejectUnauthorized: true});
socket.setTimeout(8000, () => socket.destroy(new Error("LDAPS timeout")));
socket.on("error", e => { console.error(e.message); process.exitCode = 1; });
socket.once("secureConnect", () => { console.log("LDAPS OK:", host); socket.destroy(); });' "$directory"
activate() {
  "${compose[@]}" --env-file "$envfile" up -d --no-deps --wait --wait-timeout 240 "${services[@]}"
}
rollback() {
  trap - ERR INT TERM HUP
  echo "[CYRIS] Přerušení při kroku «$step»." >&2
  echo "Vracím obrazy na verzi $old." >&2
  mv -f "$stage/previous.env" "$envfile"
  install -m "$(stat -c %a "$manifest")" "$stage/previous.json" "$manifest_tmp"
  mv -f "$manifest_tmp" "$manifest"
  activate && check_https || echo "Ověř stav pomocí sudo cyrisctl status." >&2
  exit 1
}
step="spuštění aplikačních služeb"
echo "[CYRIS] Přepínám služby na $tag."
trap rollback ERR INT TERM HUP
mv -f "$stage/next.env" "$envfile"
activate
step="ověření HTTPS a připravenosti API"
echo "[CYRIS] $step"
check_https
step="uložení verze instalace"
mv -f "$manifest_tmp" "$manifest"
trap - ERR INT TERM HUP
echo "CYRIS $tag je připravený na https://$host/admin/users"
