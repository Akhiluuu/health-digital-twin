#!/usr/bin/env bash
# =============================================================================
#  02_python.sh — Ensure Python environment and development libraries
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 2: Configuring Python Environment"

# Verify python3 exists
if ! command -v python3 &>/dev/null; then
    info "python3 not found. Installing base python3 package..."
    sudo apt-get install -y -qq python3 python3-pip python3-dev
fi

# Ensure python venv package matches the active/detected python version
# E.g. python3.12 -> python3.12-venv
detect_python

info "Installing matching venv package for Python ${PYTHON_VER}..."
VENV_PKG="python${PYTHON_VER}-venv"

if ! sudo apt-get install -y -qq "$VENV_PKG" python3-pip python3-dev; then
    warn "Could not install $VENV_PKG directly. Attempting python3-venv..."
    sudo apt-get install -y -qq python3-venv python3-pip python3-dev
fi

ok "Python environment packages installed."
