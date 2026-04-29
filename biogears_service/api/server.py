from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import shutil, os, math, json, threading
import datetime
import time
import uuid
import logging
import warnings
import pandas as pd

# Suppress the expected ParserWarning when reading uneven BioGears CSVs with index_col=False
warnings.filterwarnings("ignore", category=pd.errors.ParserWarning)
from pathlib import Path

from biogears_service.simulation import scenario_builder, engine_runner, result_parser, visualizer
from biogears_service.simulation.config import (
    USER_STATES_DIR, BIO_OUTPUT_DIR, SCENARIO_API_DIR,
    BASE_DIR, BIOGEARS_BIN_DIR, USER_HISTORY_DIR, REPORTS_DIR, LOGS_DIR,
    JOBS_STORE_PATH
)
from biogears_service.simulation.substance_registry import ROUTE_GROUPS
from biogears_service.simulation import validator as sim_validator
from biogears_service.api import db, analytics, streaming

# --- LOGGING & PATH VERIFICATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DigitalTwin")

def run_path_checker():
    paths = {
        "Base Directory": BASE_DIR,
        "User States": USER_STATES_DIR,
        "User History": USER_HISTORY_DIR,
        "Scenario API": SCENARIO_API_DIR,
        "Reports Folder": REPORTS_DIR
    }
    print("\n" + "="*50 + "\n[BIOGEARS] SYSTEM PATH CHECK\n" + "="*50)
    all_pass = True
    for name, path in paths.items():
        exists = Path(path).exists()
        print(f"{name.ljust(20)}: {'PASS' if exists else 'FAIL'} ({path})")
        if not exists:
            try:
                Path(path).mkdir(parents=True, exist_ok=True)
                print(f"   >> Auto-created: {name}")
            except:
                all_pass = False
    return all_pass

if not run_path_checker():
    logger.warning("System paths are incomplete.")

# --- APP INITIALIZATION ---
app = FastAPI(
    title="BioGears Digital Twin API",
    version="4.0.0",
    description="Physiological digital twin simulation API powered by BioGears."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPORT_DIR = BASE_DIR / "reports"
REPORT_DIR.mkdir(exist_ok=True)
app.mount("/view-reports", StaticFiles(directory=str(REPORT_DIR)), name="reports")

# ---------------------------------------------------------------------------
# OPTIONAL API KEY AUTH
# ---------------------------------------------------------------------------
# Set env var DIGITAL_TWIN_API_KEY to enable API key protection.
# If not set, all endpoints are open (dev mode).
API_KEY_ENV = os.environ.get("DIGITAL_TWIN_API_KEY", "70d04318406695d0221ca63b51cd390bddf272bf30059ea5cdbec08bafc7c67c")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def require_api_key(key: str = Depends(api_key_header)):
    if API_KEY_ENV and key != API_KEY_ENV:
        raise HTTPException(status_code=403, detail="Invalid or missing API key. Set X-API-Key header.")

# ---------------------------------------------------------------------------
# PERSISTENT JOB STORE  (file-backed JSON, survives server restarts)
# ---------------------------------------------------------------------------
# Jobs are saved to JOBS_STORE_PATH so a reload/crash doesn't wipe results.
# Thread-safe via _jobs_lock. Jobs older than JOB_TTL_SECONDS are pruned.
# ---------------------------------------------------------------------------
_jobs_lock     = threading.Lock()
JOB_TTL_SECONDS = 86400  # 24 hours


def _load_jobs() -> Dict[str, Dict[str, Any]]:
    """Read the job store from disk. Returns empty dict on any error."""
    try:
        if JOBS_STORE_PATH.exists():
            return json.loads(JOBS_STORE_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"Job store read error (returning empty): {e}")
    return {}


def _save_jobs(jobs: Dict[str, Dict[str, Any]]) -> None:
    """Persist the job store to disk atomically."""
    try:
        tmp = JOBS_STORE_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(jobs, default=str), encoding="utf-8")
        tmp.replace(JOBS_STORE_PATH)
    except Exception as e:
        logger.warning(f"Job store write error: {e}")


def _get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        return _load_jobs().get(job_id)


def _set_job(job_id: str, data: Dict[str, Any]) -> None:
    with _jobs_lock:
        jobs = _load_jobs()
        jobs[job_id] = data
        _save_jobs(jobs)


def _prune_old_jobs() -> None:
    """Remove jobs older than JOB_TTL_SECONDS. Called once on startup."""
    with _jobs_lock:
        jobs = _load_jobs()
        cutoff = time.time() - JOB_TTL_SECONDS
        pruned = {jid: j for jid, j in jobs.items()
                  if float(j.get("created_at", 0)) >= cutoff}
        removed = len(jobs) - len(pruned)
        if removed:
            logger.info(f"🗑️  Pruned {removed} expired job(s) from store.")
        _save_jobs(pruned)


_prune_old_jobs()

# ---------------------------------------------------------------------------
# PER-USER RATE LIMITING  (max 3 simulations per hour per user)
# ---------------------------------------------------------------------------
import collections
_sim_log: Dict[str, collections.deque] = {}  # user_id -> deque of epoch timestamps
_RATE_LIMIT_MAX   = int(os.environ.get("SIM_RATE_LIMIT", "10"))  # max sims per rolling window
_RATE_LIMIT_WINDOW = int(os.environ.get("SIM_RATE_WINDOW", "3600"))  # window in seconds (1 hr)

def _check_rate_limit(user_id: str):
    """Raises HTTP 429 if user has exceeded 3 simulations in the last hour."""
    now = time.time()
    if user_id not in _sim_log:
        _sim_log[user_id] = collections.deque()
    dq = _sim_log[user_id]
    # Evict entries outside the rolling window
    while dq and now - dq[0] > _RATE_LIMIT_WINDOW:
        dq.popleft()
    if len(dq) >= _RATE_LIMIT_MAX:
        wait = int(_RATE_LIMIT_WINDOW - (now - dq[0]))
        raise HTTPException(
            status_code=429,
            detail=(
                f"Rate limit reached: max {_RATE_LIMIT_MAX} simulations per hour. "
                f"Please wait {wait // 60}m {wait % 60}s before running another."
            )
        )
    dq.append(now)


