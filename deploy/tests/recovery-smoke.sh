#!/usr/bin/env bash
# Disposable integration exercise on the CI runner.
set -Eeuo pipefail
[[ $EUID == 0 && ${GITHUB_ACTIONS:-} == true ]] || exit 2
cd "$(dirname "$0")/../.."
stage=$(mktemp -d)
export CYRIS_ETC_DIR="$stage/etc" CYRIS_OPT_DIR="$stage/opt" CYRIS_VAR_DIR="$stage/data" CYRIS_BACKUPS_DIR="$stage/backups"
export COMPOSE_PROJECT_NAME="recovery-${GITHUB_RUN_ID:-$$}"
mkdir -p "$CYRIS_ETC_DIR" "$CYRIS_OPT_DIR/docker/postgres" "$CYRIS_VAR_DIR"
cp deploy/cyris.env.template "$CYRIS_ETC_DIR/cyris.env"
chmod 600 "$CYRIS_ETC_DIR/cyris.env"
cp docker/postgres/01-init-pgvector.sql "$CYRIS_OPT_DIR/docker/postgres/"
cp deploy/release-manifest.json "$CYRIS_OPT_DIR/"
sed -e "s|/var/lib/cyris/|$CYRIS_VAR_DIR/|g" -e "s|/opt/cyris/|$CYRIS_OPT_DIR/|g" -e "s|/etc/cyris/|$CYRIS_ETC_DIR/|g" -e '/^    container_name:/d' deploy/compose.prod.yml > "$CYRIS_OPT_DIR/docker-compose.yml"
compose=(docker compose -f "$CYRIS_OPT_DIR/docker-compose.yml" --env-file "$CYRIS_ETC_DIR/cyris.env")
trap '"${compose[@]}" down --remove-orphans && rm -rf -- "$stage"' EXIT
"${compose[@]}" up -d --wait --wait-timeout 180 postgres redis typesense minio
"${compose[@]}" run --rm --no-deps -T minio-init
sql() { "${compose[@]}" exec -T postgres psql -U cyris -d cyris -Atq -v ON_ERROR_STOP=1 -c "$1"; }
object() {
  "${compose[@]}" run --rm --no-deps -T --entrypoint /bin/sh minio-init -ec '
    mc alias set probe http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
    mc "$1" "probe/$S3_AUDIT_BUCKET/recovery-check"
  ' sh "$1"
}
sql "create table recovery_check(value text); insert into recovery_check values ('before')"
echo before | object pipe
"${compose[@]}" exec -T redis redis-cli set recovery-check before
deploy/cyrisctl backup
deploy/cyrisctl backup verify
sql "update recovery_check set value='after'"
echo after | object pipe
"${compose[@]}" exec -T redis redis-cli set recovery-check after
archive=("$CYRIS_BACKUPS_DIR"/backup_*.tar.gz.gpg)
deploy/cyrisctl restore "${archive[0]}" --force
[[ $(sql "select value from recovery_check") == before ]]
[[ $(object cat) == before ]]
[[ $("${compose[@]}" exec -T redis redis-cli get recovery-check) == before ]]
