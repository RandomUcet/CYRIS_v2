#!/usr/bin/env bash
# Run from a CYRIS git checkout on the Mac. Upload the chosen commit, never the working tree.
set -Eeuo pipefail
trap 'echo "[CYRIS/Mac] Aktualizace skončila chybou na řádku $LINENO (kód $?)." >&2' ERR
target=${1:?Zadej SSH adresu uživatel@server}
directory=${2:?Zadej DNS jméno LDAPS serveru}
ref=${3:-FETCH_HEAD}
[[ $target =~ ^[a-zA-Z_][a-zA-Z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $directory =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 2
release=$(git rev-parse --verify "$ref^{commit}")
stage=$(mktemp -d /tmp/cyris-update.XXXXXXXX)
remote=''
ssh_opts=(-o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ControlMaster=auto -o ControlPersist=120 -o "ControlPath=$stage/socket")
cleanup() {
  if [[ -n $remote ]]; then ssh "${ssh_opts[@]}" "$target" "rm -rf -- $remote" || true; fi
  ssh "${ssh_opts[@]}" -O exit "$target" 2>/dev/null || true
  rm -rf -- "$stage"
}
trap cleanup EXIT
echo "[CYRIS/Mac] Připojuji se k $target a čtu verzi instalace."
old=$(ssh "${ssh_opts[@]}" "$target" "python3 -c 'import json; print(json.load(open(\"/opt/cyris/release-manifest.json\"))[\"version\"])'")
[[ $old =~ ^[0-9a-f]{12}$ ]] || { echo "Tento postup vyžaduje lokálně sestavenou instalaci CYRIS."; exit 1; }
base=$(git rev-parse --verify "$old^{commit}")
git merge-base --is-ancestor "$base" "$release" || { echo "Cílová verze nenavazuje na instalaci."; exit 1; }
git diff --quiet "$base" "$release" -- packages/db/migrations || { echo "Tato verze vyžaduje postup s databázovou migrací."; exit 1; }
candidate=$(ssh "${ssh_opts[@]}" "$target" 'mktemp -d /tmp/cyris-update.XXXXXXXX')
[[ $candidate =~ ^/tmp/cyris-update\.[a-zA-Z0-9]+$ ]] || exit 1
remote=$candidate
echo "[CYRIS/Mac] Přenáším soubory verze ${release:0:12} na server."
git archive --format=tar.gz "$release" | ssh "${ssh_opts[@]}" "$target" "tar xzf - -C $remote"
echo "[CYRIS/Mac] Na serveru potvrď sudo heslem účtu ${target%@*} a stiskni Enter."
ssh -t "${ssh_opts[@]}" "$target" "sudo bash $remote/deploy/update-local-images.sh $release $old $directory" </dev/tty