# ---------------------------------------------------------------------------
# DATA MODELS
# ---------------------------------------------------------------------------
class RegistrationRequest(BaseModel):
    user_id: str
    age: int
    weight: float
    height: float
    sex: str              # "Male" or "Female"
    body_fat: Optional[float] = 0.2
    resting_hr: Optional[float] = 72.0
    systolic_bp: Optional[float] = 114.0
    diastolic_bp: Optional[float] = 73.5
    is_smoker: Optional[bool] = False
    has_anemia: Optional[bool] = False
    has_type1_diabetes: Optional[bool] = False
    has_type2_diabetes: Optional[bool] = False
    # ── Extended clinical fields ──────────────────────────────────────────
    hba1c: Optional[float] = None        # Glycated haemoglobin % (e.g. 7.2). For diabetics.
    ethnicity: Optional[str] = "Other"   # "South Asian" | "Other" — affects BMI interpretation
    fitness_level: Optional[str] = "sedentary"   # "sedentary" | "active" | "athlete"
    vo2max: Optional[float] = None       # mL/kg/min — aerobic fitness marker (affects exercise ceiling)
    current_medications: Optional[List[str]] = []  # e.g. ["Metformin", "Atorvastatin"]

class HealthEvent(BaseModel):
    event_type: str          # "exercise"|"sleep"|"meal"|"substance"|"water"|"environment"|"stress"|"alcohol"|"fast"
    value: float
    time_offset: Optional[int] = None        # deprecated
    timestamp: Optional[float] = None        # Epoch Unix timestamp
    # Substance events
    substance_name: Optional[str]  = None
    # Meal events
    meal_type: Optional[str]       = None   # balanced|high_carb|high_protein|fast_food|ketogenic|custom
    carb_g: Optional[float]        = None   # for custom meals
    fat_g: Optional[float]         = None
    protein_g: Optional[float]     = None
    # Exercise / stress events
    duration_seconds: Optional[int] = None  # how long to run (default 1800 s for exercise, 300 s for stress)
    # Environment events
    environment_name: Optional[str] = None  # e.g. "ExerciseEnvironment"
    # Alcohol context (optional)
    notes: Optional[str]           = None   # free-text clinical notes


class BatchSyncRequest(BaseModel):
    user_id: str
    events: List[HealthEvent]

class SingleSyncRequest(BaseModel):
    user_id: str
    event_type: str
    value: float
    time_offset: Optional[int]     = None
    timestamp: Optional[float]     = None
    substance_name: Optional[str]  = None
    meal_type: Optional[str]       = None
    duration_seconds: Optional[int] = None
    environment_name: Optional[str] = None

class PredictRequest(BaseModel):
    user_id: str
    hours: Optional[float] = 4.0

class WhatIfRequest(BaseModel):
    user_id: str
    event: HealthEvent
    hours: Optional[float] = 4.0

class AsyncSyncRequest(BaseModel):
    user_id: str
    events: List[HealthEvent]

# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------
BASE_URL = "http://127.0.0.1:8000"

def _build_vitals_from_df(df: pd.DataFrame) -> dict:
    try:
        df.columns = [c.split('(')[0].strip() for c in df.columns]
        latest = df.iloc[-1].to_dict()

        def _safe(key):
            v = latest.get(key)
            if v is None: return None
            val = result_parser.safe_float(v)
            return None if math.isnan(val) else val

        # Cache BP values — guard BOTH fields together to prevent int(None)
        sys_bp = _safe('SystolicArterialPressure')
        dia_bp = _safe('DiastolicArterialPressure')

        return {
            "heart_rate":       round(_safe("HeartRate"), 1)           if _safe("HeartRate") is not None else None,
            "blood_pressure":   f"{int(sys_bp)}/{int(dia_bp)}"         if (sys_bp is not None and dia_bp is not None) else None,
            "glucose":          round(_safe("Glucose-BloodConcentration"), 2) if _safe("Glucose-BloodConcentration") is not None else None,
            "respiration":      round(_safe("RespirationRate"), 1)     if _safe("RespirationRate") is not None else None,
            "spo2":             round(_safe("OxygenSaturation") * 100, 1)      if _safe("OxygenSaturation") is not None else None,
            "core_temperature": round(_safe("CoreTemperature"), 2)     if _safe("CoreTemperature") is not None else None,
            "cardiac_output":   round(_safe("CardiacOutput"), 2)       if _safe("CardiacOutput") is not None else None,
            # ── Extended Vitals ─────────────────────────────────────────
            "map":              round(_safe("MeanArterialPressure"), 1) if _safe("MeanArterialPressure") is not None else None,
            "stroke_volume":    round(_safe("HeartStrokeVolume"), 1)   if _safe("HeartStrokeVolume") is not None else None,
            "tidal_volume":     round(_safe("TidalVolume"), 1)         if _safe("TidalVolume") is not None else None,
            "arterial_ph":      round(_safe("ArterialBloodPH"), 2)     if _safe("ArterialBloodPH") is not None else None,
            "exercise_level":   round(_safe("AchievedExerciseLevel"), 3) if _safe("AchievedExerciseLevel") is not None else None,
        }
    except Exception as e:
        logger.error(f"_build_vitals_from_df error: {e}")
        return {}


