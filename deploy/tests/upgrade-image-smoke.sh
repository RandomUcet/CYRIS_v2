#!/usr/bin/env bash
# CI-only real published-image upgrade and encrypted rollback rehearsal.
set -Eeuo pipefail
[[ $EUID == 0 && ${GITHUB_ACTIONS:-} == true ]] || exit 2
cd "$(dirname "$0")/../.."
baseline="${1:-}"
case "$baseline" in
  2.4.22) checksum=2e9832419cdfc5a33d09c79bbbf749bdd212f228135840140685ec0a059311a8; count=35 ;;
  2.5.1) checksum=f4ed8dc43c40a3d72e020b24348a68ba545246a0aaa7b44edc1cc290722abbd4; count=42 ;;
  *) exit 2 ;;
esac
stage=$(mktemp -d)
export CYRIS_ETC_DIR="$stage/etc" CYRIS_OPT_DIR="$stage/opt" CYRIS_VAR_DIR="$stage/data" CYRIS_BACKUPS_DIR="$stage/backups"
export COMPOSE_PROJECT_NAME="upgrade-${GITHUB_RUN_ID:-$$}-${baseline//./-}"
mkdir -p "$CYRIS_ETC_DIR/api-ca" "$CYRIS_OPT_DIR/docker/postgres" "$CYRIS_VAR_DIR"
cp deploy/cyris.env.template "$CYRIS_ETC_DIR/cyris.env"
chmod 600 "$CYRIS_ETC_DIR/cyris.env"
cp docker/postgres/01-init-pgvector.sql "$CYRIS_OPT_DIR/docker/postgres/"
curl -fsSL --max-time 120 "https://github.com/RandomUcet/CYRIS_v2/releases/download/v$baseline/release-manifest.json" -o "$CYRIS_OPT_DIR/release-manifest.json"
printf '%s  %s\n' "$checksum" "$CYRIS_OPT_DIR/release-manifest.json" | sha256sum --check
python3 - "$CYRIS_ETC_DIR/cyris.env" "$CYRIS_OPT_DIR/release-manifest.json" "$baseline" <<'PY'
import json, pathlib, re, secrets, sys
env, manifest = map(pathlib.Path, sys.argv[1:3])
data = json.loads(manifest.read_text())
assert data["version"] == sys.argv[3]
settings = {"CYRIS_VERSION": data["version"], "CYRIS_WEB_BIND": "127.0.0.1",
            "CYRIS_HTTP_PORT": "13100", "CYRIS_API_PORT": "14100",
            "PUBLIC_WEB_URL": "http://127.0.0.1:13100",
            "CYRIS_MASTER_KEY": secrets.token_hex(32),
            "POSTGRES_PASSWORD": secrets.token_hex(24),
            "TYPESENSE_API_KEY": secrets.token_hex(24),
            "S3_SECRET_KEY": secrets.token_hex(24)}
settings["DATABASE_URL"] = "postgresql://cyris:" + settings["POSTGRES_PASSWORD"] + "@postgres:5432/cyris"
for role in ("api", "worker", "web"):
    image = data["images"][role]
    assert re.fullmatch(r"ghcr\.io/randomucet/cyris-" + role + r"@sha256:[0-9a-f]{64}", image)
    settings["CYRIS_" + role.upper() + "_IMAGE"] = image
