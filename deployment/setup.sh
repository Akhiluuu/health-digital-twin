#!/usr/bin/env bash
# =============================================================================
#  VitalHealth Digital Twin — E2E Cloud Deployment Script
#  Tested on: Ubuntu 22.04 LTS (8-core VM, 16 GB RAM)
#
#  Usage:
#    chmod +x deployment/setup.sh
#    ./deployment/setup.sh
#
#  What this script deploys:
#    ┌─────────────────────────────────────────────────────────┐
#    │  Mobile App (Android/iOS)                               │
#    │       │                                                 │
#    │       ▼                                                 │
#    │  Nginx (port 80)                                        │
#    │    /      → BioGears Simulation API  (port 8000)        │
#    │    /ai/   → Health AI Dr. Aria       (port 8001)        │
#    └─────────────────────────────────────────────────────────┘
#
#  Services installed:
#    • digitaltwin.service  — BioGears physiological simulation (FastAPI)
#    • healthbot.service    — Dr. Aria Health AI chatbot (FastAPI + LLM)
#
#  IMPORTANT — LLM Model files:
#    The Qwen2.5-14B GGUF model (~9.8 GB) must be placed manually at:
#      health-digital-twin/healthbot/model/
#    before starting the healthbot service.
#    Download from: https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; NC="\033[0m"
ok()      { echo -e "${GREEN}  ✔  $*${NC}"; }
info()    { echo -e "${CYAN}  →  $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠  $*${NC}"; }
fail()    { echo -e "${RED}  ✘  $*${NC}"; exit 1; }
section() { echo -e "\n${YELLOW}━━━  $*  ━━━${NC}"; }

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-detect if script is in project root or deployment/ folder
if [[ -f "$SCRIPT_DIR/requirements.txt" ]]; then
    PROJECT_DIR="$SCRIPT_DIR"
    DEPLOY_DIR="$SCRIPT_DIR/deployment"
else
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    DEPLOY_DIR="$SCRIPT_DIR"
fi

BIOGEARS_VENV="$PROJECT_DIR/venv"
HEALTHBOT_VENV="$PROJECT_DIR/healthbot_venv"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         VitalHealth Digital Twin — Cloud Setup               ║"
echo "║         Project : $PROJECT_DIR"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Guard: must not run as root ────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] && fail "Run as a regular user (ubuntu), not root. Use sudo where needed."

# ══════════════════════════════════════════════════════════════════════════════
section "Step 1/10 — System packages"
# ══════════════════════════════════════════════════════════════════════════════
info "Updating package index and installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    git curl wget unzip sqlite3 htop tmux \
    python3.11 python3.11-venv python3-pip \
    nginx \
    build-essential libssl-dev libffi-dev libsqlite3-dev \
    tesseract-ocr tesseract-ocr-eng \
    libgl1 libglib2.0-0
ok "System packages installed."

# ══════════════════════════════════════════════════════════════════════════════
section "Step 2/10 — Python virtual environments"
# ══════════════════════════════════════════════════════════════════════════════
# Two separate venvs because BioGears and Healthbot have conflicting
# dependency versions (different fastapi, pydantic, numpy).

info "Creating BioGears venv at $BIOGEARS_VENV ..."
python3.11 -m venv "$BIOGEARS_VENV"
ok "BioGears venv ready."

info "Creating Healthbot venv at $HEALTHBOT_VENV ..."
python3.11 -m venv "$HEALTHBOT_VENV"
ok "Healthbot venv ready."

# ══════════════════════════════════════════════════════════════════════════════
section "Step 3/10 — Python dependencies"
# ══════════════════════════════════════════════════════════════════════════════
info "Installing BioGears dependencies..."
source "$BIOGEARS_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/requirements.txt" -q
deactivate
ok "BioGears dependencies installed."

info "Installing Healthbot dependencies..."
source "$HEALTHBOT_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/healthbot/requirements.txt" -q

# Install llama-cpp-python — detect GPU and compile accordingly
info "Installing llama-cpp-python (LLM inference engine)..."
if command -v nvcc &>/dev/null || ls /dev/nvidia* &>/dev/null 2>&1; then
    warn "NVIDIA GPU detected — building with CUDA support (this may take 5-10 min)..."
    CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --no-cache-dir -q
    ok "llama-cpp-python installed with CUDA support."
else
    warn "No GPU detected — installing CPU-only llama-cpp-python..."
    pip install llama-cpp-python --no-cache-dir -q
    ok "llama-cpp-python installed (CPU mode — inference will be slower)."
fi
deactivate
ok "Healthbot dependencies installed."

# ══════════════════════════════════════════════════════════════════════════════
section "Step 4/10 — Import path symlink (health_ai → healthbot)"
# ══════════════════════════════════════════════════════════════════════════════
# The source code imports from 'health_ai.*' but the package folder is
# 'healthbot/'. We create a symlink so Python can resolve both names.
SYMLINK="$PROJECT_DIR/health_ai"
if [[ -L "$SYMLINK" ]]; then
    ok "Symlink health_ai → healthbot already exists."