def _run_batch_sync_blocking(user_id: str, events: list) -> dict:
    """Runs the BioGears batch simulation. Returns a result dict or raises."""
    _t0 = time.time()
    def _elapsed(): return f"{round(time.time() - _t0, 1)}s"

    logger.info(f"")
    logger.info(f"{'#'*55}")
    logger.info(f"📋  SIMULATION REQUEST  [{user_id}]  {len(events)} event(s)")
    logger.info(f"{'#'*55}")

    # ── [1/6] Rate limit check ───────────────────────────────────────────────
    logger.info(f"[1/6] [{user_id}] Rate limit check...")
    _check_rate_limit(user_id)

    state_file = USER_STATES_DIR / f"{user_id}.xml"

    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    event_dicts = [e if isinstance(e, dict) else e.dict() for e in events]

    now_ts = time.time()
    for e in event_dicts:
        if not e.get('timestamp'):
            e['timestamp'] = now_ts + (e.get('time_offset') or 0)

    # ── [2/6] Validate events ────────────────────────────────────────────────
    logger.info(f"[2/6] [{user_id}] Validating {len(event_dicts)} event(s)...")
    errors = sim_validator.validate_events(event_dicts)
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    # ── Drug interaction check (non-blocking — returned as warnings) ───────
    interaction_warnings = sim_validator.validate_interactions(event_dicts)

    sorted_events = sorted(event_dicts, key=lambda x: x['timestamp'])

    meta = db.get_profile(user_id) or {}
    user_weight_kg = float(meta.get("weight", 70.0))
    gap_seconds = time.time() - os.path.getmtime(str(state_file))

    # ── [3/6] Build scenario XML ─────────────────────────────────────────────
    logger.info(f"[3/6] [{user_id}] Building scenario XML... ({_elapsed()})")
    path, run_id, csv_prefix = scenario_builder.build_batch_reconstruction(
        user_id, str(state_file), sorted_events, user_weight_kg=user_weight_kg
    )
    logger.info(f"      [{user_id}] Scenario ready → {Path(path).name}")

    # ── [4/6] Run BioGears engine ─────────────────────────────────────────────
    logger.info(f"[4/6] [{user_id}] Handing off to BioGears engine... ({_elapsed()})")
    if not engine_runner.run_biogears(path, user_id=user_id):
        log = engine_runner.get_latest_log(user_id)
        raise HTTPException(status_code=500,
                            detail={"message": "Engine execution failed.",
                                    "log_snippet": (log or "")[-500:]})

    # ── [5/6] Capture results ─────────────────────────────────────────────────
    logger.info(f"[5/6] [{user_id}] Capturing CSV output... ({_elapsed()})")
    user_hist_path = USER_HISTORY_DIR / user_id
    user_hist_path.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_csv = user_hist_path / f"vitals_{timestamp}.csv"

    # ── Search using csv_prefix from scenario_builder (consistent naming) ─
    target_filename = f"{csv_prefix}Results.csv"
    found = False
    logger.info(f"🔎 Scanning for: {target_filename}")
    for attempt in range(12):  # up to 12 attempts × 1s = 12s max
        possible_files = list(BIOGEARS_BIN_DIR.rglob(target_filename))
        if possible_files:
            ps = possible_files[0]
            try:
                shutil.copy2(str(ps), str(dest_csv))
                os.remove(str(ps))
                found = True
                logger.info(f"✅ Results captured from {ps}")
                break
            except Exception as e:
                logger.warning(f"⏳ File locked, retrying... ({e})")
        if found:
            break
        time.sleep(1)  # poll every 1s (was 2s × 6 = 12s worst-case; now 1s × 12 = same cap, faster response)

    if not found:
        raise HTTPException(status_code=500, detail="Engine output file missing.")

    # ── [6/6] Validate Data & Analytics ──────────────────────────────────────
    logger.info(f"[6/6] [{user_id}] Validating output and generating report... ({_elapsed()})")

    # Fix for BioGears extra column bug: tell pandas not to use col 0 as index
    try:
        df = pd.read_csv(dest_csv, index_col=False)
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine output CSV is malformed: {e}")

    # Check for "Dead Twin" (NaNs in critical vitals like HeartRate)
    if 'HeartRate' in df.columns and df['HeartRate'].isnull().any():
        logger.error(f"❌ [{user_id}] Engine produced NaN values (Twin died). Rolling back state.")
        raise HTTPException(status_code=500, detail="Simulation resulted in physiological failure (NaN values). State has been rolled back to prevent corruption.")

    vitals = _build_vitals_from_df(df)
    report_url = visualizer.generate_health_report(user_id, custom_path=dest_csv)

    # ── Anomaly detection ────────────────────────────────────────────────────
    anomalies = result_parser.detect_anomalies(df)
    if anomalies:
        logger.warning(f"🚨 Anomalies for {user_id}: {[a['label'] for a in anomalies]}")

    # Update state file ONLY IF successful and healthy
    updated_state_filename = f"batch_{user_id}.xml"
    possible_states = list(BIOGEARS_BIN_DIR.rglob(updated_state_filename))
    if possible_states:
        try:
            os.replace(str(possible_states[0]), str(state_file))
            logger.info("🔄 State synchronized safely.")
        except Exception as e:
            logger.warning(f"⚠️ State sync skipped: {e}")

    # ── Auto-backup state after every successful simulation ──────────────────
    try:
        bak_dir = USER_STATES_DIR / "backups" / user_id
        bak_dir.mkdir(parents=True, exist_ok=True)
        ts_bak = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        shutil.copy2(str(state_file), str(bak_dir / f"{user_id}_{ts_bak}.xml"))
        for old in sorted(bak_dir.glob(f"{user_id}_*.xml"),
                          key=os.path.getmtime, reverse=True)[7:]:
            try: old.unlink()
            except: pass
    except Exception as bak_err:
        logger.warning(f"Auto-backup failed (non-fatal): {bak_err}")

    # ── Data-gap warning ─────────────────────────────────────────────────────
    gap_hours = round(gap_seconds / 3600, 1)
    data_gap_warning = None
    if gap_seconds >= 86400:
        data_gap_warning = (
            f"⚠️ {gap_hours}h data gap detected. Your twin was advanced only {min(gap_hours, 8.0)}h "
            f"and may not reflect real activity during the missing period."
        )
        logger.warning(f"⏳ Data gap for {user_id}: {gap_hours}h since last sync (capped at 8h advance)")

    total_elapsed = round(time.time() - _t0, 1)
    logger.info(f"")
    logger.info(f"{'#'*55}")
    logger.info(f"🏁  SIMULATION DONE  [{user_id}]  total={total_elapsed}s")
    logger.info(f"    HR={vitals.get('heart_rate')} bpm | Glucose={vitals.get('glucose')} mg/dL | BP={vitals.get('blood_pressure')}")
    logger.info(f"{'#'*55}")
    logger.info(f"")

    return {
        "status": "success",
        "vitals": vitals,
        "report_url": report_url,
        "data_gap_warning": data_gap_warning,
        "gap_hours_advanced": min(gap_hours, 8.0),
        "anomalies": anomalies,
        "has_anomaly": len(anomalies) > 0,
        "interaction_warnings": interaction_warnings,
        "has_drug_interaction": len(interaction_warnings) > 0,
    }


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

# ── 0. ROOT & HEALTH ───────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root():
    """Friendly root endpoint — useful when someone opens the URL in a browser."""
    return {
        "name":        "BioGears Digital Twin API",
        "version":     "4.0.0",
        "status":      "online",
        "description": "Physiological simulation engine for the VitalTwin health app.",
        "docs":        "/docs",
        "health":      "/health",
        "endpoints": {
            "register":           "POST /register",
            "simulate":           "POST /sync/batch",
            "health_score":       "GET  /health-score/{user_id}",
            "recovery_readiness": "GET  /analytics/recovery-readiness/{user_id}",
            "cvd_risk":           "GET  /analytics/cvd-risk/{user_id}",
            "profiles":           "GET  /profiles",
        }
    }


@app.get("/health", summary="Server health ping — use this to test connectivity")
def health_check():
    """
    Returns both a lightweight connectivity ping AND system component checks.
    No API key required — safe for use as an uptime monitor / mobile 'Test Connection'.
    """
    checks = {}
    checks["engine_binary"]  = BIOGEARS_BIN_DIR.exists()
    checks["states_dir"]     = USER_STATES_DIR.exists()
    checks["history_dir"]    = USER_HISTORY_DIR.exists()
    checks["scenarios_dir"]  = SCENARIO_API_DIR.exists()
    checks["twin_count"]     = len(list(USER_STATES_DIR.glob("*.xml"))) if USER_STATES_DIR.exists() else 0
    with _jobs_lock:
        checks["persisted_jobs"] = len(_load_jobs())
    all_ok = all(v for k, v in checks.items() if isinstance(v, bool))
    return {
        "status":  "healthy" if all_ok else "degraded",
        "version": "4.0.0",
        "engine":  "BioGears",
        "message": "BioGears Digital Twin API is running.",
        "timestamp": datetime.datetime.now().isoformat(),
        "checks":  checks,
    }


