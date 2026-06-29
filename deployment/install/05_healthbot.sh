#!/usr/bin/env bash
# =============================================================================
#  05_healthbot.sh — Manage LLM model files
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 5: Setup LLM Chatbot Model (Qwen2.5-14B)"

MODEL_SHARDS=(
    "qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
    "qwen2.5-14b-instruct-q5_k_m-00002-of-00003.gguf"
    "qwen2.5-14b-instruct-q5_k_m-00003-of-00003.gguf"
)
HF_BASE="https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF/resolve/main"

mkdir -p "$MODEL_DIR"

# Check if all shards exist and are non-zero size
shards_present=1
for shard in "${MODEL_SHARDS[@]}"; do
    if [[ ! -s "$MODEL_DIR/$shard" ]]; then
        shards_present=0
        break
    fi
done

if [[ "$shards_present" -eq 1 ]]; then
    ok "All LLM model shards already present in $MODEL_DIR — skipping download."
else
    warn "LLM shards are missing or incomplete. Starting resumable download..."
    info "This will download ~9.8 GB of data. Downloads are resumable."

    cd "$MODEL_DIR"
    for shard in "${MODEL_SHARDS[@]}"; do
        if [[ ! -s "$shard" ]]; then
            info "Downloading shard: $shard ..."
            # Using -c flag for resumable downloads
            if ! wget -c --show-progress "${HF_BASE}/${shard}"; then
                fail "Failed to download model shard: $shard"
            fi
        else
            info "Shard $shard already completed."
        fi
    done
    cd "$PROJECT_DIR"
    ok "All model shards downloaded successfully."
fi