elif [[ -e "$SYMLINK" ]]; then
    warn "health_ai path exists but is not a symlink — skipping."
else
    ln -s "$PROJECT_DIR/healthbot" "$SYMLINK"
    ok "Created symlink: health_ai → healthbot"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Step 5/10 — Environment configuration"
# ══════════════════════════════════════════════════════════════════════════════
ENV_FILE="$PROJECT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
    warn ".env already exists — skipping to protect existing config."
    warn "Edit manually if needed: nano $ENV_FILE"
else
    GENERATED_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    VM_IP_FOR_ENV=$(hostname -I | awk '{print $1}')
    cat > "$ENV_FILE" << ENVEOF
# ── VitalHealth Cloud Config ──────────────────────────────────────────────────
# Generated by setup.sh on $(date)
# KEEP THIS FILE SECRET — never commit to git

DIGITAL_TWIN_API_KEY=${GENERATED_KEY}
SIM_RATE_LIMIT=10
SIM_RATE_WINDOW=3600
BIOGEARS_BIN_DIR=${PROJECT_DIR}/biogears_runtime
# Public URL of this VM — used to build async job poll URLs returned to the mobile app
SERVER_BASE_URL=http://${VM_IP_FOR_ENV}
# BioGears engine max runtime per simulation (seconds). 86400 = 24 hours.
ENGINE_TIMEOUT_SECONDS=86400
ENGINE_HEARTBEAT_SECONDS=30
ENVEOF
    chmod 600 "$ENV_FILE"
    ok ".env created."
    echo ""
    echo "  ┌──────────────────────────────────────────────────────────┐"
    echo "  │  🔑  API KEY (save this — enter it in the mobile app)    │"
    echo "  │  ${GENERATED_KEY}  │"
    echo "  └──────────────────────────────────────────────────────────┘"
    echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Step 6/10 — BioGears runtime"
# ══════════════════════════════════════════════════════════════════════════════
RUNTIME_DIR="$PROJECT_DIR/biogears_runtime"
BGCLI="$RUNTIME_DIR/bg-cli"

if [[ -f "$BGCLI" ]]; then
    ok "BioGears runtime already present at $RUNTIME_DIR"
