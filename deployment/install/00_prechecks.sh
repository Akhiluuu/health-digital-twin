#!/usr/bin/env bash
# =============================================================================
#  00_prechecks.sh — Pre-deployment validation and resource checks
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 0: Pre-deployment Checks"

# 1. EUID guard
if [[ "$EUID" -eq 0 ]]; then
    fail "Do not run the deployment scripts directly as root. Run as a regular user with sudo privileges."
fi

# 2. Check System Resources
info "Checking system resource capacities..."
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
CPU_CORES=$(nproc)
DISK_FREE_GB=$(df -P "$PROJECT_DIR" | tail -1 | awk '{print $4/1024/1024}')

info "System Resources: RAM: ${TOTAL_RAM_GB}GB, CPU Cores: ${CPU_CORES}, Disk Free: ${DISK_FREE_GB%.*}GB"

if (( TOTAL_RAM_GB < 4 )); then
    warn "Low memory detected (${TOTAL_RAM_GB}GB). A minimum of 8GB is recommended for GGUF LLM execution."
fi

if (( CPU_CORES < 2 )); then
    warn "Only 1 CPU core detected. BioGears simulation and LLM service perform best with multiple cores."
fi

# We need about 15GB of disk space if downloading Qwen model (9.8GB) + BioGears runtime (1GB) + packages
if (( ${DISK_FREE_GB%.*} < 15 )); then
    warn "Low disk space detected (${DISK_FREE_GB%.*}GB free). Ensure you have at least 15GB of free space."
fi

# 3. Check internet connectivity
info "Checking internet connectivity..."
if ! curl -sf --connect-timeout 5 https://huggingface.co >/dev/null; then
    warn "Hugging Face is unreachable. Model downloads may fail."
fi

if ! curl -sf --connect-timeout 5 https://github.com >/dev/null; then
    warn "GitHub is unreachable. Package/repo updates may fail."
fi

ok "Pre-deployment checks complete."