lines = [line for line in env.read_text().splitlines() if line.partition("=")[0] not in settings]
env.write_text("\n".join(lines + [f"{k}={v}" for k,v in settings.items()]) + "\n")
PY
sed -e "s|/var/lib/cyris/|$CYRIS_VAR_DIR/|g" -e "s|/opt/cyris/|$CYRIS_OPT_DIR/|g" -e "s|/etc/cyris/|$CYRIS_ETC_DIR/|g" -e "s|^    name: cyris-internal$|    name: $COMPOSE_PROJECT_NAME|" -e '/^    container_name:/d'  deploy/compose.prod.yml > "$CYRIS_OPT_DIR/docker-compose.yml"
compose=(docker compose -f "$CYRIS_OPT_DIR/docker-compose.yml" --env-file "$CYRIS_ETC_DIR/cyris.env")
trap '"${compose[@]}" down --remove-orphans && rm -rf -- "$stage"' EXIT
# Pull immutable baseline images before provisioning the isolated services.
"${compose[@]}" pull api worker web
"${compose[@]}" up -d --wait --wait-timeout 180 postgres redis typesense minio
"${compose[@]}" run --rm --no-deps -T minio-init
sql() { "${compose[@]}" exec -T postgres psql -U cyris -d cyris -Atq -v ON_ERROR_STOP=1 -c "$1"; }
object() {
  "${compose[@]}" run --rm --no-deps -T --entrypoint /bin/sh minio-init -ec '
    mc alias set probe http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
    mc "$1" "probe/$S3_AUDIT_BUCKET/recovery-check"
  ' sh "$1"
}
probe() {
  "${compose[@]}" exec -T api curl -fsS http://127.0.0.1:4000/health/ready >/dev/null
  curl -fsS http://127.0.0.1:13100/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["version"]==sys.argv[1]' "$1"
  curl -fsS http://127.0.0.1:13100/ >/dev/null
}
"${compose[@]}" run --rm --no-deps -T api node dist/scripts/db-migrate.js
[[ $(sql 'select count(*) from drizzle.__drizzle_migrations') == "$count" ]]
sql "insert into events(id,slug,name,status) values ('00000000-0000-4000-8000-000000000001','upgrade-fixture','Upgrade fixture','ARCHIVED');
insert into audit_events(id,event_id,actor_type,action,category) values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','SYSTEM','upgrade.fixture','administration')"
before=$(sql "select to_jsonb(a)::text from audit_events a where id='00000000-0000-4000-8000-000000000002'")
echo before | object pipe
"${compose[@]}" exec -T redis redis-cli set recovery-check before >/dev/null
"${compose[@]}" up -d --no-deps --wait --wait-timeout 240 api worker web
probe "$baseline"
"${compose[@]}" stop api worker web
deploy/cyrisctl backup
deploy/cyrisctl backup verify
archive=("$CYRIS_BACKUPS_DIR"/backup_*.tar.gz.gpg)
[[ ${#archive[@]} == 1 && -f "${archive[0]}" ]]
python3 - "$CYRIS_ETC_DIR/cyris.env" "$CYRIS_OPT_DIR/release-manifest.json" <<'PY'
import json, pathlib, sys
env, manifest = map(pathlib.Path, sys.argv[1:])
settings = {"CYRIS_VERSION": "2.5.2", **{"CYRIS_"+r.upper()+"_IMAGE":"cyris-upgrade-candidate-"+r+":local" for r in ("api","worker","web")}}
lines = [line for line in env.read_text().splitlines() if line.partition("=")[0] not in settings]
env.write_text("\n".join(lines+[f"{k}={v}" for k,v in settings.items()])+"\n")
manifest.write_text(json.dumps({"version":"2.5.2","localRehearsal":True}))
PY
"${compose[@]}" run --rm --no-deps -T api node dist/scripts/db-migrate.js
[[ $(sql 'select count(*) from drizzle.__drizzle_migrations') == 43 ]]
"${compose[@]}" run --rm --no-deps -T api node dist/scripts/db-status.js --json
"${compose[@]}" up -d --no-deps --wait --wait-timeout 240 api worker web
probe 2.5.2
[[ $(sql "select to_jsonb(a)::text from audit_events a where id='00000000-0000-4000-8000-000000000002'") == "$before" ]]
[[ $(object cat) == before ]]
[[ $("${compose[@]}" exec -T redis redis-cli get recovery-check) == before ]]
sql "update events set name='After candidate' where slug='upgrade-fixture'"
echo after | object pipe
"${compose[@]}" exec -T redis redis-cli set recovery-check after >/dev/null
"${compose[@]}" stop api worker web
deploy/cyrisctl restore "${archive[0]}" --force
"${compose[@]}" up -d --no-deps --wait --wait-timeout 240 api worker web
probe "$baseline"
[[ $(sql 'select count(*) from drizzle.__drizzle_migrations') == "$count" ]]
"${compose[@]}" run --rm --no-deps -T api node dist/scripts/db-status.js --json
[[ $(sql "select name from events where slug='upgrade-fixture'") == 'Upgrade fixture' ]]
[[ $(sql "select to_jsonb(a)::text from audit_events a where id='00000000-0000-4000-8000-000000000002'") == "$before" ]]
[[ $(object cat) == before ]]
[[ $("${compose[@]}" exec -T redis redis-cli get recovery-check) == before ]]
echo "Published $baseline -> built 2.5.2 -> encrypted restore $baseline passed."