@app.get("/greeting")
def get_greeting():
    """
    Returns a greeting message with markdown formatting for the AI Health page.
    Supports **bold** and *italic* parsing in the frontend.
    """
    return {
        "message": "Hello **world**! This is your *personalized* health AI assistant. 🌟 Ask me anything about your wellness journey!"
    }


# ── 1. SUBSTANCES ────────────────────────────────────────────────────────────

@app.get("/substances", dependencies=[Depends(require_api_key)],
         summary="List all available substances and their administration routes")
def get_substances():
    """
    Returns a structured list of every substance supported by the engine,
    grouped by administration route.
    """
    return {"substances": ROUTE_GROUPS, "total": sum(len(v) for v in ROUTE_GROUPS.values())}


# ── 2. PROFILES ──────────────────────────────────────────────────────────────

@app.get("/profiles", dependencies=[Depends(require_api_key)],
         summary="List all registered Digital Twins (supports filtering)")
def get_all_profiles(
    sex: Optional[str] = Query(None, description="Filter by sex: Male or Female"),
    min_age: Optional[int] = Query(None, description="Minimum age (inclusive)"),
    max_age: Optional[int] = Query(None, description="Maximum age (inclusive)"),
    has_diabetes: Optional[bool] = Query(None, description="Filter twins with any diabetes"),
    has_anemia: Optional[bool] = Query(None, description="Filter twins with anemia"),
    is_smoker: Optional[bool] = Query(None, description="Filter smokers / COPD"),
):
    """
    Returns every calibrated twin with metadata and last-active timestamp.
    All query parameters are optional and can be combined for filtering.
    """
    try:
        profiles = []
        if not USER_STATES_DIR.exists():
            return {"profiles": []}

        stored = db.list_profiles()

        for state_file in USER_STATES_DIR.glob("*.xml"):
            uid = state_file.stem
            meta = stored.get(uid, {})
            conditions = meta.get("conditions", [])

            # --- Apply filters ---
            if sex and meta.get("sex", "").lower() != sex.lower():
                continue
            if min_age is not None and (meta.get("age") or 0) < min_age:
                continue
            if max_age is not None and (meta.get("age") or 999) > max_age:
                continue
            if has_diabetes is not None:
                twin_has_diabetes = meta.get("has_type1_diabetes") or meta.get("has_type2_diabetes")
                if has_diabetes != bool(twin_has_diabetes):
                    continue
            if has_anemia is not None and has_anemia != bool(meta.get("has_anemia")):
                continue
            if is_smoker is not None and is_smoker != bool(meta.get("is_smoker")):
                continue

            profiles.append({
                "user_id": uid,
                "status": "Calibrated",
                "last_active": datetime.datetime.fromtimestamp(
                    state_file.stat().st_mtime
                ).isoformat(),
                "age": meta.get("age"),
                "sex": meta.get("sex"),
                "weight_kg": meta.get("weight"),
                "height_cm": meta.get("height"),
                "conditions": conditions,
            })

        profiles.sort(key=lambda x: x["last_active"], reverse=True)
        return {"profiles": profiles, "count": len(profiles)}
    except Exception as e:
        logger.error(f"❌ Failed to fetch profiles: {e}")
        raise HTTPException(status_code=500, detail="Could not retrieve profile list.")


@app.get("/profiles/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Get full metadata for a single Digital Twin")
def get_profile(user_id: str):
    """Returns stored demographic and clinical metadata for one twin."""
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    meta = db.get_profile(user_id) or {}
    return {
        "user_id": user_id,
        "status": "Calibrated",
        "last_active": datetime.datetime.fromtimestamp(
            state_file.stat().st_mtime
        ).isoformat(),
        "age": meta.get("age"),
        "sex": meta.get("sex"),
        "weight_kg": meta.get("weight"),
        "height_cm": meta.get("height"),
        "body_fat": meta.get("body_fat"),
        "resting_hr": meta.get("resting_hr"),
        "systolic_bp": meta.get("systolic_bp"),
        "diastolic_bp": meta.get("diastolic_bp"),
        "conditions": meta.get("conditions", []),
    }


@app.delete("/profiles/{user_id}", dependencies=[Depends(require_api_key)],
            summary="Permanently delete a Digital Twin and all its data")
def delete_profile(user_id: str):
    """Removes the engine state, simulation history, and stored metadata."""
    try:
        state_file = USER_STATES_DIR / f"{user_id}.xml"
        if state_file.exists():
            os.remove(str(state_file))

        history_folder = USER_HISTORY_DIR / user_id
        if history_folder.exists():
            shutil.rmtree(str(history_folder))

        db.delete_profile(user_id)

        logger.info(f"🗑️ Profile {user_id} purged.")
        return {"status": "success", "message": f"Twin '{user_id}' deleted."}
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(status_code=500, detail="Deletion failed.")


# ── 3. REGISTRATION ───────────────────────────────────────────────────────────

@app.post("/register", dependencies=[Depends(require_api_key)],
          summary="Register and calibrate a new Digital Twin")
