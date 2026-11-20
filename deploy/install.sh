#!/usr/bin/env bash

# ==============================================================================
# CYRIS v2 — Host Installation & Bootstrap Script
# Target: Ubuntu Server 24.04 LTS (x86_64, aarch64)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuration
CYRIS_OPT="/opt/cyris"
CYRIS_ETC="/etc/cyris"
CYRIS_VAR="/var/lib/cyris"
CYRIS_BACKUPS="/var/backups/cyris"
BIN_TARGET="/usr/local/bin/cyrisctl"

IGNORE_OS=0
NON_INTERACTIVE=0

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --ignore-os)
      IGNORE_OS=1
      ;;
    -y|--yes|--non-interactive)
      NON_INTERACTIVE=1
      ;;
    -h|--help)
      echo "Usage: sudo ./deploy/install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --ignore-os          Bypass Ubuntu 24.04 LTS OS requirement (for container/test environments)"
      echo "  -y, --yes            Run non-interactively without prompt"
      echo "  -h, --help           Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "${CYRIS_IGNORE_OS:-0}" == "1" ]]; then
  IGNORE_OS=1
fi

log_info() {
  printf '\033[1;34m[CYRIS INSTALL]\033[0m %s\n' "$1"
}

log_warn() {
  printf '\033[1;33m[CYRIS WARNING]\033[0m %s\n' "$1" >&2
}

log_error() {
  printf '\033[1;31m[CYRIS ERROR]\033[0m %s\n' "$1" >&2
}

fail() {
  log_error "$1"
  exit 1
}

# ------------------------------------------------------------------------------
# 1. Privilege Validation
# ------------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  fail "This script must be executed with root privileges. Run with: sudo ./deploy/install.sh"
fi

echo "=================================================================="
echo "  CYRIS v2 — Production Host Installer (Ubuntu Server 24.04 LTS)  "
echo "=================================================================="

# ------------------------------------------------------------------------------
# 2. Host Operating System & Architecture Validation
# ------------------------------------------------------------------------------
ARCH="$(uname -m)"
log_info "Detecting system architecture: ${ARCH}"
if [[ "${ARCH}" != "x86_64" && "${ARCH}" != "aarch64" ]]; then
  fail "Unsupported CPU architecture '${ARCH}'. CYRIS requires x86_64 (amd64) or aarch64 (arm64)."
fi

if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VER="${VERSION_ID:-unknown}"
  log_info "Detected OS: ${NAME:-${OS_ID}} ${OS_VER}"

  if [[ "${OS_ID}" != "ubuntu" || "${OS_VER}" != "24.04" ]]; then
    if [[ ${IGNORE_OS} -eq 1 ]]; then
      log_warn "OS check bypassed via --ignore-os. Host is ${OS_ID} ${OS_VER} instead of Ubuntu 24.04 LTS."
    else
      fail "CYRIS production deployment targets Ubuntu Server 24.04 LTS (detected: ${OS_ID} ${OS_VER}). Use --ignore-os to test on non-standard systems."
    fi
  fi
else
  if [[ ${IGNORE_OS} -eq 1 ]]; then
    log_warn "/etc/os-release not found. OS check bypassed via --ignore-os."
  else
    fail "Unable to determine host operating system (/etc/os-release missing). Use --ignore-os to bypass."
  fi
fi

