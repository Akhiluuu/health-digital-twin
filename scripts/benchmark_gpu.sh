#!/usr/bin/env bash
# ===========================================================================
# 🚀 VITALHEALTH PHOS ENGINE — GPU ACCELERATION BENCHMARK
# ===========================================================================
# Inspects NVIDIA GPU VRAM, CUDA status, Ollama layer offloading, and
# benchmarks Qwen2.5-14B inference speed (tokens/sec).
# ===========================================================================

set -e

echo "==========================================================================="
echo "🎮 GPU ACCELERATION & INFERENCE BENCHMARK — E2E PRODUCTION SERVER"
echo "==========================================================================="

# 1. Inspect NVIDIA GPU hardware & VRAM
echo "🔍 [1/4] Checking NVIDIA GPU Hardware & VRAM status..."
if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,memory.free --format=csv
else
    echo "ℹ️ nvidia-smi not available (CPU inference mode or containerized driver)."
fi

# 2. Check active models running in Ollama VRAM
echo ""
echo "📊 [2/4] Inspecting active model VRAM allocation in Ollama..."
curl -s http://127.0.0.1:11434/api/ps | grep -o '"name":"[^"]*"' || echo "No active model currently loaded in VRAM."

# 3. Warmup & execute inference benchmark
MODEL="qwen2.5:14b"
echo ""
echo "⚡ [3/4] Running 14B LLM Benchmark Query via Ollama..."
echo "Query: 'Summarize clinical management of Type 2 Diabetes in 100 words.'"

START_TIME=$(date +%s%3N)
RESPONSE=$(curl -s http://127.0.0.1:11434/api/generate -d "{
  \"model\": \"${MODEL}\",
  \"prompt\": \"Summarize clinical management of Type 2 Diabetes in 100 words.\",
  \"stream\": false,
  \"options\": { \"num_predict\": 256 }
}")
END_TIME=$(date +%s%3N)

# 4. Extract token counts and calculate tokens/sec speed
TOTAL_DURATION=$(echo "$RESPONSE" | grep -o '"total_duration":[0-9]*' | cut -d: -f2 || echo "0")
EVAL_COUNT=$(echo "$RESPONSE" | grep -o '"eval_count":[0-9]*' | cut -d: -f2 || echo "0")
EVAL_DURATION=$(echo "$RESPONSE" | grep -o '"eval_duration":[0-9]*' | cut -d: -f2 || echo "1")

ELAPSED_MS=$((END_TIME - START_TIME))

if [ "$EVAL_DURATION" -gt 0 ] && [ "$EVAL_COUNT" -gt 0 ]; then
    # Calculate tokens per second (eval_count / (eval_duration in seconds))
    TPS=$(python3 -c "print(round(${EVAL_COUNT} / (${EVAL_DURATION} / 1e9), 2))" 2>/dev/null || echo "N/A")
else
    TPS="N/A"
fi

echo "==========================================================================="
echo "📊 BENCHMARK RESULTS"
echo "==========================================================================="
echo "   • Model:                ${MODEL}"
echo "   • Total Latency:        ${ELAPSED_MS} ms"
echo "   • Tokens Generated:     ${EVAL_COUNT} tokens"
echo "   • Inference Speed:      ${TPS} tokens/second"
echo "==========================================================================="
