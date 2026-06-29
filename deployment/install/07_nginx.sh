#!/usr/bin/env bash
# =============================================================================
#  07_nginx.sh — Setup Nginx reverse proxy
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 7: Configure Nginx Reverse Proxy"

NGINX_TEMPLATE="$DEPLOY_DIR/templates/nginx.conf"
NGINX_AVAIL="/etc/nginx/sites-available/digitaltwin"
NGINX_ENABLED="/etc/nginx/sites-enabled/digitaltwin"

if [[ ! -f "$NGINX_TEMPLATE" ]]; then
    fail "Nginx config template missing at $NGINX_TEMPLATE"
fi

info "Ensuring reports directory exists..."
mkdir -p "$REPORT_DIR"
chmod 755 "$REPORT_DIR"

info "Patching Nginx site config..."
sudo sed -e "s|{{PROJECT_DIR}}|${PROJECT_DIR}|g" \
         "$NGINX_TEMPLATE" | sudo tee "$NGINX_AVAIL" > /dev/null

info "Enabling Nginx site..."
sudo ln -sf "$NGINX_AVAIL" "$NGINX_ENABLED"

# Remove default site to avoid conflicts
if [[ -L /etc/nginx/sites-enabled/default ]] || [[ -f /etc/nginx/sites-enabled/default ]]; then
    info "Removing default Nginx configuration link..."
    sudo rm -f /etc/nginx/sites-enabled/default
fi

# Verify Nginx configuration
info "Validating Nginx configuration syntax..."
if sudo nginx -t; then
    info "Nginx configuration is valid. Reloading Nginx service..."
    sudo systemctl enable nginx
    sudo systemctl reload nginx
    ok "Nginx reverse proxy is successfully active."
else
    # Rollback our link and reload to not break existing Nginx setup
    warn "Nginx config test failed! Rolling back changes..."
    sudo rm -f "$NGINX_ENABLED"
    sudo systemctl reload nginx || true
    fail "Nginx configuration syntax validation failed. Check your Nginx templates."
fi