def register(data: RegistrationRequest):
    """
    Creates a BioGears patient scenario, runs engine calibration, and persists
    the patient's demographic + clinical metadata to the database.
    """
    logger.info(f"🚀 Registering Twin: {data.user_id}")

    # ── 1. Validate registration fields before touching the engine ────────────
    reg_errors = sim_validator.validate_registration(data.dict())
    if reg_errors:
        logger.warning(f"❌ Registration validation failed for {data.user_id}: {reg_errors}")
        raise HTTPException(status_code=422, detail={"validation_errors": reg_errors})

    # ── 2. Overwrite existing twin if recalibrating ────────────
    existing_state = USER_STATES_DIR / f"{data.user_id}.xml"
    if existing_state.exists():
        logger.info(f"⚠️ Twin '{data.user_id}' already exists. Overwriting with new calibration.")
        try:
            os.remove(str(existing_state))
            history_folder = USER_HISTORY_DIR / data.user_id
            if history_folder.exists():
                shutil.rmtree(str(history_folder))
        except Exception as e:
            logger.warning(f"Failed to clean up old twin data for '{data.user_id}': {e}")

    path = scenario_builder.build_registration_scenario(
        data.user_id, data.age, data.weight, data.height,
        data.sex, data.body_fat, data.dict()
    )

    if engine_runner.run_biogears(path, user_id=data.user_id):
        target_file = BIOGEARS_BIN_DIR / f"{data.user_id}.xml"
        perm_state = USER_STATES_DIR / f"{data.user_id}.xml"
        if target_file.exists():
            shutil.copy2(str(target_file), str(perm_state))
            os.remove(str(target_file))

            # Build conditions list for metadata
            conditions = []
            if data.is_smoker: conditions.append("Smoker / COPD")
            if data.has_anemia: conditions.append("Chronic Anemia")
            if data.has_type1_diabetes: conditions.append("Type 1 Diabetes")
            if data.has_type2_diabetes: conditions.append("Type 2 Diabetes")

            # Persist metadata
            db.upsert_profile(data.user_id, {
                "age": data.age,
                "sex": data.sex,
                "weight": data.weight,
                "height": data.height,
                "body_fat": data.body_fat,
                "resting_hr": data.resting_hr,
                "systolic_bp": data.systolic_bp,
                "diastolic_bp": data.diastolic_bp,
                "conditions": conditions,
                "registered_at": datetime.datetime.now().isoformat(),
                "is_smoker": data.is_smoker,
                "has_anemia": data.has_anemia,
                "has_type1_diabetes": data.has_type1_diabetes,
                "has_type2_diabetes": data.has_type2_diabetes,
                # Extended clinical fields
                "hba1c": data.hba1c,
                "ethnicity": data.ethnicity or "Other",
            })

            logger.info(f"✅ Twin {data.user_id} calibrated and metadata saved.")
            return {"status": "success", "message": f"Twin '{data.user_id}' calibrated."}

    raise HTTPException(status_code=500, detail="Engine convergence failure.")


# ── 4. SYNC – BATCH ───────────────────────────────────────────────────────────

@app.post("/sync/batch", dependencies=[Depends(require_api_key)],
          summary="Log a batch of health events and retrieve updated vitals")
def sync_batch(data: BatchSyncRequest):
    """
    Runs a BioGears simulation replay for all provided events (exercise, sleep,
    meal, substance) and returns the resulting vital signs and a health report.
    """
    for e in data.events:
        logger.info(f"📅 Timeline Item: {e.event_type} at T+{e.time_offset}s")
    return _run_batch_sync_blocking(data.user_id, data.events)


# ── 5. SYNC – SINGLE (convenience wrapper) ───────────────────────────────────

@app.post("/sync/single", dependencies=[Depends(require_api_key)],
          summary="Log a single health event — convenience endpoint")
def sync_single(data: SingleSyncRequest):
    """
    Wraps /sync/batch for one event. Ideal for quick one-off logs like
    'just had coffee' or 'started a 30-min run'.
    """
    event = HealthEvent(
        event_type=data.event_type,
        value=data.value,
        time_offset=data.time_offset,
        timestamp=data.timestamp or time.time(),
        substance_name=data.substance_name
    )
    logger.info(f"📅 Single event: {data.event_type} (value={data.value}) for {data.user_id}")
    return _run_batch_sync_blocking(data.user_id, [event])


# ── 6. ASYNC SIMULATION ───────────────────────────────────────────────────────

def _background_sync(job_id: str, user_id: str, events: list):
    """Background task: run simulation and persist result to job store."""
    # Mark as running
    job = _get_job(job_id) or {}
    job["status"] = "running"
    _set_job(job_id, job)

    try:
        result = _run_batch_sync_blocking(user_id, events)
        job["status"] = "done"
        job["result"] = result
        _set_job(job_id, job)
    except HTTPException as e:
        job["status"] = "failed"
        job["error"]  = e.detail
        _set_job(job_id, job)
    except Exception as e:
        job["status"] = "failed"
        job["error"]  = str(e)
        _set_job(job_id, job)


@app.post("/simulate/async", dependencies=[Depends(require_api_key)],
          summary="Start an async simulation — returns a job_id immediately")
def simulate_async(data: AsyncSyncRequest, background_tasks: BackgroundTasks):
    """
    Kicks off a background simulation and immediately returns a job_id.
    Poll GET /jobs/{job_id} to check progress and retrieve results.
    Job state is persisted to disk so it survives server reloads.
    """
    state_file = USER_STATES_DIR / f"{data.user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{data.user_id}' not found.")

    # Prevent duplicate jobs: Check if user already has a running simulation
    with _jobs_lock:
        jobs = _load_jobs()
        for j_id, j_data in jobs.items():
            if j_data.get("user_id") == data.user_id and j_data.get("status") in ("pending", "running"):
                logger.info(f"🔄 Re-attaching {data.user_id} to existing running job {j_id}")
                return {"job_id": j_id, "status": "running", "poll_url": f"{BASE_URL}/jobs/{j_id}"}


    job_id = str(uuid.uuid4())
    _set_job(job_id, {
        "status":     "pending",
        "user_id":    data.user_id,
        "result":     None,
        "error":      None,
        "created_at": time.time(),
    })

    background_tasks.add_task(_background_sync, job_id, data.user_id, data.events)

    logger.info(f"🔄 Async job {job_id} queued for {data.user_id} (persisted)")
    return {"job_id": job_id, "status": "pending", "poll_url": f"{BASE_URL}/jobs/{job_id}"}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_api_key)],
         summary="Poll the status of an async simulation job")
def get_job_status(job_id: str):
    """
    Returns the current status of a background simulation job.
    Job state is read from the persistent file store so it survives reloads.

    - **pending** → queued, not started yet
    - **running** → BioGears engine is executing
    - **done** → finished, `result` contains vitals and report_url
    - **failed** → something went wrong, `error` contains the reason
    """
    job = _get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Job '{job_id}' not found. "
                "It may have expired (jobs are kept for 2 hours) or the ID is incorrect."
            )
        )
    return {
        "job_id":  job_id,
        "status":  job["status"],
        "user_id": job["user_id"],
        "result":  job.get("result"),
        "error":   job.get("error"),
    }


# ── 7. HISTORY ────────────────────────────────────────────────────────────────

@app.get("/history/{user_id}", dependencies=[Depends(require_api_key)],
         summary="List all simulation sessions for a twin")
def get_history_list(user_id: str):
    user_path = USER_HISTORY_DIR / user_id
    if not user_path.exists():
        return {"user_id": user_id, "sessions": []}

    files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime, reverse=True)
    sessions = []
    for f in files:
        sessions.append({
            "session_id": f.name.replace("vitals_", "").replace(".csv", ""),
            "timestamp": datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat()
        })
    return {"user_id": user_id, "sessions": sessions}


@app.get("/history/{user_id}/{session_id}", dependencies=[Depends(require_api_key)],
         summary="Get timeseries vitals data for a specific session")
