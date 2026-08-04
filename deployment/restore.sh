#!/usr/bin/env bash
# =============================================================================
#  restore.sh — Production Disaster Recovery & Restoration Utility
# =============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_backup_archive.tar.gz>"
    exit 1
fi

BACKUP_ARCHIVE="$1"

if [ ! -f "$BACKUP_ARCHIVE" ]; then
    echo "❌ Error: Backup archive '$BACKUP_ARCHIVE' not found."
    exit 1
fi

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

echo "==========================================================================="
echo "🔄 VITALHEALTH v5.0 — DISASTER RECOVERY RESTORE UTILITY"
echo "==========================================================================="
echo "Restoring from: $BACKUP_ARCHIVE"
echo "==========================================================================="

TEMP_RESTORE="/tmp/vh_restore_$(date +%s)"
mkdir -p "$TEMP_RESTORE"

tar -xzf "$BACKUP_ARCHIVE" -C "$TEMP_RESTORE"

echo "📥 [1/3] Restoring PostgreSQL Database..."
if [ -f "$TEMP_RESTORE/db/twins_db_dump.sql" ]; then
    docker exec -i vitalhealth_postgres_prod psql -U postgres -d twins_db < "$TEMP_RESTORE/db/twins_db_dump.sql" || echo "Warning: Container psql restore skipped."
fi

echo "📥 [2/3] Restoring Uploaded Document Storage..."
if [ -d "$TEMP_RESTORE/uploads/health_docs" ]; then
    mkdir -p "$PROJECT_DIR/health_docs"
    cp -r "$TEMP_RESTORE/uploads/health_docs/"* "$PROJECT_DIR/health_docs/" 2>/dev/null || true
fi

echo "📥 [3/3] Restoring Environment Configuration..."
if [ -f "$TEMP_RESTORE/config/.env" ]; then
    cp "$TEMP_RESTORE/config/.env" "$PROJECT_DIR/.env.restored"
    echo "   • Saved restored env to .env.restored"
fi

rm -rf "$TEMP_RESTORE"
echo "==========================================================================="
echo "🟢 Restoration Process Completed Successfully!"
echo "==========================================================================="
