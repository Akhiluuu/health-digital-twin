#!/usr/bin/env bash
# =============================================================================
#  09_healthcheck.sh — Verify system health and API endpoints
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 9: Running Post-Deployment Health Checks"

PASS=0
FAIL=0

run_endpoint_check() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local timeout=15
    local resp=""
    
    info "Checking $name endpoint ($url)..."
    resp=$(curl -sLf --max-time "$timeout" "$url" 2>/dev/null || echo "UNREACHABLE")
    
    if echo "$resp" | grep -qi "$expected"; then
        ok "$name is healthy: $url (Reply contains: $expected)"
        PASS=$((PASS + 1))
    else
        warn "$name check failed at $url! (Got: ${resp:0:80})"
        FAIL=$((FAIL + 1))
    fi
}

# 2. Check Nginx routing to BioGears API
run_endpoint_check "Nginx BioGears Proxy" "http://127.0.0.1/health" "HEALTHY"

# 3. Check Healthbot (if model exists)
SHARD1="$MODEL_DIR/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
if [[ -s "$SHARD1" ]]; then
    # Give a bit of time for LLM initialization if it was just restarted
    info "Waiting for Healthbot model loading to complete..."
    for i in {1..12}; do
        if curl -sf "http://127.0.0.1:8001/health" &>/dev/null; then
            break
        fi
        sleep 5
    done
    run_endpoint_check "Health AI Direct API" "http://127.0.0.1:8001/health" "HEALTHY"
    run_endpoint_check "Nginx Health AI Proxy" "http://127.0.0.1/ai/health" "HEALTHY"
else
    warn "Skipped Health AI checks: LLM model shards not found."
fi

# 4. Check directory permissions
info "Checking directories write permissions..."
for dir in "$REPORT_DIR" "$CLINICAL_DIR" "$LOG_DIR"; do
    if mkdir -p "$dir" && touch "$dir/.test_write" 2>/dev/null; then
        rm -f "$dir/.test_write"
        ok "Directory is writable: $(basename "$dir")"
        PASS=$((PASS + 1))
    else
        warn "Directory is NOT writable: $(basename "$dir")"
        FAIL=$((FAIL + 1))
    fi
done

# 5. Output Summary
echo ""
info "--------------------------------------------------------"
info "Health Check Results: $PASS Passed, $FAIL Failed"
info "--------------------------------------------------------"

if [[ "$FAIL" -gt 0 ]]; then
    warn "One or more health checks failed. Check the logs at $CURRENT_LOG_FILE"
else
    ok "All deployment components verified healthy!"
fi
export DEPLOYMENT_SUCCESS=$(( FAIL == 0 ? 1 : 0 ))