def get_session_data(user_id: str, session_id: str):
    """Returns up to 100 downsampled data points for charting."""
    file_path = USER_HISTORY_DIR / user_id / f"vitals_{session_id}.csv"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Session not found.")

    # Fix for BioGears extra column bug: tell pandas not to use col 0 as index
    df = pd.read_csv(file_path, index_col=False)
    df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
    df.columns = [c.split('(')[0].strip() for c in df.columns]

    if len(df) > 100:
        df = df.iloc[::max(1, int(len(df) / 100))]

    return df.to_dict(orient="records")


# ── 8. REPORTS ────────────────────────────────────────────────────────────────

@app.get("/reports/{user_id}", dependencies=[Depends(require_api_key)],
         summary="List all generated health reports for a twin")
def get_reports(user_id: str):
    """
    Scans the reports directory for PNGs belonging to this user and returns
    their URLs for embedding in the frontend.
    """
    if not REPORT_DIR.exists():
        return {"user_id": user_id, "reports": []}

    report_files = sorted(
        [f for f in REPORT_DIR.glob(f"{user_id}_*") if f.suffix in (".png", ".jpg")],
        key=os.path.getmtime,
        reverse=True
    )

    reports = []
    for f in report_files:
        stem = f.stem  # e.g. alice_20260322_150000_report
        # Determine type
        rtype = "forecast" if "forecast" in stem else "health"
        reports.append({
            "filename": f.name,
            "type": rtype,
            "url": f"{BASE_URL}/view-reports/{f.name}",
            "created_at": datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })

    return {"user_id": user_id, "reports": reports}


# ── 9. FORECAST ───────────────────────────────────────────────────────────────

@app.post("/predict/recovery", dependencies=[Depends(require_api_key)],
          summary="Run a physiological forecast for the next N hours")
def predict_recovery(data: PredictRequest):
    """
    Simulates the patient's physiology forward in time (default: 4 hours)
    without any interventions, and returns a forecast chart URL.
    """
    state_file = USER_STATES_DIR / f"{data.user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{data.user_id}' not found.")

    path, run_id, _csv_prefix = scenario_builder.build_forecast_scenario(
        data.user_id, str(state_file), hours=data.hours
    )
    if engine_runner.run_biogears(path):
        chart_url = visualizer.generate_forecast_report(data.user_id, run_id=run_id)
        return {"status": "success", "forecast_chart": chart_url, "hours": data.hours}
    raise HTTPException(status_code=500, detail="Forecast engine failed.")


# ── GREEN TIER: ANALYTICS ENDPOINTS ──────────────────────────────────────────

@app.get("/analytics/organ-scores/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Get organ-specific health scores for the Twin markers")
def get_organ_scores(user_id: str):
    return analytics.compute_organ_scores(user_id, USER_HISTORY_DIR)


@app.get("/analytics/vitals-progress/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Get historical progress trends (weeks/months)")
def get_vitals_progress(user_id: str, timespan: str = "month"):
    return analytics.compute_historical_progress(user_id, USER_HISTORY_DIR, timespan)


@app.post("/sync/undo/{user_id}", dependencies=[Depends(require_api_key)],
          summary="Revert Twin state to the previous successful simulation")
def undo_last_simulation(user_id: str):
    """
    Reverts the twin's XML state file to the most recent backup.
    This effectively 'undos' the last simulation run.
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    bak_dir = USER_STATES_DIR / "backups" / user_id
    
    if not bak_dir.exists():
        raise HTTPException(status_code=404, detail="No backups found for this twin.")
        
    backups = sorted(bak_dir.glob(f"{user_id}_*.xml"), key=os.path.getmtime, reverse=True)
    if len(backups) < 2:
        # Index 0 is the backup of the current state. We need Index 1.
        raise HTTPException(status_code=404, detail="Not enough history to undo.")
        
    target_bak = backups[1] # The one before the current state
    try:
        shutil.copy2(str(target_bak), str(state_file))
        # Optional: remove the latest CSV result if we want to be very clean
        logger.info(f"⏪ Undo successful for {user_id}. Reverted to {target_bak.name}")
        return {"status": "success", "message": "State reverted successfully."}
    except Exception as e:
        logger.error(f"Undo failed: {e}")
        raise HTTPException(status_code=500, detail="Reversion failed.")


@app.get("/metrics/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Compute BMI, BSA, ideal weight and other body metrics")
def get_metrics(user_id: str):
    """
    Derives body-composition metrics from stored profile metadata.
    **No simulation required** — instant response.

    - **BMI** with category (Underweight / Normal / Overweight / Obese)
    - **BSA** (DuBois formula, m²)
    - **Ideal Body Weight** (Devine formula, kg)
    - **Weight vs Ideal** (percentage difference)
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    meta = db.get_profile(user_id)
    if not meta:
        raise HTTPException(
            status_code=404,
            detail="Profile metadata not found. Re-register the twin to store metadata."
        )

    result = analytics.compute_metrics(meta)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@app.get("/history/{user_id}/{session_id}/stats", dependencies=[Depends(require_api_key)],
         summary="Get min/max/mean/std statistics for a specific session")
def get_session_stats(user_id: str, session_id: str):
    """
    Returns descriptive statistics (min, max, mean, std) for every vital
    tracked in a single simulation session.
    """
    csv_path = USER_HISTORY_DIR / user_id / f"vitals_{session_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Session not found.")

    result = analytics.compute_session_stats(csv_path)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@app.get("/vitals/{user_id}/trends", dependencies=[Depends(require_api_key)],
         summary="Analyse how vitals have trended across all past sessions")
def get_vitals_trends(user_id: str):
    """
    Aggregates data from every saved session to reveal long-term trends.

    - Per-session average of each vital (ordered chronologically)
    - Trend direction per vital: `increasing` / `decreasing` / `stable`
    - Overall averages across all sessions
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    return analytics.compute_trends(user_id, USER_HISTORY_DIR)


@app.get("/health-score/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Get a 0–100 composite health score from the latest session")
def get_health_score(user_id: str):
    """
    Calculates a composite health score (0–100, graded A–F) from the most
    recent simulation session. Each vital is independently scored against
    its clinical normal range and weighted equally.

    > **Disclaimer**: This is a physiological simulation score, not a medical diagnosis.
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    result = analytics.compute_health_score(user_id, USER_HISTORY_DIR)
    if result.get("score") is None:
        raise HTTPException(status_code=404, detail=result.get("error", "No sessions found."))
    return result


