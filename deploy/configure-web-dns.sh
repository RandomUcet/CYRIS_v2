#!/usr/bin/env bash
# Add an internal HTTPS name to an IP-based first-server deployment.
set -Eeuo pipefail

die() { echo "$*" >&2; exit 1; }

valid_name() {
  local label='[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
  [[ ${#1} -le 253 && $1 =~ ^($label\.)+$label$ && ! $1 =~ ^[0-9.]+$ ]]
}

configure_server() {
  [[ $EUID == 0 ]] || die "Spusť serverovou část přes sudo."
  local name=$1 expected_ip=$2 ip release
  valid_name "$name" || die "Neplatné DNS jméno."
  read -r release ip < /etc/cyris/first-server
  [[ $ip == "$expected_ip" && $ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "Adresa původní instalace neodpovídá cíli SSH."
  exec 9>/run/cyris-first-install.lock
  flock -n 9 || die "Probíhá jiná změna instalace."
  local envfile=/etc/cyris/cyris.env config=/opt/cyris/Caddyfile ca=/opt/cyris/CYRIS-root.crt
  local compose=(docker compose --env-file "$envfile" -f /opt/cyris/docker-compose.yml)
  local state
  umask 077
  state=$(mktemp -d /etc/cyris/.web-dns.XXXXXXXX)
  trap 'rm -rf -- "$state"' EXIT
  cp -p "$config" "$state/old.caddy"
  cp -p "$envfile" "$state/old.env"
  cp -p "$envfile" "$state/new.env"
  cat "$config" > "$state/new.caddy"
  if ! grep -Fxq "https://$name {" "$config"; then
    printf '\nhttps://%s {\n    tls internal\n    reverse_proxy web:3000\n}\n' "$name" >> "$state/new.caddy"
  fi
  [[ $(grep -c '^PUBLIC_WEB_URL=' "$envfile") == 1 ]] || die "V konfiguraci chybí jednoznačná PUBLIC_WEB_URL."
  sed "s|^PUBLIC_WEB_URL=.*$|PUBLIC_WEB_URL=https://$name|" "$envfile" > "$state/new.env"
  "${compose[@]}" exec -T gateway caddy validate --config - --adapter caddyfile < "$state/new.caddy"
  docker compose --env-file "$state/new.env" -f /opt/cyris/docker-compose.yml config --quiet
  # Recreating the API must preserve any additional LDAP trust configured in the running container.
  if ! cmp -s "$state/new.env" "$envfile"; then
    local ca_check='const p=process.env.NODE_EXTRA_CA_CERTS;
if(p) console.log(require("node:crypto").createHash("sha256").update(require("node:fs").readFileSync(p)).digest("hex"));'
    local current_ca next_ca
    current_ca=$("${compose[@]}" exec -T api node -e "$ca_check")
    if [[ -n $current_ca ]]; then
      next_ca=$(docker compose --env-file "$state/new.env" -f /opt/cyris/docker-compose.yml run --rm --no-deps -T api node -e "$ca_check")
      [[ $next_ca == "$current_ca" ]] || die "Nastavení kontejnerů musí před restartem trvale připojit stávající LDAP certifikační autoritu."
    fi
  fi
  local app_changed=0
  reload_gateway() { "${compose[@]}" exec -T gateway caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; }
  apply_url() { "${compose[@]}" up -d --no-deps --wait --wait-timeout 240 api worker web; }
  probe() {
    curl -fsS --noproxy '*' --cacert "$ca" --resolve "$1:443:127.0.0.1" --max-time 5 \
      --retry 4 --retry-all-errors --retry-delay 1 "https://$1$2" -o /dev/null
  }
  rollback() {
    trap - ERR INT TERM HUP
    echo "Obnovuji předchozí nastavení." >&2
    cat "$state/old.caddy" > "$config"
    reload_gateway || echo "Zkontroluj gateway." >&2
    if (( app_changed )); then mv -f "$state/old.env" "$envfile"; apply_url || echo "Zkontroluj sudo cyrisctl status." >&2; fi
    exit 1
  }
  trap rollback ERR INT TERM HUP
  # Preserve the inode of Caddy's single-file Docker bind mount.
  cat "$state/new.caddy" > "$config"
  reload_gateway
  probe "$name" /login
  if ! cmp -s "$state/new.env" "$envfile"; then
    app_changed=1
    mv -f "$state/new.env" "$envfile"
    apply_url
  fi
  probe "$name" /api/health/ready
  probe "$ip" /login
  trap - ERR INT TERM HUP EXIT
  rm -rf -- "$state"
}

if [[ ${1:-} == --server ]]; then configure_server "${2:?}" "${3:?}"; exit; fi

target=${1:?Zadej uživatel@IPv4-serveru}
[[ $target =~ ^[a-zA-Z_][a-zA-Z0-9_-]*@([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "Zadej SSH cíl ve tvaru uživatel@IPv4."
ip=${target#*@}
read -rp 'Celé DNS jméno z vytvořeného záznamu (bez https://): ' name
name=$(printf '%s' "${name%.}" | tr '[:upper:]' '[:lower:]')
valid_name "$name" || die "Zadej celé DNS jméno, například web ve své školní doméně."
addresses=$(dscacheutil -q host -a name "$name" | awk '$1 == "ip_address:" || $1 == "ipv6_address:" {print $2}' | sort -u)
grep -Fxq "$ip" <<< "$addresses" || die "Mac pro $name vrací [${addresses:-žádnou adresu}]. Pro tuto instalaci má vracet $ip. Ověř A/AAAA záznam a školní síť nebo VPN."
stage=$(mktemp -d /tmp/cyris-dns.XXXXXXXX)
ssh_opts=(-o ControlMaster=auto -o ControlPersist=120 -o "ControlPath=$stage/socket")
remote=''
cleanup() {
  if [[ -n $remote ]]; then ssh "${ssh_opts[@]}" "$target" "rm -rf -- $remote" || true; fi
  ssh "${ssh_opts[@]}" -O exit "$target" 2>/dev/null || true
  rm -rf -- "$stage"
}
trap cleanup EXIT
candidate=$(ssh "${ssh_opts[@]}" "$target" 'mktemp -d /tmp/cyris-dns.XXXXXXXX')
[[ $candidate =~ ^/tmp/cyris-dns\.[a-zA-Z0-9]+$ ]] || die "Server nepřipravil pracovní adresář."
remote=$candidate
ssh "${ssh_opts[@]}" "$target" "cat > $remote/setup" < "$0"
ssh -t "${ssh_opts[@]}" "$target" "sudo bash $remote/setup --server $name $ip" </dev/tty
ssh "${ssh_opts[@]}" "$target" 'cat /opt/cyris/CYRIS-root.crt' > "$stage/CYRIS-root.crt"
url="https://$name/login"
curl -fsS --noproxy '*' --max-time 10 --cacert "$stage/CYRIS-root.crt" "$url" -o /dev/null
echo "DNS a ověření certifikátu ze serveru fungují: $url"
if /usr/bin/curl -fsS --noproxy '*' --max-time 10 "$url" -o /dev/null; then
  echo "Mac certifikátu důvěřuje. Otevři $url."
else
  result=$?
  [[ $result == 60 ]] || die "Test systémové důvěry selhal s kódem $result."
  out=$(mktemp -d "$HOME/Downloads/CYRIS-HTTPS.XXXXXXXX")
  cp "$stage/CYRIS-root.crt" "$out/CYRIS-root.crt"
  echo "Pro důvěru na tomto Macu spusť:"
  printf 'sudo security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain %q\n' "$out/CYRIS-root.crt"
fi
