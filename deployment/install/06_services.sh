#!/usr/bin/env bash
# =============================================================================
#  06_services.sh — Setup environment config and systemd services
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 6: Configure Environment and Systemd Services"

ENV_FILE="$PROJECT_DIR/.env"

# 1. Manage .env file
if [[ -f "$ENV_FILE" ]]; then
    info "Existing .env file detected at $ENV_FILE. Validating variables..."
    
    # Read existing key or generate if missing
    if ! grep -q "DIGITAL_TWIN_API_KEY" "$ENV_FILE"; then
        GENERATED_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_hex(32))")
        echo "DIGITAL_TWIN_API_KEY=${GENERATED_KEY}" >> "$ENV_FILE"
        info "Added missing DIGITAL_TWIN_API_KEY to .env"
    fi
    
    if ! grep -q "BIOGEARS_BIN_DIR" "$ENV_FILE"; then
        echo "BIOGEARS_BIN_DIR=${RUNTIME_DIR}" >> "$ENV_FILE"
        info "Added BIOGEARS_BIN_DIR to .env"
    fi

    if ! grep -q "SERVER_BASE_URL" "$ENV_FILE"; then
        VM_IP=$(hostname -I | awk '{print $1}')
        echo "SERVER_BASE_URL=http://${VM_IP}" >> "$ENV_FILE"
        info "Added SERVER_BASE_URL to .env"
    fi
else
    info "No .env file found. Creating default..."
    GENERATED_KEY=$("$PYTHON_BIN" -c "import secrets; print(secrets.token_hex(32))")
    VM_IP=$(hostname -I | awk '{print $1}')
    
    cat > "$ENV_FILE" << ENVEOF
# ── VitalHealth Cloud Config ──────────────────────────────────────────────────
# Generated dynamically on $(date)
# KEEP THIS FILE SECRET — never commit to git

DIGITAL_TWIN_API_KEY=${GENERATED_KEY}
SIM_RATE_LIMIT=10
SIM_RATE_WINDOW=3600
BIOGEARS_BIN_DIR=${RUNTIME_DIR}
SERVER_BASE_URL=http://${VM_IP}
ENGINE_TIMEOUT_SECONDS=86400
ENGINE_HEARTBEAT_SECONDS=30
ENVEOF
    info "Created new .env with API key."
fi

# Secure the .env file permissions
chmod 600 "$ENV_FILE"
ok ".env file configured and secured."

# 2. Patch and install systemd services
info "Patching systemd unit files from templates..."
detect_user

for service_name in digitaltwin healthbot; do
    TEMPLATE_PATH="$DEPLOY_DIR/templates/${service_name}.service"
    SYSTEMD_PATH="/etc/systemd/system/${service_name}.service"
    
    if [[ ! -f "$TEMPLATE_PATH" ]]; then
        fail "Template for service $service_name is missing at $TEMPLATE_PATH"
    fi

    # Replace placeholders and write to systemd directory using sudo
    sudo sed -e "s|{{USER}}|${CURRENT_USER}|g" \
             -e "s|{{GROUP}}|${CURRENT_GROUP}|g" \
             -e "s|{{PROJECT_DIR}}|${PROJECT_DIR}|g" \
             "$TEMPLATE_PATH" | sudo tee "$SYSTEMD_PATH" > /dev/null
             
    sudo chmod 644 "$SYSTEMD_PATH"
    info "Service unit $service_name installed."
done

info "Reloading systemd daemon..."
sudo systemctl daemon-reload

# 3. Enable and start services
info "Enabling and starting digitaltwin service..."
sudo systemctl enable digitaltwin
sudo systemctl restart digitaltwin

# Only start healthbot if model file is downloaded
SHARD1="$MODEL_DIR/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
if [[ -s "$SHARD1" ]]; then
    info "Enabling and starting healthbot service..."
    sudo systemctl enable healthbot
    sudo systemctl restart healthbot
else
    warn "Skipped starting healthbot service because LLM model files are missing or incomplete."
fi

ok "Systemd services successfully setup."