@app.get("/export/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Download a ZIP archive of all historical data for a twin")
def export_user_data(user_id: str):
    """
    Packages all of a twin's simulation CSVs and their profile metadata
    into a single `.zip` file for download or offline analysis.
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    meta = db.get_profile(user_id) or {}
    zip_bytes = analytics.build_export_zip(user_id, USER_HISTORY_DIR, meta)

    filename = f"{user_id}_digital_twin_export_{datetime.datetime.now().strftime('%Y%m%d')}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── SSE STREAMING ENDPOINTS ──────────────────────────────────────────────

class StreamSyncRequest(BaseModel):
    user_id: str
    events: List[HealthEvent]


@app.post("/stream/start", dependencies=[Depends(require_api_key)],
          summary="Start an SSE-streaming simulation — returns a stream_id immediately")
def stream_start(data: StreamSyncRequest):
    """
    Kicks off a BioGears simulation in a background thread and returns a
    `stream_id` instantly.  The client should then open an EventSource
    connection to `GET /stream/{stream_id}` to receive live vitals.

    **Typical frontend flow:**
    ```js
    const {stream_id} = await fetch('/stream/start', {method:'POST', body: JSON.stringify(payload)}).then(r=>r.json())
    const es = new EventSource(`/stream/${stream_id}`)
    es.onmessage = e => { const d = JSON.parse(e.data); updateChart(d) }
    ```
    """
    try:
        result = streaming.start_stream(data.user_id, data.events)
        return {
            **result,
            "sse_url": f"{streaming.BASE_URL}/stream/{result['stream_id']}"
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Stream start failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stream/{stream_id}", dependencies=[Depends(require_api_key)],
         summary="SSE stream: connect with EventSource to receive live vitals")
async def stream_vitals(stream_id: str):
    """
    **Server-Sent Events endpoint.**  Connect using the browser `EventSource`
    API or any SSE client library.

    Event types emitted:
    | type | payload |
    |------|---------|
    | `status` | `{message: str}` — engine lifecycle messages |
    | `vitals` | `{time, heart_rate, glucose, systolic, diastolic, respiration}` |
    | `done` | `{vitals, report_url, rows_streamed}` — final summary |
    | `error` | `{message: str}` — engine failure |
    """
    if stream_id not in streaming._stream_jobs:
        raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found.")

    return StreamingResponse(
        streaming.sse_generator(stream_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disables nginx buffering
            "Connection": "keep-alive",
        }
    )


# ── WHAT-IF COMPARISON ────────────────────────────────────────────────────────

@app.post("/predict/whatif", dependencies=[Depends(require_api_key)],
          summary="Run a what-if comparison: baseline vs one intervention event")
def predict_whatif(data: WhatIfRequest):
    """
    Runs **two** BioGears simulations from the same engine state:

    1. **Baseline** — advances time with no interventions
    2. **Intervention** — applies `event` (exercise / meal / substance / environment), then advances

    Returns chart URLs for both runs plus a **side-by-side comparison chart**.

    > Note: Runs two full simulations sequentially — takes roughly 2× normal time.
    """
    state_file = USER_STATES_DIR / f"{data.user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{data.user_id}' not found.")

    event_dict = data.event.dict()
    errors = sim_validator.validate_events([event_dict])
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    base_path, evt_path, base_run_id, evt_run_id, base_prefix, evt_prefix = \
        scenario_builder.build_whatif_scenario(
            data.user_id, str(state_file), event_dict, hours=data.hours
        )

    # Run baseline
    if not engine_runner.run_biogears(base_path, user_id=data.user_id):
        raise HTTPException(status_code=500, detail="Baseline simulation failed.")

    base_csv_name = f"{base_prefix}Results.csv"
    base_candidates = list(BIOGEARS_BIN_DIR.rglob(base_csv_name))
    if not base_candidates:
        raise HTTPException(status_code=500, detail="Baseline output CSV not found.")
    base_df = pd.read_csv(str(base_candidates[0]), index_col=False)
    base_df = base_df.loc[:, ~base_df.columns.str.contains('^Unnamed')]
    base_df.columns = [c.split('(')[0].strip() for c in base_df.columns]
    base_report = visualizer.generate_health_report(data.user_id, run_id=base_run_id,
                                                    custom_path=base_candidates[0])

    # Run intervention
    if not engine_runner.run_biogears(evt_path, user_id=data.user_id):
        raise HTTPException(status_code=500, detail="Intervention simulation failed.")

    evt_csv_name = f"{evt_prefix}Results.csv"
    evt_candidates = list(BIOGEARS_BIN_DIR.rglob(evt_csv_name))
    if not evt_candidates:
        raise HTTPException(status_code=500, detail="Intervention output CSV not found.")
    evt_df = pd.read_csv(str(evt_candidates[0]), index_col=False)
    evt_df = evt_df.loc[:, ~evt_df.columns.str.contains('^Unnamed')]
    evt_df.columns = [c.split('(')[0].strip() for c in evt_df.columns]
    evt_report = visualizer.generate_health_report(data.user_id, run_id=evt_run_id,
                                                   custom_path=evt_candidates[0])

    intervention_label = (
        f"{event_dict.get('event_type', 'event').title()}"
        + (f" ({event_dict.get('substance_name', '')})" if event_dict.get("substance_name") else "")
    )
    comparison_report = visualizer.generate_comparison_report(
        data.user_id, base_df, evt_df, intervention_label=intervention_label
    )

    return {
        "status": "success",
        "hours": data.hours,
        "baseline_chart": base_report,
        "intervention_chart": evt_report,
        "comparison_chart": comparison_report,
        "intervention_label": intervention_label,
    }


# ── ENGINE LOG VIEWER ─────────────────────────────────────────────────────────

@app.get("/engine/log/{user_id}", dependencies=[Depends(require_api_key)],
         summary="Retrieve the latest BioGears engine log for debugging")
def get_engine_log(user_id: str):
    """
    Returns the content of the most recent engine log file for a twin.
    Useful for diagnosing simulation failures without SSH access to the server.
    """
    user_id = user_id
    log_content = engine_runner.get_latest_log(user_id)
    if log_content is None:
        raise HTTPException(
            status_code=404,
            detail=f"No engine logs found for '{user_id}'. "
                   "Run at least one simulation first."
        )
    return {
        "user_id": user_id,
        "log": log_content,
        "lines": len(log_content.splitlines()),
    }


# NOTE: /health endpoint is defined earlier in the file (line ~405) — no duplicate here.

# ── CVD RISK SCORE ────────────────────────────────────────────────────────────

@app.get("/analytics/cvd-risk/{user_id}", dependencies=[Depends(require_api_key)],
         summary="10-year cardiovascular risk score (Framingham + South Asian adjustment)")
def get_cvd_risk(user_id: str):
    """
    Computes a 10-year CVD risk estimate from the twin's demographic + clinical metadata.
    Uses Framingham point scoring with a 1.5× multiplier for South Asian ethnicity.
    """
    profile = db.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")
    # db.get_profile() returns the metadata dict directly (not nested under 'metadata')
    return analytics.compute_cvd_risk(profile)


# ── TIME-IN-RANGE ─────────────────────────────────────────────────────────────

@app.get("/analytics/time-in-range/{user_id}/{session_id}",
         dependencies=[Depends(require_api_key)],
         summary="Time-in-Range glucose metric for a specific session")
def get_time_in_range(user_id: str, session_id: str):
    """
    Returns TIR (time-in-range), TAR (time-above-range), TBR (time-below-range),
    and glycemic variability CV% for one session's glucose data.
    Thresholds: 70–140 mg/dL (non-diabetic), 70–180 mg/dL (diabetic users).
    """
    csv_path = USER_HISTORY_DIR / user_id / f"vitals_{session_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    profile   = db.get_profile(user_id) or {}
    # db.get_profile() returns the metadata dict directly
    has_diab  = profile.get("has_type1_diabetes") or profile.get("has_type2_diabetes")
    return analytics.compute_time_in_range(csv_path, has_diabetes=bool(has_diab))


# ── PREDICTED HbA1c ────────────────────────────────────────────────────────────

@app.get("/analytics/predicted-hba1c/{user_id}",
         dependencies=[Depends(require_api_key)],
         summary="Predicted HbA1c derived from simulated glucose averages")
def get_predicted_hba1c(user_id: str):
    """
    Estimates HbA1c (%) from the average simulated blood glucose across all sessions.
    Uses the ADAG formula: HbA1c = (mean_glucose + 46.7) / 28.7
    """
    result = analytics.predict_hba1c(user_id, USER_HISTORY_DIR)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── WEEKLY INSIGHT SUMMARY ────────────────────────────────────────────────────

@app.get("/analytics/weekly-summary/{user_id}",
         dependencies=[Depends(require_api_key)],
         summary="Plain-language weekly health insight summary")
def get_weekly_summary(user_id: str):
    """
    Reads the last 7 sessions and returns:
    - Best heart rate day
    - Average glucose
    - HR trend direction
    - Personalized health insights as plain-text strings
    """
    result = analytics.generate_weekly_summary(user_id, USER_HISTORY_DIR)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── PERSONAL NORMAL RANGES ────────────────────────────────────────────────────

@app.get("/analytics/personal-norms/{user_id}",
         dependencies=[Depends(require_api_key)],
         summary="Personal vital normal ranges computed from user's own simulation history")
def get_personal_norms(user_id: str):
    """
    After ≥ 5 sessions, computes personal mean ± 1SD for each vital.
    Returns personal_lo and personal_hi thresholds per vital.
    """
    return analytics.compute_personal_norms(user_id, USER_HISTORY_DIR)


# ── RECOVERY READINESS ────────────────────────────────────────────────────────

@app.get("/analytics/recovery-readiness/{user_id}",
         dependencies=[Depends(require_api_key)],
         summary="Recovery Readiness Score (0–100): Ready / Caution / Rest")
def get_recovery_readiness(user_id: str):
    """
    Computes a composite Recovery Readiness Score from:
    - Resting HR deviation from personal baseline (HR elevation = fatigue)
    - Recent sleep hours if logged
    - VO2max from profile (higher = faster recovery)

    Returns a Ready/Caution/Rest recommendation with factor breakdown.
    """
    profile = db.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")
    result = analytics.compute_recovery_readiness(user_id, USER_HISTORY_DIR, metadata=profile)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── BMR / CALORIC BALANCE ─────────────────────────────────────────────────────

@app.post("/analytics/caloric-balance/{user_id}",
          dependencies=[Depends(require_api_key)],
          summary="BMR and caloric balance estimate for a set of events")
def get_caloric_balance(user_id: str, events: List[HealthEvent]):
    """
    Computes BMR (Mifflin-St Jeor) + exercise caloric burn and compares against
    meal calorie intake from the provided event list.
    """
    profile = db.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")
    # db.get_profile() returns the metadata dict directly
    event_dicts = [e.dict() for e in events]
    return analytics.compute_bmr_and_balance(profile, event_dicts)


# ── TWIN STATE BACKUP ─────────────────────────────────────────────────────────

@app.post("/twin/{user_id}/backup", dependencies=[Depends(require_api_key)],
          summary="Create a timestamped backup of a twin's engine state")
def backup_twin(user_id: str):
    """
    Copies the current engine state file to a dated backup.
    Keeps the last 7 backups automatically.
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise HTTPException(status_code=404, detail=f"Twin '{user_id}' not found.")

    backup_dir = USER_STATES_DIR / "backups" / user_id
    backup_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"{user_id}_{ts}.xml"
    shutil.copy2(str(state_file), str(dest))

    # Prune — keep only the 7 most recent backups
    existing = sorted(backup_dir.glob(f"{user_id}_*.xml"), key=os.path.getmtime, reverse=True)
    for old in existing[7:]:
        try: old.unlink()
        except: pass

    logger.info(f"🗂️ Backup created for {user_id}: {dest.name}")
    return {
        "status": "backup_created",
        "file": dest.name,
        "backups_kept": min(len(existing) + 1, 7),
    }


