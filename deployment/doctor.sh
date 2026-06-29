#!/usr/bin/env bash
# =============================================================================
#  doctor.sh — Comprehensive system diagnostics tool
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "System Diagnostics (Dr. Aria Doctor Tool)"

# 1. OS Info
echo "--- OS and Kernel ---"
uname -a
detect_ubuntu
echo "----------------------"
echo ""

# 2. Resource Utilisation
echo "--- Resource Utilisation ---"
free -h
df -h "$PROJECT_DIR"
echo "CPU Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo "----------------------"
echo ""

# 3. Python Info
echo "--- Python Configuration ---"
detect_python
echo "BioGears Venv Python: $( "$BIOGEARS_VENV/bin/python" --version 2>/dev/null || echo "Broken/Missing" )"
echo "Healthbot Venv Python: $( "$HEALTHBOT_VENV/bin/python" --version 2>/dev/null || echo "Broken/Missing" )"
echo "----------------------"
echo ""

# 4. Service status
echo "--- Systemd Services ---"
for svc in digitaltwin healthbot nginx; do
    if systemctl is-active --quiet "$svc"; then
        echo -e "  $svc: ${GREEN}Active/Running${NC}"
    else
        echo -e "  $svc: ${RED}Inactive/Stopped${NC}"
    fi
done
echo "----------------------"
echo ""

# 5. Nginx verification
echo "--- Nginx Reverse Proxy ---"
if sudo nginx -t 2>&1; then
    echo -e "  Syntax test: ${GREEN}Passed${NC}"
else
    echo -e "  Syntax test: ${RED}Failed${NC}"
fi
echo "----------------------"
echo ""

# 6. LLM Model Check
echo "--- LLM Model Check (Qwen2.5-14B) ---"
if [[ -d "$MODEL_DIR" ]]; then
    ls -lh "$MODEL_DIR"
else
    echo -e "  Model directory: ${RED}Missing${NC}"
fi
echo "----------------------"
echo ""

# 7. BioGears Runtime Check
echo "--- BioGears Runtime ---"
BGCLI="$RUNTIME_DIR/bg-cli"
if [[ -x "$BGCLI" ]]; then
    echo -e "  bg-cli: ${GREEN}Executable${NC}"
    echo "  Version details:"
    # Run a simple version command or test it with correct LD_LIBRARY_PATH
    LD_LIBRARY_PATH="$RUNTIME_DIR/lib:$RUNTIME_DIR/bin" "$BGCLI" --help | head -n 3 || true
else
    echo -e "  bg-cli: ${RED}Missing/Not Executable${NC}"
fi
echo "----------------------"
echo ""

# 8. Environment config check
echo "--- Environment Configuration ---"
if [[ -f "$PROJECT_DIR/.env" ]]; then
    PERMS=$(stat -c "%a" "$PROJECT_DIR/.env")
    if [[ "$PERMS" -eq 600 ]]; then
        echo -e "  .env permissions: ${GREEN}Secure ($PERMS)${NC}"
    else
        echo -e "  .env permissions: ${YELLOW}Insecure ($PERMS)${NC} (run chmod 600 .env)"
    fi
    API_KEY=$(grep "DIGITAL_TWIN_API_KEY" "$PROJECT_DIR/.env" | cut -d'=' -f2- || echo "Missing")
    echo "  API Key Present: yes (${API_KEY:0:8}...)"
else
    echo -e "  .env configuration: ${RED}Missing${NC}"
fi
echo "----------------------"
echo ""

# 9. Recent logs
echo "--- BioGears Service Logs (Last 10 lines) ---"
sudo journalctl -u digitaltwin -n 10 --no-pager || true
echo "----------------------"
echo ""

echo "--- Healthbot Service Logs (Last 10 lines) ---"
sudo journalctl -u healthbot -n 10 --no-pager || true
echo "----------------------"
echo ""

ok "Diagnostics completed."
