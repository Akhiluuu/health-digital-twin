#!/usr/bin/env bash
# =============================================================================
#  rollback.sh — Restore previous deployment state from backups
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "Rollback / Restore System State"

BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
    info "No backup file specified. Locating latest backup in $BACKUP_DIR ..."
    if [[ -d "$BACKUP_DIR" ]]; then
        # Find latest file
        LATEST_BACKUP=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" | sort | tail -n 1)
        if [[ -n "$LATEST_BACKUP" ]]; then
            BACKUP_FILE="$LATEST_BACKUP"
            info "Selected latest backup file: $BACKUP_FILE"
        fi
    fi
fi

if [[ -z "$BACKUP_FILE" ]] || [[ ! -f "$BACKUP_FILE" ]]; then
    fail "No valid backup file found to restore from. Rollback aborted."
fi

TEMP_EXTRACT="/tmp/vh_rollback_$(date +%s)"
mkdir -p "$TEMP_EXTRACT"

info "Extracting backup archive $BACKUP_FILE ..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_EXTRACT"

# 1. Restore configurations
if [[ -f "$TEMP_EXTRACT/project/.env" ]]; then
    info "Restoring .env configuration..."
    cp "$TEMP_EXTRACT/project/.env" "$PROJECT_DIR/.env"
    chmod 600 "$PROJECT_DIR/.env"
fi

if [[ -f "$TEMP_EXTRACT/project/jobs_store.json" ]]; then
    info "Restoring simulation jobs data store..."
    cp "$TEMP_EXTRACT/project/jobs_store.json" "$PROJECT_DIR/biogears_service/jobs_store.json"
fi

# 2. Restore folders
if [[ -d "$TEMP_EXTRACT/project/reports" ]]; then
    info "Restoring HTML reports directory..."
    rm -rf "$REPORT_DIR"
    cp -r "$TEMP_EXTRACT/project/reports" "$REPORT_DIR"
fi

if [[ -d "$TEMP_EXTRACT/project/clinical_data" ]]; then
    info "Restoring clinical data states..."
    rm -rf "$CLINICAL_DIR"
    cp -r "$TEMP_EXTRACT/project/clinical_data" "$CLINICAL_DIR"
fi

if [[ -d "$TEMP_EXTRACT/project/logs" ]]; then
    info "Restoring service logs..."
    cp -r "$TEMP_EXTRACT/project/logs" "$PROJECT_DIR/"
fi

# 3. Restore services files (requires sudo)
info "Restoring systemd service configurations..."
for svc in digitaltwin healthbot; do
    if [[ -f "$TEMP_EXTRACT/systemd/${svc}.service" ]]; then
        sudo cp "$TEMP_EXTRACT/systemd/${svc}.service" "/etc/systemd/system/"
        sudo chmod 644 "/etc/systemd/system/${svc}.service"
    fi
done

sudo systemctl daemon-reload

# 4. Restore Nginx (requires sudo)
if [[ -f "$TEMP_EXTRACT/nginx/digitaltwin" ]]; then
    info "Restoring Nginx configuration..."
    sudo cp "$TEMP_EXTRACT/nginx/digitaltwin" "/etc/nginx/sites-available/"
    sudo ln -sf "/etc/nginx/sites-available/digitaltwin" "/etc/nginx/sites-enabled/digitaltwin"
    sudo systemctl reload nginx
fi

# 5. Restart services
info "Restarting services..."
sudo systemctl restart digitaltwin
if sudo systemctl is-enabled healthbot &>/dev/null; then
    sudo systemctl restart healthbot
fi

# Cleanup temp extract
rm -rf "$TEMP_EXTRACT"

ok "State restore from backup completed!"

# 6. Verify health
info "Running post-rollback verification checks..."
if "$DEPLOY_DIR/install/09_healthcheck.sh"; then
    ok "Rollback verified. System is running healthy!"
else
    warn "Rollback completed, but some post-deployment checks failed. Review system logs."
fi
