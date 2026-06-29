#!/usr/bin/env bash
# =============================================================================
#  04_biogears.sh — Download and configure BioGears simulation runtime
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 4: Configure BioGears Simulation Runtime"

BGCLI="$RUNTIME_DIR/bg-cli"

if [[ -f "$BGCLI" ]] && [[ -x "$BGCLI" ]]; then
    ok "BioGears runtime already exists and is executable at $RUNTIME_DIR."
else
    info "BioGears runtime not found or not executable. Downloading clean v7.3.2 release..."
    mkdir -p "$RUNTIME_DIR"
    
    BIOGEARS_URL="https://github.com/BioGearsEngine/core/releases/download/7.3.2/Biogears-7.3.2-ubuntu_16.04-gcc5.tgz"
    TEMP_TGZ="/tmp/biogears_$(date +%s).tgz"

    info "Downloading from $BIOGEARS_URL ..."
    if ! wget -q --show-progress -O "$TEMP_TGZ" "$BIOGEARS_URL"; then
        fail "Failed to download BioGears runtime archive."
    fi

    info "Extracting BioGears runtime..."
    tar -xzf "$TEMP_TGZ" --strip-components=1 -C "$RUNTIME_DIR"
    rm -f "$TEMP_TGZ"

    # Establish relative/symbolic links in biogears_runtime
    info "Setting up runtime symlinks..."
    cd "$RUNTIME_DIR"
    ln -sf bin/bg-cli bg-cli
    ln -sf bin/bg-scenario bg-scenario
    ln -sf share/biogears/7.3.2/xsd xsd

    if [[ -d share/biogears/7.3.2/data ]]; then
        for item in share/biogears/7.3.2/data/*; do
            if [[ -e "$item" ]]; then
                ln -sf "$item" "$(basename "$item")"
            fi
        done
    fi
    cd "$PROJECT_DIR"
    
    ok "BioGears runtime downloaded and configured."
fi

# Ensure executable permission
chmod +x "$RUNTIME_DIR/bin/bg-cli" "$RUNTIME_DIR/bg-cli" 2>/dev/null || true
ok "BioGears runtime verified."
