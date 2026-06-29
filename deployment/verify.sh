#!/usr/bin/env bash
# =============================================================================
#  verify.sh — Run deployment validation check
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "Running Verification / Health Diagnostics"

if "$DEPLOY_DIR/install/09_healthcheck.sh"; then
    ok "Verification PASSED. All endpoints are fully operational."
    exit 0
else
    fail "Verification FAILED. One or more components are not responding."
fi
