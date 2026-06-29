#!/usr/bin/env bash
# =============================================================================
#  uninstall.sh — Clean teardown/removal of services and configs
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "Teardown / Uninstall VitalHealth Deployment"

# Confirm from user
read -p "Are you sure you want to stop and remove all services and configs? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    fail "Teardown aborted."
fi

# 1. Stop and disable systemd services
info "Stopping and disabling systemd services..."
for svc in digitaltwin healthbot; do
    if systemctl is-active --quiet "$svc" || systemctl is-enabled --quiet "$svc" 2>/dev/null; then
        info "Stopping $svc..."
        sudo systemctl stop "$svc" || true
        sudo systemctl disable "$svc" || true
    fi
    if [[ -f "/etc/systemd/system/${svc}.service" ]]; then
        info "Removing service file for $svc..."
        sudo rm -f "/etc/systemd/system/${svc}.service"
    fi
done

sudo systemctl daemon-reload

# 2. Teardown Nginx config
info "Removing Nginx configuration files..."
if [[ -f "/etc/nginx/sites-enabled/digitaltwin" ]] || [[ -L "/etc/nginx/sites-enabled/digitaltwin" ]]; then
    sudo rm -f "/etc/nginx/sites-enabled/digitaltwin"
fi
if [[ -f "/etc/nginx/sites-available/digitaltwin" ]]; then
    sudo rm -f "/etc/nginx/sites-available/digitaltwin"
fi

info "Reloading Nginx..."
sudo systemctl reload nginx || true

# 3. Clean up symlinks
SYMLINK="$PROJECT_DIR/health_ai"
if [[ -L "$SYMLINK" ]]; then
    info "Removing python package import symlink..."
    rm -f "$SYMLINK"
fi

# 4. Clean up Virtual environments
info "Removing virtual environments..."
rm -rf "$BIOGEARS_VENV"
rm -rf "$HEALTHBOT_VENV"

# 5. Clean up logs and reports
read -p "Do you also want to delete all simulation logs and HTML reports? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Deleting logs, reports, and job stores..."
    rm -rf "$PROJECT_DIR/logs"
    rm -rf "$REPORT_DIR"
    rm -f "$PROJECT_DIR/biogears_service/jobs_store.json"
fi

# 6. Large files: LLM model and BioGears runtime
read -p "Do you want to delete the downloaded LLM GGUF model files and BioGears runtime? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Deleting LLM model directory and BioGears runtime..."
    rm -rf "$MODEL_DIR"
    rm -rf "$RUNTIME_DIR"
fi

ok "Teardown complete. All deployment components have been removed."
