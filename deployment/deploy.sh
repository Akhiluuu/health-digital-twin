#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — Master Deployment Entrypoint Script
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          VitalHealth Digital Twin Deployment System          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
info "Log session started. Writing output to $CURRENT_LOG_FILE"

# List of install script modules to run in sequence
INSTALL_STEPS=(
    "00_prechecks.sh"
    "01_system.sh"
    "02_python.sh"
    "03_project.sh"
    "04_biogears.sh"
    "05_healthbot.sh"
    "06_services.sh"
    "07_nginx.sh"
    "08_firewall.sh"
    "09_healthcheck.sh"
    "10_cleanup.sh"
)

# Run each step
for step in "${INSTALL_STEPS[@]}"; do
    STEP_PATH="$DEPLOY_DIR/install/$step"
    if [[ ! -f "$STEP_PATH" ]]; then
        fail "Deployment step file is missing: $step at $STEP_PATH"
    fi
    
    chmod +x "$STEP_PATH"
    info "Executing module: $step ..."
    
    # Run in a subshell so it inherits variables but exits on failure
    if ! "$STEP_PATH"; then
        fail "Module execution failed at step: $step. See logs in $CURRENT_LOG_FILE for details."
    fi
done

VM_IP=$(hostname -I | awk '{print $1}')
API_KEY=$(grep "DIGITAL_TWIN_API_KEY" "$PROJECT_DIR/.env" | cut -d'=' -f2- || echo "Not Found")

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}✅  Deployment Completed Successfully!${NC}                          ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  Endpoints:                                                      ║"
echo "║    BioGears API   → http://$VM_IP/ (Port 8000 direct)"
echo "║    Health AI      → http://$VM_IP/ai/ (Port 8001 direct)"
echo "║                                                                  ║"
echo "║  Mobile App Connection:                                          ║"
echo "║    Server Address : http://$VM_IP"
echo "║    API Key        : $API_KEY"
echo "║                                                                  ║"
echo "║  Log File:                                                       ║"
echo "║    $CURRENT_LOG_FILE"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
