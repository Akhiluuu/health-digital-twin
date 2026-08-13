from pathlib import Path
from typing import Optional
import os
import sys

# ── Base directory ────────────────────────────────────────────────────────────
# This resolves to the project root regardless of where you run the server from.
# Windows: C:\health-digital-twin\health-digital-twin
# Ubuntu:  /home/ubuntu/health-digital-twin  (or wherever you clone the repo)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ── OS Detection ─────────────────────────────────────────────────────────────
# Automatically selects the correct BioGears binary path for Windows vs Linux.
# You do NOT need to change this file when deploying to Ubuntu.
IS_WINDOWS = sys.platform.startswith("win")

if IS_WINDOWS:
    # ── Windows (local development) ──────────────────────────────────────────
    # BioGears binary lives inside the repo under biogears_service/engine/
    BIOGEARS_BIN_DIR    = BASE_DIR / "biogears_service" / "engine" / "BioGears" / "bin"
    BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli.exe"
else:
    # ── Ubuntu (cloud / E2Networks VM) ───────────────────────────────────────
    # biogears_runtime/ is a writable directory at the project root containing
    # symlinks to the bg-cli binary and all required runtime data
    # (xsd/, patients/, substances/, environments/, etc.).
    # Override with env var BIOGEARS_BIN_DIR if you install it elsewhere.
    _bio_bin_override = os.environ.get("BIOGEARS_BIN_DIR")
    BIOGEARS_BIN_DIR = Path(_bio_bin_override) if _bio_bin_override else BASE_DIR / "biogears_runtime"
    
    _exec_candidate = BIOGEARS_BIN_DIR / "bg-cli"
    if _exec_candidate.exists() and _exec_candidate.is_file():
        BIOGEARS_EXECUTABLE = _exec_candidate
    elif (BIOGEARS_BIN_DIR / "bin" / "bg-cli").exists():
        BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bin" / "bg-cli"
    else:
        BIOGEARS_EXECUTABLE = _exec_candidate

# BioGears scenario output directory (scenarios written here before engine runs)
SCENARIO_API_DIR = BIOGEARS_BIN_DIR / "Scenarios" / "API"

# ── Clinical data directories ─────────────────────────────────────────────────
CLINICAL_DATA_DIR = BASE_DIR / "clinical_data"
USER_STATES_DIR   = CLINICAL_DATA_DIR / "states"
USER_HISTORY_DIR  = CLINICAL_DATA_DIR / "history"
REPORTS_DIR       = BASE_DIR / "reports"

# ── BioGears asset sub-directories (read-only, shipped with BioGears) ─────────
SUBSTANCES_DIR  = BIOGEARS_BIN_DIR / "substances"
ENVIRONMENTS_DIR = BIOGEARS_BIN_DIR / "environments"
NUTRITION_DIR   = BIOGEARS_BIN_DIR / "nutrition"

# ── Engine debug logs ─────────────────────────────────────────────────────────
LOGS_DIR = BASE_DIR / "logs"

# ── Legacy alias ──────────────────────────────────────────────────────────────
BIO_OUTPUT_DIR = BIOGEARS_BIN_DIR

# ── Auto-create required directories ─────────────────────────────────────────
for path in [SCENARIO_API_DIR, USER_STATES_DIR, USER_HISTORY_DIR, REPORTS_DIR, LOGS_DIR]:
    path.mkdir(parents=True, exist_ok=True)

# ── Persistent async-job store (survives server restarts) ─────────────────────
JOBS_STORE_PATH = BASE_DIR / "biogears_service" / "jobs_store.json"

def resolve_state_file(user_id: str) -> Optional[Path]:
    """
    Locates the state file for a digital twin, returning the Path to either
    user_id.xml or user_id.xml.gz. Returns None if neither exists.
    """
    xml_path = USER_STATES_DIR / f"{user_id}.xml"
    if xml_path.exists():
        return xml_path
    gz_path = USER_STATES_DIR / f"{user_id}.xml.gz"
    if gz_path.exists():
        return gz_path
    return None

# ── Startup log ───────────────────────────────────────────────────────────────
print(f"[Config] Platform  : {'Windows' if IS_WINDOWS else 'Linux/Ubuntu'}")
print(f"[Config] BioGears  : {BIOGEARS_EXECUTABLE}")
print(f"[Config] Base Dir  : {BASE_DIR}")
print(f"[Config] States Dir: {USER_STATES_DIR}")

