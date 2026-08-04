#!/usr/bin/env bash
# ==============================================================================
# VitalHealth v5.0 Emergency Deployment Rollback Script
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==========================================================================="
echo "🔴 VITALHEALTH v5.0 — EMERGENCY ROLLBACK AUTOMATION"
echo "==========================================================================="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"

cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

echo "🔄 Restoring stable container state..."
$COMPOSE_CMD -f deployment/docker-compose.prod.yml down --remove-orphans || true
$COMPOSE_CMD -f deployment/docker-compose.prod.yml up -d --no-build

echo "🔍 Verifying rollback status..."
sleep 5
if curl -s -f http://localhost:8000/health >/dev/null 2>&1 || curl -s -f http://localhost/health >/dev/null 2>&1; then
    echo "🟢 Rollback Complete: System Restored to Previous Healthy State."
    exit 0
else
    echo "⚠️ Warning: Rollback completed but health check returned non-200. Manual inspection required."
    exit 1
fi
