from pathlib import Path
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
    # BioGears is installed system-wide via:
    #   sudo tar -xzf BioGears-7.x.x-Linux.tar.gz -C /opt/biogears
    # Override with env var BIOGEARS_BIN_DIR if you install it elsewhere.
    _bio_bin_override = os.environ.get("BIOGEARS_BIN_DIR")
    BIOGEARS_BIN_DIR    = Path(_bio_bin_override) if _bio_bin_override else Path("/opt/biogears/bin")
    BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli"

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

# ── Startup log ───────────────────────────────────────────────────────────────
print(f"[Config] Platform  : {'Windows' if IS_WINDOWS else 'Linux/Ubuntu'}")
print(f"[Config] BioGears  : {BIOGEARS_EXECUTABLE}")
print(f"[Config] Base Dir  : {BASE_DIR}")
print(f"[Config] States Dir: {USER_STATES_DIR}")
