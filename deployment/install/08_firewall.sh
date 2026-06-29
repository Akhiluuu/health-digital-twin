#!/usr/bin/env bash
# =============================================================================
#  08_firewall.sh — Configure firewall settings
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 8: Configure Firewall Settings"

# Define ports to open
# 80: Nginx reverse proxy
# 8000: FastAPI direct (optional)
# 8001: Health AI direct (optional)
# 5000: Pulse API direct (optional)
PORTS=(80 8000 8001 5000)

# Check UFW
if command -v ufw &>/dev/null && sudo ufw status | grep -q "Status: active"; then
    info "UFW detected and active. Opening required ports: ${PORTS[*]}..."
    for port in "${PORTS[@]}"; do
        sudo ufw allow "${port}/tcp" >/dev/null
    done
    sudo ufw reload >/dev/null
    ok "UFW ports allowed and reloaded."
# Check firewalld
elif command -v firewall-cmd &>/dev/null && sudo systemctl is-active --quiet firewalld; then
    info "Firewalld detected and active. Opening required ports: ${PORTS[*]}..."
    for port in "${PORTS[@]}"; do
        sudo firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null
    done
    sudo firewall-cmd --reload >/dev/null
    ok "Firewalld ports allowed and reloaded."
else
    info "No active local firewall (UFW/Firewalld) detected."
    warn "If you are on E2E Cloud, AWS, GCP or Azure, ensure ports 80, 8000, 8001, and 5000 are opened in your provider's security groups/firewall console."
fi
