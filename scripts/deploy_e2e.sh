#!/usr/bin/env bash
# ==============================================================================
# VitalHealth v6.0 Enterprise — E2E Networks Server Deployment Script
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==========================================================================="
echo "🚀 VITALHEALTH PHOS ENGINE — E2E NETWORKS DEPLOYMENT AUTOMATION"
echo "==========================================================================="
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Target Root Directory: $ROOT_DIR"
echo "==========================================================================="

cd "$ROOT_DIR"

# 1. System Package & Git Repository Verification
echo "🔍 [1/5] Checking system prerequisites and updating codebase..."
command -v python3 >/dev/null 2>&1 || { echo "❌ Python3 is required. Run: sudo apt update && sudo apt install -y python3 python3-venv python3-pip"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required."; exit 1; }

if [ -d ".git" ]; then
    echo "📥 Syncing codebase with GitHub origin/main..."
    git fetch origin main
    git reset --hard origin/main
fi

# 2. Virtual Environment Setup
echo "📦 [2/5] Initializing Python Virtual Environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Virtual environment created at $ROOT_DIR/venv"
fi

source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
echo "✅ Core dependencies installed."

# 3. Environment File Configuration
echo "⚙️ [3/5] Checking environment configuration (.env)..."
if [ ! -f ".env" ]; then
    echo "Creating default .env configuration file..."
    cat << 'EOF' > .env
PROJECT_NAME="VitalHealth Enterprise PHOS"
VERSION="6.0.0"
ENVIRONMENT="production"
DEBUG=False
PORT=8000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vitalhealth_v5"
REDIS_URL="redis://localhost:6379/0"
ENABLE_REDIS_CACHE=True
QDRANT_URL="http://localhost:6333"
QWEN_MODEL_PATH="models/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
EOF
    echo "✅ .env configuration generated."
fi

# 4. Verify Master Test Suite
echo "🧪 [4/5] Executing pre-deployment test suite..."
pip install pytest pytest-asyncio --quiet
export PYTHONPATH=.
python -m pytest healthbot_v4/tests/brain/test_phos_engine.py healthbot_v4/tests/api/test_v6_api_endpoints.py healthbot_v4/tests/brain/test_persistent_graph_sync.py --quiet

echo "✅ Pre-deployment test suite passed (100%)!"

# 5. Launch FastAPI Gateway Server
echo "🌐 [5/5] Launching PHOS FastAPI Server Gateway on Port 8000..."
echo "Stopping any existing server process on port 8000..."
if command -v docker >/dev/null 2>&1; then
    docker compose down 2>/dev/null || true
fi
PIDS=$(lsof -t -i:8000 2>/dev/null || pgrep -f "uvicorn" || true)
if [ -n "$PIDS" ]; then
    echo "Killing existing process(es): $PIDS"
    kill -9 $PIDS 2>/dev/null || true
    pkill -9 -f "uvicorn" 2>/dev/null || true
fi
sleep 2

echo "==========================================================================="
echo "🟢 VitalHealth PHOS Server is ready!"
echo "   • Interactive Swagger Docs: http://0.0.0.0:8000/docs"
echo "   • Health Check Endpoint:    http://0.0.0.0:8000/health"
echo "   • PHOS Reasoning Query:     http://0.0.0.0:8000/api/v6/brain/phos/query"
echo "==========================================================================="

nohup venv/bin/uvicorn healthbot_v4.apps.api.server:app --host 0.0.0.0 --port 8000 > uvicorn.log 2>&1 &

sleep 3
if pgrep -f "uvicorn healthbot_v4.apps.api.server:app" > /dev/null; then
    echo "🎉 Server started successfully in background (PID: $(pgrep -f 'uvicorn healthbot_v4.apps.api.server:app' | head -n 1))"
    echo "Log output available at: $ROOT_DIR/uvicorn.log"
else
    echo "⚠️ Server start check pending. Checking uvicorn.log..."
    tail -n 15 uvicorn.log
fi
