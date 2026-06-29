#!/usr/bin/env bash
# =============================================================================
#  update.sh — Secure update mechanism with automatic rollback capability
# =============================================================================

set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DEPLOY_DIR/config/common.sh"

section "Step: Updating Application and Services"

# 1. Run full backup before modifying code
info "Executing pre-update system backup..."
BACKUP_PATH=$("$DEPLOY_DIR/backup.sh" | tail -n 1)

if [[ ! -f "$BACKUP_PATH" ]]; then
    fail "Pre-update backup failed. Update aborted to prevent data loss."
fi

# 2. Pull changes from git
info "Pulling latest code changes from origin..."
cd "$PROJECT_DIR"

# Check if git is initialized
if [[ ! -d ".git" ]]; then
    fail "Project root is not a git repository. Cannot auto-update."
fi

# Check for local uncommitted files to prevent git pull conflicts
HAS_UNCOMMITTED=0
if ! git diff-index --quiet HEAD --; then
    warn "Local changes detected. Stashing changes temporarily..."
    git stash
    HAS_UNCOMMITTED=1
fi

if ! git pull origin main; then
    if [[ "$HAS_UNCOMMITTED" -eq 1 ]]; then
        git stash pop || true
    fi
    fail "Git pull failed. Check internet/git credentials."
fi

if [[ "$HAS_UNCOMMITTED" -eq 1 ]]; then
    info "Restoring stashed local changes..."
    git stash pop || warn "Could not restore stashed changes automatically."
fi

# 3. Reinstall dependencies in venvs if requirements changed
info "Updating virtual environment python dependencies..."
source "$BIOGEARS_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/requirements.txt" -q
deactivate

source "$HEALTHBOT_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/healthbot/requirements.txt" -q
deactivate

# 4. Restart services
info "Restarting application services..."
sudo systemctl restart digitaltwin
if sudo systemctl is-active --quiet healthbot; then
    sudo systemctl restart healthbot
fi

# 5. Run post-update health validation
info "Running post-update validation checks..."
# Run health check. If it fails, trigger auto-rollback!
if ! "$DEPLOY_DIR/install/09_healthcheck.sh"; then
    warn "❌ Health checks FAILED after update! Initiating automatic rollback..."
    if "$DEPLOY_DIR/rollback.sh" "$BACKUP_PATH"; then
        ok "✅ Automatic rollback succeeded. System is restored to pre-update state."
    else
        fail "❌ Automatic rollback failed. Critical manual inspection required!"
    fi
    exit 1
else
    ok "✅ Update completed and verified healthy!"
fi
