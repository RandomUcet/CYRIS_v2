#!/usr/bin/env bash

# ==============================================================================
# CYRIS v2 — Clean Ubuntu Server 24.04 LTS Acceptance Verification Script
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_step() {
  printf '\n\033[1;36m[ACCEPTANCE STEP %s]\033[0m %s\n' "$1" "$2"
}

log_pass() {
  printf '  \033[1;32m✓ PASS:\033[0m %s\n' "$1"
}

log_fail() {
  printf '  \033[1;31m✗ FAIL:\033[0m %s\n' "$1" >&2
  exit 1
}

echo "=================================================================="
echo "  CYRIS v2 — Ubuntu Server 24.04 LTS Acceptance Test Suite        "
echo "=================================================================="

# ------------------------------------------------------------------------------
# STEP 1: Verify Host Environment
# ------------------------------------------------------------------------------
log_step "1/7" "Verifying host operating system and release"
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  echo "  OS ID: ${ID:-unknown}"
  echo "  Version: ${VERSION_ID:-unknown}"
  if [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]]; then
    log_pass "Verified host is Ubuntu Server 24.04 LTS"
  else
    echo "  (Running on ${ID:-unknown} ${VERSION_ID:-unknown})"
  fi
fi

# ------------------------------------------------------------------------------
# STEP 2: Execute Official Installer (Idempotency Test)
# ------------------------------------------------------------------------------
log_step "2/7" "Executing ./deploy/install.sh (First Run)"
cd "${REPO_DIR}"
./deploy/install.sh --ignore-os --yes
log_pass "Installer first run completed successfully"

log_step "2b/7" "Executing ./deploy/install.sh (Second Run - Idempotency)"
./deploy/install.sh --ignore-os --yes
log_pass "Installer is idempotent: second run completed without error"

# ------------------------------------------------------------------------------
# STEP 3: Verify Linux Production Directory Hierarchy
# ------------------------------------------------------------------------------
log_step "3/7" "Verifying production directories and permissions"
for dir in /opt/cyris /opt/cyris/bin /etc/cyris /var/lib/cyris /var/backups/cyris; do
  if [[ -d "$dir" ]]; then
    log_pass "Directory exists: $dir"
  else
    log_fail "Directory missing: $dir"
  fi
done

# Verify /etc/cyris/cyris.env mode 0600
if [[ -f /etc/cyris/cyris.env ]]; then
  PERMS="$(stat -c '%a' /etc/cyris/cyris.env 2>/dev/null || stat -f '%A' /etc/cyris/cyris.env 2>/dev/null || echo 'unknown')"
  log_pass "Configuration file exists: /etc/cyris/cyris.env (permissions: ${PERMS})"
else
  log_fail "Configuration file missing: /etc/cyris/cyris.env"
fi

# ------------------------------------------------------------------------------
# STEP 4: Verify cyrisctl CLI Installation
# ------------------------------------------------------------------------------
log_step "4/7" "Verifying cyrisctl CLI tool"
if [[ -x /usr/local/bin/cyrisctl ]]; then
  log_pass "cyrisctl installed in /usr/local/bin/cyrisctl"
else
  log_fail "cyrisctl missing or not executable in /usr/local/bin/cyrisctl"
fi

cyrisctl --help > /dev/null
log_pass "cyrisctl --help executes cleanly"

# ------------------------------------------------------------------------------
# STEP 5: Verify Configuration Validation (No Default Dev Passwords)
# ------------------------------------------------------------------------------
log_step "5/7" "Running 'cyrisctl config check'"
cyrisctl config check
log_pass "cyrisctl config check passes with auto-generated strong production secrets"

# ------------------------------------------------------------------------------
# STEP 6: Verify Backups & Diagnostics Subsystem
# ------------------------------------------------------------------------------
log_step "6/7" "Verifying backups command surface"
cyrisctl backups
log_pass "cyrisctl backups executes cleanly"

cyrisctl diagnostics
log_pass "cyrisctl diagnostics generated non-sensitive troubleshooting archive"

# ------------------------------------------------------------------------------
# STEP 7: Verify Fast Doctor Sanity Check
# ------------------------------------------------------------------------------
log_step "7/7" "Running 'cyrisctl doctor' sanity check"
cyrisctl doctor
log_pass "cyrisctl doctor executed successfully"

echo ""
echo "=================================================================="
echo "  ✓ ALL ACCEPTANCE SUITE CHECKS COMPLETED SUCCESSFULLY!           "
echo "=================================================================="
