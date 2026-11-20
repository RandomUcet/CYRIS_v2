#!/usr/bin/env bash
# Enable a trusted directory CA for the first-server deployment.
set -euo pipefail
[[ $EUID == 0 ]] || { echo "Spusť přes sudo."; exit 1; }
cert=${1:?Zadej veřejný certifikát CA v PEM}
host=${2:?Zadej DNS jméno LDAP serveru}
port=${3:-636}
[[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $port =~ ^[0-9]{1,5}$ ]] || exit 2
cfg=/opt/cyris/docker-compose.yml
envfile=/etc/cyris/cyris.env
template="$(dirname "$0")/compose.prod.yml"
exec 9>/run/cyris-first-install.lock
flock -n 9 || { echo "Probíhá jiná změna instalace."; exit 1; }
# Migrate precisely the shipped definition; preserve site-specific edits.
if ! cmp -s "$cfg" "$template" && [[ $(sha256sum "$cfg" | cut -d' ' -f1) != 6cdb18d75ad622581b5a8677dde63438c57eb0b538f964e8975d4f5602ffe470 ]]; then
  echo "Compose má vlastní úpravy. Přidej do služby api mount a nastavení CA podle compose.prod.yml."; exit 1
fi
umask 077
stage=$(mktemp -d /etc/cyris/.ca-stage.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
openssl x509 -in "$cert" -out "$stage/ca.pem"
openssl x509 -in "$stage/ca.pem" -checkend 0 -noout
openssl x509 -in "$stage/ca.pem" -ext basicConstraints -noout | grep -q 'CA:TRUE'
probe='
const tls = require("node:tls");
const fs = require("node:fs");
const [host, port, source] = process.argv.slice(1);
const s = tls.connect({host, port: Number(port), servername: host, rejectUnauthorized: true,
  ...(source === "stdin" ? {ca:fs.readFileSync(0)} : {})});
s.setTimeout(5000, () => s.destroy(new Error("Timeout")));
s.once("error", e => {console.error("LDAPS:", e.code || "", e.message); process.exitCode = 1});
s.once("secureConnect", () => {console.log("LDAPS OK:", host, s.remoteAddress); s.destroy()});'
docker exec -i cyris-api node -e "$probe" "$host" "$port" stdin < "$stage/ca.pem"
# Content-addressed file: installing a new CA cannot overwrite the old one.
digest=$(sha256sum "$stage/ca.pem" | cut -d' ' -f1)
install -d -m 755 /etc/cyris/api-ca
install -m 644 "$stage/ca.pem" "/etc/cyris/api-ca/$digest.pem"
cp -p "$envfile" "$stage/old.env"
cp -p "$cfg" "$stage/old.yml"
sed '/^CYRIS_API_EXTRA_CA_CERTS=/d' "$envfile" > "$stage/new.env"
printf '\nCYRIS_API_EXTRA_CA_CERTS=/run/cyris-ca/%s.pem\n' "$digest" >> "$stage/new.env"
docker compose --env-file "$stage/new.env" -f "$template" config --quiet
compose=(docker compose --env-file "$envfile" -f "$cfg")
restart_api() { "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 api; }
rollback() {
  trap - ERR
  cp -p "$stage/old.env" "$envfile"
  cp -p "$stage/old.yml" "$cfg"
  restart_api || echo "Zkontroluj sudo cyrisctl status." >&2
  exit 1
}
trap rollback ERR
install -m 644 "$template" "$cfg"
install -m 600 "$stage/new.env" "$envfile"
restart_api
docker exec cyris-api node -e "$probe" "$host" "$port"
trap - ERR
