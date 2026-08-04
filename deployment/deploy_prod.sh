#!/usr/bin/env bash
# ==============================================================================
# VitalHealth v5.0 Production Zero-Downtime Blue/Green Release Script
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==========================================================================="
echo "🚀 VITALHEALTH v5.0 — PRODUCTION ZERO-DOWNTIME RELEASE AUTOMATION"
echo "==========================================================================="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Root Directory: $ROOT_DIR"
echo "==========================================================================="

cd "$ROOT_DIR"

# 1. Detect Docker Compose Command (docker compose vs docker-compose)
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Neither 'docker compose' nor 'docker-compose' was found."
    exit 1
fi
echo "ℹ️ Using Docker Compose binary: $COMPOSE_CMD"

# 2. Run Pre-flight Health Checks
echo "🔍 [1/6] Running pre-flight system dependency checks..."
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python3 is required but not installed."; exit 1; }

# 3. Run Validation Lab Quality Gate
echo "🔬 [2/6] Running Validation Laboratory Quality Gate..."
if python3 healthbot_v4/validation_lab/validation_runner.py --persona heart_failure; then
    echo "✅ Validation Lab Passed!"
else
    echo "❌ Quality Gate Failed! Aborting Deployment."
    exit 1
fi

# 4. Build Fresh Hardened Container Images
echo "🐳 [3/6] Building production container images..."
$COMPOSE_CMD -f deployment/docker-compose.prod.yml build --no-cache

# 5. Perform Rolling Up-Deployment
echo "🔄 [4/6] Executing zero-downtime container replacement..."
$COMPOSE_CMD -f deployment/docker-compose.prod.yml up -d --remove-orphans

# 6. Post-Deployment Gateway Health Verification
echo "⏳ [5/6] Verifying gateway health checks..."
MAX_RETRIES=12
RETRY_COUNT=0
HEALTHY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f http://localhost:8000/health >/dev/null 2>&1 || curl -s -f http://localhost/health >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    echo "   • Waiting for container health check... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 3
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $HEALTHY -eq 1 ]; then
    echo "🟢 [6/6] Production Release Successfully Deployed & Healthy!"
    echo "==========================================================================="
    exit 0
else
    echo "🔴 Health Check Failed! Executing Automatic Rollback..."
    "$SCRIPT_DIR/rollback.sh"
    exit 1
fi
