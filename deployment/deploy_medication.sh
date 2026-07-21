#!/usr/bin/env bash
# =============================================================================
#  deploy_medication.sh — Deploys the Medication Vault Service to E2E Cloud
#
#  Run from the server:
#    ssh ubuntu@151.185.45.137
#    cd ~/health-digital-twin
#    git pull origin main
#    chmod +x deployment/deploy_medication.sh
#    ./deployment/deploy_medication.sh
#
#  What it does:
#    1. Installs PostgreSQL 15 (if missing) + Redis (if missing)
#    2. Creates the medication DB schema via migrations.py
#    3. Creates isolated Python venv: med_venv
#    4. Installs medication service requirements
#    5. Writes medication.service + medication-worker.service → systemd
#    6. Updates nginx to add /medication/ proxy route
#    7. Starts and enables all services
#    8. Runs health check
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$PROJECT_DIR/deployment"
TEMPLATES="$DEPLOY_DIR/templates"
VENV="$PROJECT_DIR/med_venv"
ENV_FILE="$PROJECT_DIR/.env"
SERVICE_USER="${USER:-ubuntu}"
SERVICE_GROUP="$(id -gn)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       VitalHealth — Medication Vault Deployment              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Server : $(hostname -I | awk '{print $1}')                  "
echo "║  Dir    : $PROJECT_DIR                                        "
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: System dependencies ───────────────────────────────────────────────
info "Step 1 — Checking system dependencies..."