@app.post("/twin/{user_id}/restore", dependencies=[Depends(require_api_key)],
          summary="Restore a twin's engine state from a backup")
def restore_twin(user_id: str, backup_filename: str = Query(...)):
    """
    Restores a specific backup file as the active twin state.
    Pass `backup_filename` (just the filename, not full path).
    """
    backup_dir = USER_STATES_DIR / "backups" / user_id
    backup_file = backup_dir / backup_filename
    if not backup_file.exists():
        raise HTTPException(status_code=404,
                            detail=f"Backup '{backup_filename}' not found for twin '{user_id}'.")

    state_file = USER_STATES_DIR / f"{user_id}.xml"
    shutil.copy2(str(backup_file), str(state_file))
    logger.info(f"♻️ Twin {user_id} restored from backup: {backup_filename}")
    return {"status": "restored", "from_backup": backup_filename}


@app.get("/twin/{user_id}/backups", dependencies=[Depends(require_api_key)],
         summary="List all available backups for a twin")
def list_backups(user_id: str):
    backup_dir = USER_STATES_DIR / "backups" / user_id
    if not backup_dir.exists():
        return {"backups": []}
    files = sorted(backup_dir.glob(f"{user_id}_*.xml"), key=os.path.getmtime, reverse=True)
    return {
        "backups": [
            {
                "filename": f.name,
                "created": datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                "size_kb": round(f.stat().st_size / 1024, 1),
            }
            for f in files
        ]
    }