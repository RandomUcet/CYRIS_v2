#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
read -rp 'SSH na nový server CYRIS (uživatel@IPv4 nebo uživatel@DNS): ' target
[[ $target =~ ^[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "Zkontroluj formát SSH adresy."; exit 1; }
host=${target#*@}
[[ $host != 10.15.69.2 && $host != spark-cylab ]] || { echo "Zadej adresu nové VM pro CYRIS."; exit 1; }
remote=$(ssh "$target" 'mktemp -d /tmp/cyris-install.XXXXXXXX')
[[ $remote =~ ^/tmp/cyris-install\.[a-zA-Z0-9]+$ ]] || exit 1
trap 'ssh "$target" "rm -rf -- $remote" || true' EXIT
ssh "$target" "tar -xzf - -C $remote" < CYRIS-source.tar.gz
ssh -t "$target" "sudo bash $remote/deploy/first-server.sh $host"
scp "$target:/opt/cyris/CYRIS-root.crt" "CYRIS-$host.crt"
echo "Certifikát pro klienty: $PWD/CYRIS-$host.crt"
