#!/usr/bin/env bash
# =============================================================================
#  VitalHealth Deployment System — Common Utility Library
# =============================================================================

# Prevent double inclusion
[[ -n "${_COMMON_SH_INCLUDED:-}" ]] && return 0
_COMMON_SH_INCLUDED=1

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
BLUE="\033[0;34m"
MAGENTA="\033[0;35m"
NC="\033[0m"

# ── Dynamic Path Resolution ───────────────────────────────────────────────────
# Get directory where this file resides
COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$COMMON_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

LOG_DIR="$DEPLOY_DIR/logs"
mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

# Global log file for the current execution
CURRENT_LOG_FILE="${LOG_DIR}/session_$(date +%Y%m%d_%H%M%S).log"

# ── Logging Functions ─────────────────────────────────────────────────────────
log_to_file() {
    local level="$1"
    shift
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" >> "$CURRENT_LOG_FILE"
}

info() {
    echo -e "${CYAN}  →  $*${NC}"
    log_to_file "INFO" "$*"
}

ok() {
    echo -e "${GREEN}  ✔  $*${NC}"
    log_to_file "SUCCESS" "$*"
}

warn() {
    echo -e "${YELLOW}  ⚠  $*${NC}"
    log_to_file "WARNING" "$*"
}

fail() {
    echo -e "${RED}  ✘  $*${NC}"
    log_to_file "ERROR" "$*"
    exit 1
}

section() {
    echo -e "\n${YELLOW}━━━  $*  ━━━${NC}"
    log_to_file "SECTION" "$*"
}

# ── User and System Detections ───────────────────────────────────────────────
detect_user() {
    # Detect the non-root user running this script
    if [[ "$EUID" -eq 0 ]]; then
        # If run with sudo, logname gives the original user
        CURRENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "ubuntu")}"
    else
        CURRENT_USER="$(whoami)"
    fi
    CURRENT_GROUP="$(id -gn "$CURRENT_USER")"
    
    # Export these variables
    export CURRENT_USER
    export CURRENT_GROUP
}

detect_ubuntu() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_NAME="$NAME"
        OS_VERSION="$VERSION_ID"
    else
        OS_NAME="Unknown"
        OS_VERSION="Unknown"
    fi

    if [[ "$OS_NAME" != *"Ubuntu"* ]]; then
        warn "This script is optimized for Ubuntu. Detected OS: $OS_NAME $OS_VERSION. Continuing anyway..."
    else
        info "System detected: $OS_NAME $OS_VERSION"
    fi
    export OS_NAME
    export OS_VERSION
}

detect_python() {
    # Dynamically find the highest available python3 version
    local py_bin=""
    for cmd in python3.13 python3.12 python3.11 python3; do
        if command -v "$cmd" &>/dev/null; then
            py_bin="$(command -v "$cmd")"
            break
        fi
    done

    if [[ -z "$py_bin" ]]; then
        fail "Python 3 is not installed on this system. Please install Python 3."
    fi

    local py_ver
    py_ver=$("$py_bin" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    
    export PYTHON_BIN="$py_bin"
    export PYTHON_VER="$py_ver"
    info "Detected Python: $PYTHON_BIN (v$PYTHON_VER)"
}

# Ensure variables are exported on load
detect_user
detect_ubuntu
detect_python

# Paths variables
export PROJECT_DIR
export DEPLOY_DIR
export LOG_DIR
export CURRENT_LOG_FILE
export BIOGEARS_VENV="$PROJECT_DIR/venv"
export HEALTHBOT_VENV="$PROJECT_DIR/healthbot_venv"
export MODEL_DIR="$PROJECT_DIR/healthbot/model"
export RUNTIME_DIR="$PROJECT_DIR/biogears_runtime"
export BACKUP_DIR="$PROJECT_DIR/backups"
export REPORT_DIR="$PROJECT_DIR/reports"
export CLINICAL_DIR="$PROJECT_DIR/clinical_data"
