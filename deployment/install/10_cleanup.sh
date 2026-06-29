#!/usr/bin/env bash
# =============================================================================
#  10_cleanup.sh — Cleanup temporary installation files
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 10: Cleaning Up Temporary Files"

info "Removing temporary setup artifacts..."
sudo rm -f /tmp/digitaltwin.nginx.conf \
           /tmp/digitaltwin.service \
           /tmp/healthbot.service \
           /tmp/digitaltwin.nginx.conf \
           /tmp/biogears.tgz 2>/dev/null || true

# Adjust file ownership of the project dir to user and group
detect_user
info "Ensuring project directory ownership is set to ${CURRENT_USER}:${CURRENT_GROUP}..."
sudo chown -R "${CURRENT_USER}:${CURRENT_GROUP}" "$PROJECT_DIR"

ok "Cleanup complete."
