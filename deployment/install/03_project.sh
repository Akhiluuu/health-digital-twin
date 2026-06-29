#!/usr/bin/env bash
# =============================================================================
#  03_project.sh — Create virtual environments, symlinks, and install dependencies
# =============================================================================

set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$INSTALL_DIR/../config/common.sh"

section "Step 3: Setup Project Environments and Dependencies"

# Function to safely validate or rebuild a venv
setup_venv() {
    local venv_path="$1"
    local name="$2"
    local rebuild=0

    if [[ -d "$venv_path" ]]; then
        # Check if venv python works
        if ! "$venv_path/bin/python" --version &>/dev/null; then
            warn "Virtual environment $name is broken or incompatible. Deleting for clean rebuild..."
            rebuild=1
        else
            info "Virtual environment $name exists and is valid."
        fi
    else
        rebuild=1
    fi

    if [[ "$rebuild" -eq 1 ]]; then
        info "Creating $name virtual environment at $venv_path..."
        rm -rf "$venv_path"
        "$PYTHON_BIN" -m venv "$venv_path"
    fi
}

# 1. Setup Venvs
setup_venv "$BIOGEARS_VENV" "BioGears"
setup_venv "$HEALTHBOT_VENV" "Healthbot"

# 2. Install requirements for BioGears venv
info "Installing BioGears python dependencies..."
source "$BIOGEARS_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/requirements.txt" -q
deactivate
ok "BioGears venv dependencies installed."

# 3. Install requirements for Healthbot venv
info "Installing Healthbot python dependencies..."
source "$HEALTHBOT_VENV/bin/activate"
pip install --upgrade pip wheel "setuptools<82" -q
pip install -r "$PROJECT_DIR/healthbot/requirements.txt" -q

# Install llama-cpp-python with CUDA/GPU compilation support if GPU is present
info "Configuring llama-cpp-python inference engine..."
GPU_SUPPORT=0
if command -v nvcc &>/dev/null; then
    GPU_SUPPORT=1
elif [[ -x /usr/bin/nvidia-smi ]] || ls /dev/nvidia* &>/dev/null 2>&1; then
    GPU_SUPPORT=1
fi

if [[ "$GPU_SUPPORT" -eq 1 ]]; then
    info "GPU/CUDA detected — building llama-cpp-python with GPU acceleration..."
    # Ensure compile flags are set
    export CMAKE_ARGS="-DGGML_CUDA=on"
    pip install llama-cpp-python --no-cache-dir --force-reinstall -q
    ok "llama-cpp-python installed with GPU support."
else
    info "No GPU detected — building llama-cpp-python in CPU-only mode..."
    pip install llama-cpp-python --no-cache-dir -q
    ok "llama-cpp-python installed in CPU mode."
fi
deactivate
ok "Healthbot venv dependencies installed."

# 4. Handle importing path symlink (health_ai -> healthbot)
SYMLINK="$PROJECT_DIR/health_ai"
if [[ -L "$SYMLINK" ]]; then
    # Verify link target
    if [[ "$(readlink "$SYMLINK")" != "$PROJECT_DIR/healthbot" ]]; then
        info "Fixing incorrect health_ai symlink target..."
        rm -f "$SYMLINK"
        ln -s "$PROJECT_DIR/healthbot" "$SYMLINK"
    fi
elif [[ -e "$SYMLINK" ]]; then
    warn "health_ai path exists but is not a symlink. Checking details..."
else
    ln -s "$PROJECT_DIR/healthbot" "$SYMLINK"
    info "Created symlink: health_ai → healthbot"
fi

ok "Project environments and symlinks verified."
