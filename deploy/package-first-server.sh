#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
destination=${1:?Zadej absolutní cestu k výstupnímu ZIP}
[[ $destination = /* ]] || exit 2
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
release=$(git rev-parse HEAD)
mkdir "$stage/src" "$stage/CYRIS-server"
git archive "$release" | tar xf - -C "$stage/src"
echo "$release" > "$stage/src/RELEASE"
out=$stage/CYRIS-server
tar czf "$out/CYRIS-source.tar.gz" -C "$stage/src" .
cp "$stage/src/deploy/install-from-mac.command" "$out/Instalovat.command"
cp "$stage/src/deploy/Prvni-server.md" "$out/Navod.txt"
cp "$stage/src/docs/prirucka-spravce.md" "$out/Prirucka-spravce.txt"
(cd "$stage" && zip -qr CYRIS-server.zip CYRIS-server)
mv "$stage/CYRIS-server.zip" "$destination"
