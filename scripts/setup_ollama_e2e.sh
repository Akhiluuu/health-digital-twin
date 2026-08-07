#!/usr/bin/env bash
# ===========================================================================
# 🤖 VITALHEALTH PHOS ENGINE — OLLAMA & QWEN2.5 MODEL SETUP AUTOMATION
# ===========================================================================
# This script installs/verifies Ollama and pulls the Qwen2.5 model for
# 100% local, high-speed LLM inference on the E2E production server.
# ===========================================================================

set -e

echo "==========================================================================="
echo "🤖 OLLAMA & QWEN2.5 MODEL SETUP — E2E PRODUCTION SERVER"
echo "==========================================================================="

# 1. Check if Ollama is installed
if ! command -v ollama >/dev/null 2>&1; then
    echo "📦 [1/4] Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "✅ [1/4] Ollama CLI is already installed ($(ollama --version))."
fi

# 2. Check if Ollama service is running
echo "🔍 [2/4] Verifying Ollama service status..."
if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "⚡ Starting Ollama service in background..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    sleep 3
fi

if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "✅ [2/4] Ollama service is active on http://127.0.0.1:11434"
else
    echo "❌ Failed to start Ollama service. Please check /tmp/ollama.log"
    exit 1
fi

# 3. Pull Qwen2.5-14B model (or fallback to 7B if requested)
MODEL_NAME="${1:-qwen2.5:14b}"
echo "📥 [3/4] Pulling local LLM model '${MODEL_NAME}' via Ollama..."
ollama pull "${MODEL_NAME}" || {
    echo "⚠️ Failed to pull ${MODEL_NAME}. Attempting fallback to qwen2.5:7b..."
    MODEL_NAME="qwen2.5:7b"
    ollama pull "${MODEL_NAME}"
}

# 4. Verify model availability via Ollama REST API
echo "🧪 [4/4] Verifying model registration in Ollama..."
TAGS=$(curl -s http://127.0.0.1:11434/api/tags)

if echo "$TAGS" | grep -q "qwen2.5"; then
    echo "==========================================================================="
    echo "🎉 OLLAMA SETUP COMPLETE!"
    echo "   • Status: Active on http://127.0.0.1:11434"
    echo "   • Models Available: ${MODEL_NAME}"
    echo "   • PHOS Reasoning Engine is now ready for 100% local GPU/CPU inference!"
    echo "==========================================================================="
else
    echo "❌ Model installation could not be verified in Ollama tags."
    exit 1
fi