else
    warn "BioGears runtime not found — downloading official Linux v7.3.2 release..."
    mkdir -p "$RUNTIME_DIR"
    BIOGEARS_URL="https://github.com/BioGearsEngine/core/releases/download/7.3.2/Biogears-7.3.2-ubuntu_16.04-gcc5.tgz"
                  
    wget -q --show-progress -O /tmp/biogears.tgz "$BIOGEARS_URL"
    tar -xzf /tmp/biogears.tgz --strip-components=1 -C "$RUNTIME_DIR"
    rm /tmp/biogears.tgz
    
    # Symlink binaries and required data files to root so the engine can locate them
    cd "$RUNTIME_DIR"
    ln -sf bin/bg-cli bg-cli
    ln -sf bin/bg-scenario bg-scenario
    ln -sf share/biogears/7.3.2/xsd xsd
    for item in share/biogears/7.3.2/data/*; do
        ln -sf "$item" "$(basename "$item")"
    done
    cd "$PROJECT_DIR"
    
    ok "BioGears runtime downloaded and extracted."
fi

chmod +x "$BGCLI"
ok "BioGears runtime verified (bg-cli is executable)."

# ══════════════════════════════════════════════════════════════════════════════
section "Step 7/10 — LLM model download (Qwen2.5-14B GGUF)"
# ══════════════════════════════════════════════════════════════════════════════
# Model is split into 3 shards (~3 GB each, ~9.8 GB total).
# wget -c = resumable: safe to re-run if download was interrupted.
MODEL_DIR="$PROJECT_DIR/healthbot/model"
MODEL_SHARD1="$MODEL_DIR/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
HF_BASE="https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF/resolve/main"

mkdir -p "$MODEL_DIR"

if [[ -f "$MODEL_SHARD1" ]]; then
    ok "LLM model shards already present in $MODEL_DIR — skipping download."
else
    warn "Downloading Qwen2.5-14B model (~9.8 GB total). This will take a while..."
    echo "  Downloads are resumable — safe to Ctrl+C and re-run setup.sh."
    echo ""

    cd "$MODEL_DIR"

    info "Downloading shard 1/3..."
    wget -c --show-progress \
        "${HF_BASE}/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"

    info "Downloading shard 2/3..."
    wget -c --show-progress \
        "${HF_BASE}/qwen2.5-14b-instruct-q5_k_m-00002-of-00003.gguf"

    info "Downloading shard 3/3..."
    wget -c --show-progress \
        "${HF_BASE}/qwen2.5-14b-instruct-q5_k_m-00003-of-00003.gguf"

    cd "$PROJECT_DIR"

    if [[ -f "$MODEL_SHARD1" ]]; then
        ok "All 3 model shards downloaded successfully."
    else
        warn "Model download may have failed. Check $MODEL_DIR and re-run if needed."
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Step 8/10 — Systemd services"
# ══════════════════════════════════════════════════════════════════════════════

# ── Patch service files with the actual project path ──────────────────────────
# (Service files reference /home/ubuntu/health-digital-twin and user ubuntu by default)
CURRENT_USER=$(whoami)
CURRENT_GROUP=$(id -gn)

for SVC_TEMPLATE in digitaltwin.service healthbot.service; do
    sed -e "s|/home/ubuntu/health-digital-twin|${PROJECT_DIR}|g" \
        -e "s|User=ubuntu|User=${CURRENT_USER}|g" \
        -e "s|Group=ubuntu|Group=${CURRENT_GROUP}|g" \
        "$DEPLOY_DIR/$SVC_TEMPLATE" \
        > "/tmp/$SVC_TEMPLATE"
    sudo cp "/tmp/$SVC_TEMPLATE" "/etc/systemd/system/$SVC_TEMPLATE"
done

sudo systemctl daemon-reload

# ── BioGears service ──────────────────────────────────────────────────────────
info "Starting digitaltwin.service (BioGears API)..."
sudo systemctl enable digitaltwin
sudo systemctl restart digitaltwin
sleep 3

if sudo systemctl is-active --quiet digitaltwin; then
    ok "digitaltwin.service is running."
else
    warn "digitaltwin.service failed to start."
    echo "  Logs: journalctl -u digitaltwin -n 50"
fi

# ── Healthbot service ─────────────────────────────────────────────────────────
if [[ -f "$MODEL_SHARD1" ]]; then
    info "Starting healthbot.service (Health AI)..."
    sudo systemctl enable healthbot
    sudo systemctl restart healthbot
    sleep 5  # Model loading takes a few seconds

    if sudo systemctl is-active --quiet healthbot; then
        ok "healthbot.service is running."
    else
        warn "healthbot.service failed to start."
        echo "  Logs: journalctl -u healthbot -n 50"
    fi
else
    warn "Skipping healthbot.service start — model files not present."
    warn "After copying model files, run: sudo systemctl start healthbot"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Step 9/10 — Nginx reverse proxy"
# ══════════════════════════════════════════════════════════════════════════════
# Patch the project path into nginx.conf (same placeholder as service files)
sed "s|/home/ubuntu/health-digital-twin|${PROJECT_DIR}|g" \
    "$DEPLOY_DIR/nginx.conf" > /tmp/digitaltwin.nginx.conf
sudo cp /tmp/digitaltwin.nginx.conf /etc/nginx/sites-available/digitaltwin
sudo ln -sf /etc/nginx/sites-available/digitaltwin /etc/nginx/sites-enabled/digitaltwin
sudo rm -f /etc/nginx/sites-enabled/default

if sudo nginx -t 2>/dev/null; then
    sudo systemctl enable nginx
    sudo systemctl reload nginx
    ok "Nginx configured and reloaded."
else
    fail "Nginx config test failed. Run: sudo nginx -t"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Step 10/10 — Health checks & validation"
# ══════════════════════════════════════════════════════════════════════════════
sleep 2
PASS=0; FAIL=0

run_check() {
    local NAME="$1" URL="$2" EXPECT="$3"
    local RESP
    RESP=$(curl -sf --max-time 10 "$URL" 2>/dev/null || echo "UNREACHABLE")
    if echo "$RESP" | grep -q "$EXPECT"; then
        ok "[$NAME] $URL — OK"
        PASS=$((PASS + 1))
    else
        warn "[$NAME] $URL — FAILED (got: ${RESP:0:80})"
        FAIL=$((FAIL + 1))
    fi
}

run_check "BioGears /health"    "http://localhost:8000/health"     "healthy"
run_check "Nginx → BioGears"   "http://localhost/health"          "healthy"

if [[ -f "$MODEL_SHARD1" ]]; then
    run_check "HealthAI /health"    "http://localhost:8001/health"    "ok"
    run_check "Nginx → HealthAI"   "http://localhost/ai/health"      "ok"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
VM_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
if [[ $FAIL -eq 0 ]]; then
echo -e "║  ${GREEN}✅  All checks passed ($PASS/$PASS)${NC}                               ║"
else
echo -e "║  ${YELLOW}⚠   $PASS passed, $FAIL failed — see warnings above${NC}              ║"
fi
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Deployment Summary                                              ║"
echo "║                                                                  ║"
echo "║  BioGears API   → http://$VM_IP:8000  (or http://$VM_IP/)"
echo "║  Health AI      → http://$VM_IP:8001  (or http://$VM_IP/ai/)"
echo "║                                                                  ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Mobile App Setup                                                ║"
echo "║    Open VitalHealth → Settings → Server Configuration           ║"
echo "║    Enter your VM IP: $VM_IP                          ║"
echo "║                                                                  ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Useful commands                                                 ║"
echo "║    journalctl -u digitaltwin -f    # BioGears live logs         ║"
echo "║    journalctl -u healthbot -f      # Health AI live logs        ║"
echo "║    sudo systemctl status digitaltwin healthbot nginx             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
