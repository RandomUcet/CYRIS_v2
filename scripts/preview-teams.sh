#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
source scripts/dev-runtime.sh
use_dev_node
exec node --import tsx scripts/preview-teams.ts "$@"
