"""
result_parser.py — CSV result reader + anomaly detection.

v3 additions:
  - detect_anomalies(df) — scans output for physiologically impossible values
  - parse_results() now also returns anomaly flags
  - safe_float() handles BioGears IND/Infinite artefacts
"""

import math
import pandas as pd
import warnings
warnings.filterwarnings("ignore", category=pd.errors.ParserWarning)
from biogears_service.simulation.config import BIO_OUTPUT_DIR, SCENARIO_API_DIR


# ── Anomaly thresholds (clinically critical ranges) ──────────────────────────
_ANOMALY_CHECKS = [
    {"col": "HeartRate",                  "lo": 30,   "hi": 200,  "label": "Heart Rate",       "unit": "bpm"},
    {"col": "SystolicArterialPressure",   "lo": 60,   "hi": 220,  "label": "Systolic BP",      "unit": "mmHg"},
    {"col": "DiastolicArterialPressure",  "lo": 30,   "hi": 140,  "label": "Diastolic BP",     "unit": "mmHg"},
    {"col": "OxygenSaturation",           "lo": 0.80, "hi": 1.01, "label": "SpO₂",             "unit": "fraction"},
    {"col": "RespirationRate",            "lo": 4,    "hi": 40,   "label": "Respiration Rate", "unit": "br/min"},
    {"col": "CoreTemperature",            "lo": 34.0, "hi": 42.0, "label": "Core Temperature", "unit": "°C"},
    {"col": "Glucose-BloodConcentration", "lo": 40,   "hi": 500,  "label": "Blood Glucose",    "unit": "mg/dL"},
]

# Clinically-specific severity thresholds (cannot use a uniform percentage formula
# because SpO₂ at 0.80 fraction vs HeartRate at 30 bpm have very different scales).
_CRITICAL_LO = {
    "HeartRate":                  20,    # < 20 bpm = cardiac arrest
    "SystolicArterialPressure":   40,    # < 40 mmHg = shock
    "DiastolicArterialPressure":  20,    # < 20 mmHg = shock
    "OxygenSaturation":           0.70,  # < 70% = severe hypoxia
    "RespirationRate":            2,     # < 2 br/min = apnea
    "CoreTemperature":            32.0,  # < 32°C = severe hypothermia
    "Glucose-BloodConcentration": 30,    # < 30 mg/dL = severe hypoglycemia
}
_CRITICAL_HI = {
    "HeartRate":                  250,   # > 250 bpm = ventricular fibrillation
    "SystolicArterialPressure":   260,   # > 260 mmHg = hypertensive emergency
    "DiastolicArterialPressure":  160,
    "OxygenSaturation":           1.01,  # above 1.0 = sensor error (use warning)
    "RespirationRate":            50,    # > 50 br/min = respiratory distress
    "CoreTemperature":            43.0,  # > 43°C = severe hyperthermia
    "Glucose-BloodConcentration": 600,   # > 600 mg/dL = HHS crisis
}


def safe_float(value) -> float:
    """
    Handles BioGears IND/Infinite artefacts that appear on engine crash.

    Returns:
      - The float value if it is a valid finite number.
      - 0.0 for BioGears IND ("1.#IND", "-1.$") artefacts — these indicate the
        engine diverged; 0.0 allows downstream NaN/zero-HR checks to catch them.
      - float('nan') for Python/pandas NaN/Inf so downstream math.isnan checks work.
    """
    if pd.isna(value):
        return float('nan')
    try:
        v = float(value)
        if math.isnan(v) or math.isinf(v):
            return float('nan')
        return v
    except (ValueError, TypeError):
        val_str = str(value).lower()
        if val_str in ("none", "", "na", "<na>", "nan"):
            return float('nan')
        # BioGears platform-specific IND tokens (Windows MSVC / Linux GCC)
        if any(tok in val_str for tok in ("-1.$", "1.#ind", "ind", "inf")):
            return 0.0  # engine divergence — 0.0 triggers the all-zero HR check
        return 0.0