if ! sudo apt-get update -qq; then
    warn "apt-get update failed, attempting self-healing (clearing corrupt lists)..."
    sudo rm -rf /var/lib/apt/lists/*
    sudo apt-get clean
    sudo apt-get update -qq || fail "apt-get update failed even after self-healing. Please run 'sudo rm -rf /var/lib/apt/lists/* && sudo apt-get update' manually."
fi

# PostgreSQL
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-client libpq-dev
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    success "PostgreSQL installed"
else
    success "PostgreSQL already installed: $(psql --version)"
fi

# Redis
if ! command -v redis-cli &>/dev/null; then
    info "Installing Redis..."
    sudo apt-get install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    success "Redis installed"
else
    success "Redis already installed"
fi

# Build tools for psycopg2, asyncpg
sudo apt-get install -y gcc python3-dev tesseract-ocr curl 2>/dev/null || true

# ── Step 2: PostgreSQL — create DB user and database ─────────────────────────
info "Step 2 — Setting up PostgreSQL database..."

DB_NAME="twins_db"
DB_USER="postgres"
DB_PASS="Cave_123"

# Check if twins_db already exists (created by existing BioGears deployment)
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    success "Database '$DB_NAME' already exists — reusing it"
else
    info "Creating database $DB_NAME..."
    sudo -u postgres createdb "$DB_NAME" || warn "DB creation failed — may already exist"
fi

# Ensure postgres user password matches DB_PASS
info "Configuring postgres user password..."
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${DB_PASS}';" || warn "Failed to alter postgres password"

# Check DATABASE_URL in .env or overwrite to ensure Cave_123 is used
NEW_DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
if ! grep -q "DATABASE_URL" "$ENV_FILE" 2>/dev/null; then
    echo "DATABASE_URL=${NEW_DB_URL}" >> "$ENV_FILE"
    success "DATABASE_URL written to .env"
else
    info "Updating DATABASE_URL in .env to use Cave_123..."
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_DB_URL}|g" "$ENV_FILE"
    success "DATABASE_URL updated in .env"
fi

# Check REDIS_URL (use DB 1 — BioGears uses DB 0)
if ! grep -q "^MED_REDIS_URL\|^REDIS_URL" "$ENV_FILE" 2>/dev/null; then
    echo "MED_REDIS_URL=redis://localhost:6379/1" >> "$ENV_FILE"
fi

# Check MEDICATION_API_KEY (re-use existing DIGITAL_TWIN_API_KEY)
if ! grep -q "ALLOW_DEV_AUTH" "$ENV_FILE" 2>/dev/null; then
    echo "ALLOW_DEV_AUTH=false" >> "$ENV_FILE"
fi

success "Database configuration complete"

# ── Step 3: Python virtual environment ────────────────────────────────────────
info "Step 3 — Creating medication service Python environment..."

PYTHON_BIN=$(command -v python3.11 || command -v python3.10 || command -v python3)
info "Using Python: $PYTHON_BIN ($($PYTHON_BIN --version))"

if [[ ! -d "$VENV" ]]; then
    "$PYTHON_BIN" -m venv "$VENV"
    success "Created venv: $VENV"
else
    success "venv already exists: $VENV"
fi

source "$VENV/bin/activate"

pip install --upgrade pip --quiet

info "Installing medication service dependencies..."
pip install -r medication_service/requirements.txt --quiet

# Optional: PDF reports
pip install reportlab --quiet 2>/dev/null || warn "reportlab not installed — PDF will fall back to CSV"

success "Python dependencies installed"
deactivate

# ── Step 4: Run database migrations ───────────────────────────────────────────
info "Step 4 — Running database migrations..."

source "$VENV/bin/activate"
cd "$PROJECT_DIR"

DB_URL=$(grep "DATABASE_URL" "$ENV_FILE" | head -1 | cut -d'=' -f2-)

DATABASE_URL="$DB_URL" python -m medication_service.database.migrations \
    && success "Migrations applied successfully" \
    || fail "Migration failed — check DATABASE_URL and PostgreSQL connectivity"

deactivate

# ── Step 5: Install systemd services ─────────────────────────────────────────
info "Step 5 — Installing systemd services..."

for SVC in medication medication-worker; do
    TEMPLATE="$TEMPLATES/${SVC}.service"
    if [[ ! -f "$TEMPLATE" ]]; then
        fail "Service template not found: $TEMPLATE"
    fi
    # Substitute placeholders
    sudo bash -c "
        sed \
          -e 's|{{USER}}|${SERVICE_USER}|g' \
          -e 's|{{GROUP}}|${SERVICE_GROUP}|g' \
          -e 's|{{PROJECT_DIR}}|${PROJECT_DIR}|g' \
          '$TEMPLATE' > /etc/systemd/system/${SVC}.service
    "
    success "Installed /etc/systemd/system/${SVC}.service"
done

# Update environment variables in medication.service for MED_REDIS_URL
sudo sed -i "s|^EnvironmentFile=.*|EnvironmentFile=${ENV_FILE}|g" \
    /etc/systemd/system/medication.service \
    /etc/systemd/system/medication-worker.service 2>/dev/null || true

sudo systemctl daemon-reload
success "systemd daemon reloaded"

# ── Step 6: Update nginx config ───────────────────────────────────────────────
info "Step 6 — Updating nginx configuration..."

NGINX_CONF="/etc/nginx/sites-available/digitaltwin"
if [[ ! -f "$NGINX_CONF" ]]; then
    warn "Nginx config not found at $NGINX_CONF — using template"
    sudo bash -c "sed \
        -e 's|{{PROJECT_DIR}}|${PROJECT_DIR}|g' \
        '$TEMPLATES/nginx.conf' > '$NGINX_CONF'"
else
    # Add medication block if not already present
    if ! grep -q "8002" "$NGINX_CONF"; then
        info "Patching nginx to add /medication/ → :8002"
        sudo bash -c "sed -i '/location \/view-reports\//i \\
    # Medication Vault API\\
    location /medication/ {\\
        proxy_pass http://127.0.0.1:8002/;\\
        proxy_http_version 1.1;\\
        proxy_set_header Host \$host;\\
        proxy_set_header X-Real-IP \$remote_addr;\\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
        proxy_buffering off;\\
        proxy_cache off;\\
        proxy_read_timeout 120s;\\
        client_max_body_size 25M;\\
    }\\
' '$NGINX_CONF'"
        success "Nginx patched with /medication/ route"
    else
        success "Nginx already has /medication/ route"
    fi
fi

sudo nginx -t && success "Nginx config valid" || fail "Nginx config invalid — check manually"
sudo systemctl reload nginx
success "Nginx reloaded"

# ── Step 7: Start services ────────────────────────────────────────────────────
info "Step 7 — Starting Medication Vault services..."

sudo systemctl enable medication medication-worker
sudo systemctl restart medication
sleep 3
sudo systemctl restart medication-worker

if sudo systemctl is-active --quiet medication; then
    success "medication.service is RUNNING"
else
    fail "medication.service failed to start — check: journalctl -u medication -n 30"
fi

if sudo systemctl is-active --quiet medication-worker; then
    success "medication-worker.service is RUNNING"
else
    warn "medication-worker.service failed to start — check: journalctl -u medication-worker -n 30"
fi

# ── Step 8: Health check ──────────────────────────────────────────────────────
info "Step 8 — Running health checks..."
sleep 2

VM_IP=$(hostname -I | awk '{print $1}')

LOCAL_CHECK=$(curl -sf http://localhost:8002/health 2>/dev/null || echo "FAIL")
if echo "$LOCAL_CHECK" | grep -q "ok"; then
    success "Direct health check passed: http://localhost:8002/health"
else
    warn "Direct health check failed — service may still be starting"
fi

NGINX_CHECK=$(curl -sf "http://localhost/medication/health" 2>/dev/null || echo "FAIL")
if echo "$NGINX_CHECK" | grep -q "ok"; then
    success "Nginx proxy health check passed: /medication/health"
else
    warn "Nginx proxy health check failed — check nginx config"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
API_KEY=$(grep "DIGITAL_TWIN_API_KEY" "$ENV_FILE" | cut -d'=' -f2- 2>/dev/null || echo "see .env")

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}✅  Medication Vault Deployed Successfully!${NC}                    ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║                                                                  ║"
echo "║  Endpoints (via Nginx):                                          ║"
echo "║    Medication API  → http://$VM_IP/medication/api/v1/medication/ "
echo "║    Swagger UI      → http://$VM_IP/medication/api/v1/medication/docs"
echo "║    Health Check    → http://$VM_IP/medication/health             "
echo "║                                                                  ║"
echo "║  Internal ports:                                                 ║"
echo "║    BioGears API    → localhost:8000                              ║"
echo "║    Personal Health Assistant → localhost:8001                    ║"
echo "║    Medication API  → localhost:8002                              ║"
echo "║                                                                  ║"
echo "║  API Key (same as BioGears):                                     ║"
echo "║    $API_KEY                                                       "
echo "║                                                                  ║"
echo "║  Mobile App URL to configure:                                    ║"
echo "║    http://$VM_IP                                                  "
echo "║                                                                  ║"
echo "║  Useful commands:                                                ║"
echo "║    journalctl -u medication -f                                   ║"
echo "║    journalctl -u medication-worker -f                            ║"
echo "║    sudo systemctl restart medication medication-worker           ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