# ------------------------------------------------------------------------------
# 3. Resource Pre-flight Checks (Disk & Memory)
# ------------------------------------------------------------------------------
log_info "Checking filesystem storage..."
# Ensure at least 10 GB free on /var or /
FREE_SPACE_GB=$(df -BG /var 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' || df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
if [[ -n "${FREE_SPACE_GB}" && "${FREE_SPACE_GB}" =~ ^[0-9]+$ ]]; then
  if (( FREE_SPACE_GB < 10 )); then
    log_warn "Low available disk space (${FREE_SPACE_GB} GB available). Recommended minimum is 10 GB."
  else
    log_info "Available disk space: ${FREE_SPACE_GB} GB (PASS)"
  fi
fi

log_info "Checking system memory..."
if command -v free >/dev/null 2>&1; then
  TOTAL_MEM_MB=$(free -m | awk '/Mem:/ {print $2}')
  if [[ -n "${TOTAL_MEM_MB}" && "${TOTAL_MEM_MB}" =~ ^[0-9]+$ ]]; then
    if (( TOTAL_MEM_MB < 1800 )); then
      log_warn "Host total memory is ${TOTAL_MEM_MB} MB. Production CYRIS recommends at least 4 GB RAM."
    else
      log_info "System memory: ${TOTAL_MEM_MB} MB (PASS)"
    fi
  fi
fi

# Check HTTP Port (3000)
if command -v ss >/dev/null 2>&1; then
  if ss -tulpn | grep -q ':3000 '; then
    log_warn "Port 3000 is currently in use. You may need to stop conflicting services or adjust CYRIS_HTTP_PORT in /etc/cyris/cyris.env."
  fi
fi

# ------------------------------------------------------------------------------
# 4. Required System Utilities & Docker
# ------------------------------------------------------------------------------
log_info "Checking required utilities (curl, tar, gzip, openssl, python3, ca-certificates)..."
MISSING_PKGS=()
for bin in curl tar gzip openssl python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    MISSING_PKGS+=("$bin")
  fi
done
if [[ ! -f /etc/ssl/certs/ca-certificates.crt ]]; then
  MISSING_PKGS+=("ca-certificates")
fi

if (( ${#MISSING_PKGS[@]} > 0 )); then
  log_info "Installing missing utilities: ${MISSING_PKGS[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y --no-install-recommends "${MISSING_PKGS[@]}"
  else
    fail "Missing required utilities (${MISSING_PKGS[*]}), and apt-get is unavailable."
  fi
fi

# Check Docker Engine & Docker Compose
log_info "Checking Docker Engine and Docker Compose plugin..."
if ! command -v docker >/dev/null 2>&1; then
  log_info "Docker is not installed. Installing official Docker Engine..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y --no-install-recommends docker.io docker-compose-v2 docker-buildx
  else
    fail "Docker is required but not installed, and automated installation is only supported on Debian/Ubuntu."
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  log_info "Docker Compose plugin is missing. Installing docker-compose-plugin..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y --no-install-recommends docker-compose-v2
  else
    fail "Docker Compose (v2 plugin) is required."
  fi
fi

# Check Docker daemon availability
if ! docker info >/dev/null 2>&1; then
  log_info "Attempting to start Docker daemon..."
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker || true
  elif command -v service >/dev/null 2>&1; then
    service docker start || true
  fi
  sleep 2
  if ! docker info >/dev/null 2>&1; then
    fail "Docker daemon is not running. Please ensure the Docker service is active."
  fi
fi
log_info "Docker Engine and Compose plugin verified (PASS)"

# ------------------------------------------------------------------------------
# 5. Production Directories & Permissions Layout
# ------------------------------------------------------------------------------
log_info "Creating production filesystem hierarchy..."

# /opt/cyris: release metadata, compose definition, binary
mkdir -p "${CYRIS_OPT}/bin"
mkdir -p "${CYRIS_OPT}/docker/postgres"
chmod 0755 "${CYRIS_OPT}"
chmod 0755 "${CYRIS_OPT}/bin"

# /etc/cyris: restricted configuration and secrets
mkdir -p "${CYRIS_ETC}"
chmod 0700 "${CYRIS_ETC}"
chown root:root "${CYRIS_ETC}"

# /var/lib/cyris: persistent runtime databases & storage
mkdir -p "${CYRIS_VAR}/postgres"
mkdir -p "${CYRIS_VAR}/redis"
mkdir -p "${CYRIS_VAR}/typesense"
mkdir -p "${CYRIS_VAR}/minio"
chmod 0700 "${CYRIS_VAR}"
chmod 0700 "${CYRIS_VAR}/postgres" "${CYRIS_VAR}/redis" "${CYRIS_VAR}/typesense" "${CYRIS_VAR}/minio"
chown root:root "${CYRIS_VAR}"

# /var/backups/cyris: authoritative backups directory
mkdir -p "${CYRIS_BACKUPS}"
chmod 0700 "${CYRIS_BACKUPS}"
chown root:root "${CYRIS_BACKUPS}"

# ------------------------------------------------------------------------------
# 6. Deploy Runtime Files & Assets
# ------------------------------------------------------------------------------
log_info "Deploying release assets to ${CYRIS_OPT}..."

cp "${SCRIPT_DIR}/compose.prod.yml" "${CYRIS_OPT}/docker-compose.yml"
cp "${SCRIPT_DIR}/release-manifest.json" "${CYRIS_OPT}/release-manifest.json"
if [[ -f "${REPO_DIR}/docker/postgres/01-init-pgvector.sql" ]]; then
  cp "${REPO_DIR}/docker/postgres/01-init-pgvector.sql" "${CYRIS_OPT}/docker/postgres/01-init-pgvector.sql"
fi

# Install cyrisctl binary
cp "${SCRIPT_DIR}/cyrisctl" "${CYRIS_OPT}/bin/cyrisctl"
chmod 0755 "${CYRIS_OPT}/bin/cyrisctl"
ln -sf "${CYRIS_OPT}/bin/cyrisctl" "${BIN_TARGET}"

log_info "cyrisctl CLI installed to ${BIN_TARGET}"

# ------------------------------------------------------------------------------
# 7. Production Configuration & Secret Generation
# ------------------------------------------------------------------------------
ENV_FILE="${CYRIS_ETC}/cyris.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  log_info "Generating production secrets and initializing ${ENV_FILE}..."

  # Generate high-entropy cryptographic secrets
  # 256-bit AES cryptographic master key (64 hex characters)
  GEN_MASTER_KEY="$(openssl rand -hex 32)"
  GEN_POSTGRES_PWD="$(openssl rand -hex 16)"
  GEN_TYPESENSE_KEY="$(openssl rand -hex 16)"
  GEN_S3_SECRET="$(openssl rand -hex 16)"

  # Create /etc/cyris/cyris.env from template
  sed \
    -e "s|GENERATE_ME_32_CHARACTERS_MINIMUM|${GEN_MASTER_KEY}|g" \
    -e "s|GENERATE_STRONG_RANDOM_POSTGRES_PASSWORD|${GEN_POSTGRES_PWD}|g" \
    -e "s|GENERATE_STRONG_RANDOM_TYPESENSE_KEY|${GEN_TYPESENSE_KEY}|g" \
    -e "s|GENERATE_STRONG_RANDOM_S3_SECRET_KEY|${GEN_S3_SECRET}|g" \
    "${SCRIPT_DIR}/cyris.env.template" > "${ENV_FILE}"

  chmod 0600 "${ENV_FILE}"
  chown root:root "${ENV_FILE}"
  log_info "Created ${ENV_FILE} with secure permissions (0600, root:root)."
else
  log_info "Existing configuration detected at ${ENV_FILE}. Preserving without changes."
fi

# ------------------------------------------------------------------------------
# 8. Post-Install Verification & Summary
# ------------------------------------------------------------------------------
echo ""
echo "=================================================================="
echo "  CYRIS v2 — Host Installation Completed Successfully!            "
echo "=================================================================="
echo "  Runtime directory:     ${CYRIS_OPT}"
echo "  Configuration file:    ${ENV_FILE} (mode 0600)"
echo "  Persistent data:       ${CYRIS_VAR}"
echo "  Backups storage:       ${CYRIS_BACKUPS}"
echo "  Management utility:    ${BIN_TARGET}"
echo ""
echo "  Quick start operator commands:"
echo "    1. Review configuration:   sudo cyrisctl config check"
echo "    2. Deploy services:        sudo cyrisctl deploy"
echo "    3. Run full verification:  sudo cyrisctl doctor --full"
echo "    4. Create platform admin:  sudo cyrisctl admin create"
echo "=================================================================="
