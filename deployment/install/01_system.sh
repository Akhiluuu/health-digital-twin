#!/usr/bin/env bash
# =============================================================================
#  01_system.sh — Install required system dependencies
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 1: Installing System Dependencies"

info "Updating local APT package index..."
sudo apt-get update -y -qq

# Build package list dynamically
PACKAGES=(
    git
    curl
    wget
    unzip
    sqlite3
    htop
    tmux
    nginx
    build-essential
    libssl-dev
    libffi-dev
    libsqlite3-dev
    tesseract-ocr
    tesseract-ocr-eng
    libgl1
    libglib2.0-0
)

info "Installing core system utilities via APT..."
sudo apt-get install -y -qq "${PACKAGES[@]}"

ok "System dependencies successfully verified and installed."
