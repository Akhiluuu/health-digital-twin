#!/usr/bin/env bash
# =============================================================================
#  backup.sh — Core Backup utility
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "Creating System Backup"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"
TEMP_DIR="/tmp/vh_backup_${TIMESTAMP}"

mkdir -p "$TEMP_DIR"
mkdir -p "$TEMP_DIR/systemd"
mkdir -p "$TEMP_DIR/nginx"
mkdir -p "$TEMP_DIR/project"

info "Collecting configurations and state data..."

# Copy .env
if [[ -f "$PROJECT_DIR/.env" ]]; then
    cp "$PROJECT_DIR/.env" "$TEMP_DIR/project/.env"
fi

# Copy jobs store
if [[ -f "$PROJECT_DIR/biogears_service/jobs_store.json" ]]; then
    cp "$PROJECT_DIR/biogears_service/jobs_store.json" "$TEMP_DIR/project/jobs_store.json"
fi

# Copy logs
if [[ -d "$PROJECT_DIR/logs" ]]; then
    cp -r "$PROJECT_DIR/logs" "$TEMP_DIR/project/logs"
fi

# Copy reports
if [[ -d "$REPORT_DIR" ]]; then
    cp -r "$REPORT_DIR" "$TEMP_DIR/project/reports"
fi

# Copy clinical data
if [[ -d "$CLINICAL_DIR" ]]; then
    cp -r "$CLINICAL_DIR" "$TEMP_DIR/project/clinical_data"
fi

# Copy systemd service files
for svc in digitaltwin healthbot; do
    if [[ -f "/etc/systemd/system/${svc}.service" ]]; then
        cp "/etc/systemd/system/${svc}.service" "$TEMP_DIR/systemd/"
    fi
done

# Copy nginx config
if [[ -f "/etc/nginx/sites-available/digitaltwin" ]]; then
    cp "/etc/nginx/sites-available/digitaltwin" "$TEMP_DIR/nginx/"
fi

info "Compressing archive to $BACKUP_FILE ..."
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .

# Cleanup temp
rm -rf "$TEMP_DIR"

FILE_SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
ok "Backup created successfully! Location: $BACKUP_FILE (Size: $FILE_SIZE)"
echo "$BACKUP_FILE"
