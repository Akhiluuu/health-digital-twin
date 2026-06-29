#!/usr/bin/env bash
# =============================================================================
#  migrate.sh — Automate VM-to-VM server migration
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║             VitalHealth Digital Twin Migrator                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# 1. Inputs
read -p "Enter Old Server IP/Hostname: " OLD_IP
if [[ -z "$OLD_IP" ]]; then
    fail "Old Server IP is required for migration."
fi

read -p "Enter SSH Username [ubuntu]: " OLD_USER
OLD_USER="${OLD_USER:-ubuntu}"

read -p "Enter SSH Port [22]: " SSH_PORT
SSH_PORT="${SSH_PORT:-22}"

read -p "Enter SSH Private Key Path (optional, press Enter to use default SSH agent): " SSH_KEY

# Build SSH options
SSH_OPTS="-p $SSH_PORT"
RSYNC_OPTS="-e 'ssh -p $SSH_PORT'"
if [[ -n "$SSH_KEY" ]]; then
    if [[ -f "$SSH_KEY" ]]; then
        SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
        RSYNC_OPTS="-e 'ssh -p $SSH_PORT -i $SSH_KEY'"
    else
        warn "Key file not found at $SSH_KEY. Using standard SSH config."
    fi
fi

# Define path of the project on old server.
# Let's prompt or dynamically detect.
read -p "Enter Remote Project Path [/home/ubuntu/health-digital-twin]: " REMOTE_PATH
REMOTE_PATH="${REMOTE_PATH:-/home/ubuntu/health-digital-twin}"

# Verify ssh connection
info "Verifying SSH connection to old server ${OLD_USER}@${OLD_IP}:${SSH_PORT}..."
if ! eval "ssh -o ConnectTimeout=10 $SSH_OPTS ${OLD_USER}@${OLD_IP} 'echo Connected'" >/dev/null 2>&1; then
    fail "Could not connect to old server via SSH. Verify IP, user, port, and key."
fi
ok "Connected to old server."

# 2. Transfer files
transfer_item() {
    local label="$1"
    local remote_src="${OLD_USER}@${OLD_IP}:${REMOTE_PATH}/$2"
    local local_dest="$PROJECT_DIR/$3"
    
    info "Transferring $label..."
    
    # Run rsync command
    # Use -a (archive), -z (compress), --progress
    if eval "rsync -az --info=progress2 $RSYNC_OPTS $remote_src $local_dest"; then
        ok "$label transferred."
    else
        warn "Could not transfer $label (might not exist on remote). Skipping..."
    fi
}

# Copy configs, model files, runtime, database, reports, and clinical data
transfer_item "Configuration (.env)" ".env" ""
transfer_item "Clinical User Data" "clinical_data/" "clinical_data/"
transfer_item "HTML Simulation Reports" "reports/" "reports/"
transfer_item "Jobs Database Store" "biogears_service/jobs_store.json" "biogears_service/"
transfer_item "BioGears Runtime" "biogears_runtime/" "biogears_runtime/"
transfer_item "LLM Model Shards" "healthbot/model/" "healthbot/model/"

# 3. Re-run deployment logic locally to compile environments and configure services
section "Building Local Environment and Deploying Services"
info "Running deployment setup to compile dependencies and patch services..."
if ! "$DEPLOY_DIR/deploy.sh"; then
    fail "Post-migration local deployment failed! Review session logs."
fi

section "Migration Post-Checks"
# Run health check
if "$DEPLOY_DIR/install/09_healthcheck.sh"; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo -e "║  ${GREEN}✅  Migration Completed Successfully!${NC}                           ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  All files migrated, services built and operational.             ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
else
    warn "Migration copied files, but some health checks failed. Run: ./deployment/doctor.sh to diagnose."
fi