def detect_anomalies(df: pd.DataFrame) -> list:
    """
    Scans a session DataFrame for physiologically impossible values.
    Returns a list of anomaly dicts:
      { label, unit, value, threshold, direction, severity }
    Empty list = all values are within clinical bounds.

    FIX: Also flags all-zero values (engine divergence) — BioGears can
    produce all zeros when it crashes and exits 0. Previously zero was
    silently ignored (val_min < lo AND val_min > 0 filtered it out).
    """
    if df is None or df.empty:
        return []

    # Normalize column names (strip units)
    clean_cols = {c: c.split('(')[0].strip() for c in df.columns}
    df = df.rename(columns=clean_cols)

    anomalies = []
    for check in _ANOMALY_CHECKS:
        col = check["col"]
        if col not in df.columns:
            continue
        series = df[col].apply(safe_float).replace(0.0, float('nan')).dropna()
        if series.empty:
            # All values were 0 or NaN → engine divergence
            anomalies.append({
                "label":     check["label"],
                "unit":      check["unit"],
                "value":     0.0,
                "threshold": check["lo"],
                "direction": "zero_or_nan",
                "severity":  "critical",
                "note":      "Engine produced all-zero output (physiological divergence).",
            })
            continue

        val_min = float(series.min())
        val_max = float(series.max())

        if val_min < check["lo"]:
            severity = (
                "critical"
                if val_min <= _CRITICAL_LO.get(col, check["lo"] * 0.7)
                else "warning"
            )
            anomalies.append({
                "label":     check["label"],
                "unit":      check["unit"],
                "value":     round(val_min, 3),
                "threshold": check["lo"],
                "direction": "below",
                "severity":  severity,
            })
        elif val_max > check["hi"]:
            severity = (
                "critical"
                if val_max >= _CRITICAL_HI.get(col, check["hi"] * 1.3)
                else "warning"
            )
            anomalies.append({
                "label":     check["label"],
                "unit":      check["unit"],
                "value":     round(val_max, 3),
                "threshold": check["hi"],
                "direction": "above",
                "severity":  severity,
            })

    return anomalies


def get_csv_path(user_id: str):
    """Locate the results CSV for a user (checks two known BioGears output dirs)."""
    for candidate in [
        BIO_OUTPUT_DIR   / f"run_{user_id}Results.csv",
        SCENARIO_API_DIR / f"run_{user_id}Results.csv",
    ]:
        if candidate.exists():
            return candidate
    return SCENARIO_API_DIR / f"run_{user_id}Results.csv"


def parse_results(user_id: str) -> dict:
    """Parse the last row of a results CSV into a vitals dict + anomaly flags."""
    csv_path = get_csv_path(user_id)
    if not csv_path.exists():
        return {"error": "CSV not found"}

    df = pd.read_csv(csv_path, index_col=False)
    df.columns = [c.split('(')[0].strip() for c in df.columns]
    latest = df.iloc[-1]

    def _get(col: str) -> float:
        for c in df.columns:
            if col.lower() in c.lower():
                return safe_float(latest[c])
        return 0.0

    anomalies = detect_anomalies(df)

    return {
        # Prefer the named 'Time' column; fall back to column 0 if it's absent
        # (BioGears always puts simulation time first but the column name may vary).
        "simulation_end_time": round(
            safe_float(df["Time"].iloc[-1]) if "Time" in df.columns
            else safe_float(df.iloc[-1, 0]),
            1
        ),
        "heart_rate":          round(_get("HeartRate"), 1),
        "blood_glucose":       round(_get("Glucose-BloodConcentration"), 2),
        "systolic_bp":         round(_get("SystolicArterialPressure"), 1),
        "diastolic_bp":        round(_get("DiastolicArterialPressure"), 1),
        "spo2":                round(_get("OxygenSaturation"), 3),
        "core_temperature":    round(_get("CoreTemperature"), 2),
        "respiration_rate":    round(_get("RespirationRate"), 1),
        "anomalies":           anomalies,
        "has_anomaly":         len(anomalies) > 0,
    }


def get_full_history(user_id: str) -> pd.DataFrame | None:
    """Return the full cleaned DataFrame, or None if not found."""
    csv_path = get_csv_path(user_id)
    if not csv_path.exists():
        return None
    df = pd.read_csv(csv_path, index_col=False)
    df.columns = [c.split('(')[0].strip() for c in df.columns]
    return df