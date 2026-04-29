"""
analytics.py — Pure-Python analytics module for the Digital Twin backend.
All functions operate on stored CSVs and metadata — zero BioGears engine calls.
"""

import os
import io
import math
import json
import zipfile
import datetime
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, List


# ---------------------------------------------------------------------------
# NORMAL RANGES  (used by health score + trend flags)
# ---------------------------------------------------------------------------
NORMAL = {
    "heart_rate":   {"low": 60,  "high": 100,  "label": "bpm"},
    "systolic":     {"low": 90,  "high": 120,  "label": "mmHg"},
    "diastolic":    {"low": 60,  "high": 80,   "label": "mmHg"},
    "glucose":      {"low": 70,  "high": 140,  "label": "mg/dL"},
    "respiration":  {"low": 12,  "high": 20,   "label": "br/min"},
}


def _clean_df(csv_path: Path) -> Optional[pd.DataFrame]:
    """Load a vitals CSV and normalize column names."""
    try:
        if not csv_path.exists() or csv_path.stat().st_size == 0:
            return None
        # Fix for BioGears extra column bug: tell pandas not to use col 0 as index
        df = pd.read_csv(csv_path, index_col=False)
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        df.columns = [c.split('(')[0].strip() for c in df.columns]
        return df
    except Exception:
        return None


def _score_value(val: float, low: float, high: float) -> float:
    """
    Returns a 0.0 – 1.0 score for a single vital against its normal range.
    Full score (1.0) if within range, decays linearly beyond 1× the range width.
    """
    if low <= val <= high:
        return 1.0
    width = high - low
    if val < low:
        deviation = (low - val) / width
    else:
        deviation = (val - high) / width
    return max(0.0, 1.0 - deviation)


# ---------------------------------------------------------------------------
# 1. HEALTH METRICS  (BMI, BSA, ideal weight, pulse pressure)
# ---------------------------------------------------------------------------
def compute_metrics(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Derives body composition metrics from stored demographic data.
    No simulation required.
    Uses WHO South Asian BMI thresholds when ethnicity == 'South Asian'.
    """
    weight = metadata.get("weight")   # kg
    height = metadata.get("height")  # cm
    sex = metadata.get("sex", "Male")
    ethnicity = metadata.get("ethnicity", "Other")
    hba1c = metadata.get("hba1c")

    if not weight or not height:
        return {"error": "Weight and height not available in profile metadata."}

    h_m = height / 100.0                  # metres
    bmi = round(weight / (h_m ** 2), 1)

    # DuBois BSA formula
    bsa = round(0.007184 * (weight ** 0.425) * (height ** 0.725), 3)

    # Devine ideal body weight (kg)
    h_inches = height / 2.54
    if sex.lower() == "male":
        ibw = 50.0 + 2.3 * max(0, h_inches - 60)
    else:
        ibw = 45.5 + 2.3 * max(0, h_inches - 60)
    ibw = round(ibw, 1)

    # % difference from ideal
    weight_diff_pct = round((weight - ibw) / ibw * 100, 1)

    # ── BMI category ──────────────────────────────────────────────────────────
    # South Asian thresholds: WHO Expert Consultation, Lancet 2004
    #   Normal  = 18.5–22.9   (vs 18.5–24.9 globally)
    #   Overweight = 23–27.4  (vs 25–29.9 globally)
    #   Obese      = ≥ 27.5   (vs ≥ 30 globally)
    is_south_asian = str(ethnicity).lower() == "south asian"
    if bmi < 18.5:
        bmi_category = "Underweight"
        bmi_note = None
    elif is_south_asian:
        if bmi < 23.0:
            bmi_category = "Normal"
            bmi_note = "Within healthy range for South Asians (< 23)"
        elif bmi < 27.5:
            bmi_category = "Overweight"
            bmi_note = "South Asian overweight threshold is BMI ≥ 23 (WHO 2004)"
        else:
            bmi_category = "Obese"
            bmi_note = "South Asian obese threshold is BMI ≥ 27.5 (WHO 2004)"
    else:
        if bmi < 25:
            bmi_category = "Normal"
            bmi_note = None
        elif bmi < 30:
            bmi_category = "Overweight"
            bmi_note = None
        else:
            bmi_category = "Obese"
            bmi_note = None

    # ── HbA1c interpretation ──────────────────────────────────────────────────
    hba1c_note = None
    if hba1c is not None:
        if hba1c < 5.7:
            hba1c_note = "Normal"
        elif hba1c < 6.5:
            hba1c_note = "Prediabetes"
        else:
            hba1c_note = "Diabetes range"

    return {
        "bmi": bmi,
        "bmi_category": bmi_category,
        "bmi_note": bmi_note,
        "bsa_m2": bsa,
        "ideal_body_weight_kg": ibw,
        "actual_weight_kg": weight,
        "weight_vs_ideal_pct": weight_diff_pct,
        "height_cm": height,
        "sex": sex,
        "ethnicity": ethnicity,
        "hba1c": hba1c,
        "hba1c_note": hba1c_note,
    }


# ---------------------------------------------------------------------------
# 2. SESSION STATISTICS  (min / max / avg / std per vital)
# ---------------------------------------------------------------------------
def compute_session_stats(csv_path: Path) -> Dict[str, Any]:
    """Returns descriptive statistics for every tracked vital in one session."""
    df = _clean_df(csv_path)
    if df is None:
        return {"error": "Session file not found or empty."}

    columns_of_interest = {
        "HeartRate": "heart_rate",
        "SystolicArterialPressure": "systolic_bp",
        "DiastolicArterialPressure": "diastolic_bp",
        "RespirationRate": "respiration_rate",
        "Glucose-BloodConcentration": "glucose",
        "AchievedExerciseLevel": "exercise_level",
    }

    stats = {}
    for col, alias in columns_of_interest.items():
        if col in df.columns:
            series = df[col].dropna()
            if len(series) == 0:
                continue
            stats[alias] = {
                "min":  round(float(series.min()), 2),
                "max":  round(float(series.max()), 2),
                "mean": round(float(series.mean()), 2),
                "std":  round(float(series.std()), 2),
                "unit": NORMAL.get(alias.replace("_bp", "").replace("systolic_", "").replace("diastolic_", ""), {}).get("label", ""),
            }

    # duration
    if "Time" in df.columns:
        stats["duration_seconds"] = int(df["Time"].iloc[-1] - df["Time"].iloc[0])

    return {"stats": stats, "data_points": len(df)}


# ---------------------------------------------------------------------------
# 3. TREND ANALYSIS  (per-session averages over time)
# ---------------------------------------------------------------------------
def compute_trends(user_id: str, history_dir: Path) -> Dict[str, Any]:
    """
    Reads every saved session for a user and returns a time-ordered list
    of per-session averages, plus overall trend direction per vital.
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"sessions": [], "trends": {}}

    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime)
    if not csv_files:
        return {"sessions": [], "trends": {}}

    tracked = {
        "HeartRate":                 "heart_rate",
        "SystolicArterialPressure":  "systolic_bp",
        "DiastolicArterialPressure": "diastolic_bp",
        "RespirationRate":           "respiration_rate",
        "Glucose-BloodConcentration":"glucose",
    }

    sessions = []
    per_vital_values: Dict[str, list] = {alias: [] for alias in tracked.values()}

    for f in csv_files:
        df = _clean_df(f)
        if df is None:
            continue
        session_id = f.name.replace("vitals_", "").replace(".csv", "")
        timestamp = datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat()
        row: Dict[str, Any] = {"session_id": session_id, "timestamp": timestamp}
        for col, alias in tracked.items():
            if col in df.columns:
                avg = round(float(df[col].mean()), 2)
                row[alias] = avg
                per_vital_values[alias].append(avg)
        sessions.append(row)

    # Determine trend direction using simple linear regression slope
    def _trend_direction(values: list) -> str:
        if len(values) < 2:
            return "stable"
        x = list(range(len(values)))
        slope = np.polyfit(x, values, 1)[0]
        if abs(slope) < 0.05 * (max(values) - min(values) + 1e-9):
            return "stable"
        return "increasing" if slope > 0 else "decreasing"

    # For HR and BP, decreasing toward normal is "improving"
    # For glucose, stable-low is better
    trend_meta = {
        "heart_rate":    {"direction": _trend_direction(per_vital_values["heart_rate"]),
                          "normal_range": "60–100 bpm"},
        "systolic_bp":   {"direction": _trend_direction(per_vital_values["systolic_bp"]),
                          "normal_range": "90–120 mmHg"},
        "diastolic_bp":  {"direction": _trend_direction(per_vital_values["diastolic_bp"]),
                          "normal_range": "60–80 mmHg"},
        "respiration_rate": {"direction": _trend_direction(per_vital_values["respiration_rate"]),
                             "normal_range": "12–20 br/min"},
        "glucose":       {"direction": _trend_direction(per_vital_values["glucose"]),
                          "normal_range": "70–140 mg/dL"},
    }

    # Overall averages
    overall_averages = {
        alias: round(float(np.mean(vals)), 2)
        for alias, vals in per_vital_values.items()
        if vals
    }

    return {
        "sessions": sessions,
        "trends": trend_meta,
        "overall_averages": overall_averages,
        "total_sessions": len(sessions),
    }


# ---------------------------------------------------------------------------
# 4. HEALTH SCORE  (0 – 100 composite from latest session vitals)
# ---------------------------------------------------------------------------
def compute_health_score(user_id: str, history_dir: Path) -> Dict[str, Any]:
    """
    Calculates a 0–100 composite health score from the most recent session.
    Each vital is scored against its normal range and weighted equally.
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"score": None, "error": "No simulation history found."}

    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime, reverse=True)
    if not csv_files:
        return {"score": None, "error": "No sessions found."}

    df = _clean_df(csv_files[0])
    if df is None:
        return {"score": None, "error": "Could not read latest session."}

    latest = df.iloc[-1]

    components = {}

    hr = latest.get("HeartRate", None)
    if hr is not None:
        s = _score_value(float(hr), 60, 100)
        components["heart_rate"] = {
            "value": round(float(hr), 1), "unit": "bpm",
            "score": round(s * 100), "normal": "60–100",
            "status": "Normal" if s == 1.0 else ("Low" if float(hr) < 60 else "High")
        }

    sys = latest.get("SystolicArterialPressure", None)
    if sys is not None:
        s = _score_value(float(sys), 90, 120)
        components["systolic_bp"] = {
            "value": round(float(sys), 1), "unit": "mmHg",
            "score": round(s * 100), "normal": "90–120",
            "status": "Normal" if s == 1.0 else ("Low" if float(sys) < 90 else "High")
        }

    dia = latest.get("DiastolicArterialPressure", None)
    if dia is not None:
        s = _score_value(float(dia), 60, 80)
        components["diastolic_bp"] = {
            "value": round(float(dia), 1), "unit": "mmHg",
            "score": round(s * 100), "normal": "60–80",
            "status": "Normal" if s == 1.0 else ("Low" if float(dia) < 60 else "High")
        }

    gluc = latest.get("Glucose-BloodConcentration", None)
    if gluc is not None:
        s = _score_value(float(gluc), 70, 140)
        components["glucose"] = {
            "value": round(float(gluc), 2), "unit": "mg/dL",
            "score": round(s * 100), "normal": "70–140",
            "status": "Normal" if s == 1.0 else ("Low" if float(gluc) < 70 else "High")
        }

    rr = latest.get("RespirationRate", None)
    if rr is not None:
        s = _score_value(float(rr), 12, 20)
        components["respiration"] = {
            "value": round(float(rr), 1), "unit": "br/min",
            "score": round(s * 100), "normal": "12–20",
            "status": "Normal" if s == 1.0 else ("Low" if float(rr) < 12 else "High")
        }

    # SpO2: BioGears returns OxygenSaturation as a 0–1 fraction.
    # Convert to percentage before scoring against 94–100% normal range.
    spo2_raw = latest.get("OxygenSaturation", None)
    if spo2_raw is not None:
        spo2_pct = float(spo2_raw) * 100.0
        s = _score_value(spo2_pct, 94.0, 100.0)
        components["spo2"] = {
            "value": round(spo2_pct, 1), "unit": "%",
            "score": round(s * 100), "normal": "94–100",
            "status": "Normal" if s == 1.0 else ("Low" if spo2_pct < 94 else "High")
        }

    # CoreTemperature: normal human range 36.5–37.5°C.
    core_temp = latest.get("CoreTemperature", None)
    if core_temp is not None:
        s = _score_value(float(core_temp), 36.5, 37.5)
        components["core_temp"] = {
            "value": round(float(core_temp), 2), "unit": "°C",
            "score": round(s * 100), "normal": "36.5–37.5",
            "status": "Normal" if s == 1.0 else ("Low" if float(core_temp) < 36.5 else "High")
        }

    if not components:
        return {"score": None, "error": "No recognizable vital columns in session."}

    composite = round(sum(c["score"] for c in components.values()) / len(components))

    if composite >= 90:
        grade, label = "A", "Excellent"
    elif composite >= 75:
        grade, label = "B", "Good"
    elif composite >= 60:
        grade, label = "C", "Fair"
    elif composite >= 40:
        grade, label = "D", "Poor"
    else:
        grade, label = "F", "Critical"

    return {
        "score": composite,
        "grade": grade,
        "label": label,
        "components": components,
        "based_on_session": csv_files[0].name,
        "disclaimer": "This is a physiological simulation score, not a medical diagnosis.",
    }


# ---------------------------------------------------------------------------
# 13. ORGAN HEALTH SCORES  (Anatomical grouping for the Twin UI)
# ---------------------------------------------------------------------------
def compute_organ_scores(user_id: str, history_dir: Path) -> Dict[str, Any]:
    """
    Groups BioGears vitals into anatomical systems for the digital twin markers.
    Uses weighted averages of component scores (0-100).
    """
    res = compute_health_score(user_id, history_dir)
    if "error" in res:
        return res

    comp = res["components"]
    
    # ── Heart (HR + BP) ──────────────────────────────────────────────────────
    hr_s  = comp.get("heart_rate", {}).get("score", 100)
    sys_s = comp.get("systolic_bp", {}).get("score", 100)
    dia_s = comp.get("diastolic_bp", {}).get("score", 100)
    heart_score = round(hr_s * 0.4 + sys_s * 0.3 + dia_s * 0.3)

    # ── Lungs (SpO2 + RR) ────────────────────────────────────────────────────
    # SpO2 is now correctly scored in compute_health_score above.
    spo2_s = comp.get("spo2", {}).get("score", 95)  # default 95 if not present
    resp_s = comp.get("respiration", {}).get("score", 100)
    lungs_score = round(spo2_s * 0.6 + resp_s * 0.4)

    # ── Gut (Glucose + metabolic stability) ──────────────────────────────────
    gluc_s = comp.get("glucose", {}).get("score", 100)
    # CoreTemp stability is also a gut/metabolic marker
    temp_s = comp.get("core_temp", {}).get("score", 100)
    gut_score = round(gluc_s * 0.7 + temp_s * 0.3)
    # Soft cap: gut score shouldn't exceed 100
    gut_score = min(gut_score, 100)

    # ── Brain (CoreTemperature stability) ─────────────────────────────────────
    # CoreTemperature tightly reflects autonomic nervous system balance.
    # Normal: 36.5–37.5°C. Deviations indicate thermoregulatory stress.
    temp_s = comp.get("core_temp", {}).get("score", 90)
    # HR also contributes — sustained elevated HR correlates with cognitive load.
    brain_score = round(temp_s * 0.6 + hr_s * 0.4)

    return {
        "user_id": user_id,
        "scores": {
            "heart": {"score": heart_score, "status": "good" if heart_score > 80 else ("warning" if heart_score > 60 else "critical")},
            "lungs": {"score": lungs_score, "status": "good" if lungs_score > 80 else ("warning" if lungs_score > 60 else "critical")},
            "gut":   {"score": gut_score,   "status": "good" if gut_score > 80 else ("warning" if gut_score > 60 else "critical")},
            "brain": {"score": brain_score, "status": "good" if brain_score > 80 else ("warning" if brain_score > 60 else "critical")},
            "liver": {"score": 95,          "status": "good"}, # Placeholder
            "legs":  {"score": 90,          "status": "good"}, # Placeholder
        },
        "overall_health_score": res["score"]
    }


# ---------------------------------------------------------------------------
# 14. HISTORICAL PROGRESS (Weekly/Monthly Trend Lines)
# ---------------------------------------------------------------------------
def compute_historical_progress(user_id: str, history_dir: Path, timespan: str = "month") -> Dict[str, Any]:
    """
    Returns a time-ordered series of health scores and key vitals for charting.
    timespan: 'week' (last 7 sessions) or 'month' (last 30 sessions).
    Health score is derived from ALL tracked vitals (composite), not just HR.
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"error": "No history found"}

    limit = 7 if timespan == "week" else 30
    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime)[-limit:]
    
    progress = []
    for f in csv_files:
        df = _clean_df(f)
        if df is None: continue
        
        # Build a composite score from available vitals (same logic as compute_health_score)
        latest = df.iloc[-1]
        scores = []
        hr = latest.get("HeartRate")
        if hr is not None:
            scores.append(_score_value(float(hr), 60, 100))

        sys_bp = latest.get("SystolicArterialPressure")
        if sys_bp is not None:
            scores.append(_score_value(float(sys_bp), 90, 120))

        gluc = latest.get("Glucose-BloodConcentration")
        if gluc is not None:
            scores.append(_score_value(float(gluc), 70, 140))

        rr = latest.get("RespirationRate")
        if rr is not None:
            scores.append(_score_value(float(rr), 12, 20))

        spo2_raw = latest.get("OxygenSaturation")
        if spo2_raw is not None:
            scores.append(_score_value(float(spo2_raw) * 100, 94, 100))

        composite = round(sum(scores) / len(scores) * 100) if scores else 50

        timestamp = datetime.datetime.fromtimestamp(f.stat().st_mtime).isoformat()
        progress.append({
            "timestamp": timestamp,
            "health_score": composite,
            "heart_rate": round(float(hr), 1) if hr is not None else None,
            "glucose": round(float(gluc), 1) if gluc is not None else None,
        })

    return {
        "user_id": user_id,
        "timespan": timespan,
        "data": progress
    }


# ---------------------------------------------------------------------------
# 5. DATA EXPORT  (zip of all CSVs + metadata JSON)
# ---------------------------------------------------------------------------
def build_export_zip(user_id: str, history_dir: Path, metadata: Dict[str, Any]) -> bytes:
    """
    Packages all historical CSVs and the profile metadata into an in-memory zip.
    Returns raw bytes suitable for a download response.
    """
    buf = io.BytesIO()
    user_path = history_dir / user_id

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Write metadata
        meta_json = json.dumps(metadata, indent=2)
        zf.writestr(f"{user_id}/profile_metadata.json", meta_json)

        # Write all vitals CSVs
        if user_path.exists():
            for csv_file in sorted(user_path.glob("vitals_*.csv")):
                zf.write(str(csv_file), arcname=f"{user_id}/{csv_file.name}")

    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 6. TIME-IN-RANGE  (TIR) — glucose quality metric
# ---------------------------------------------------------------------------
def compute_time_in_range(csv_path: Path, has_diabetes: bool = False) -> Dict[str, Any]:
    """
    Computes Time-in-Range metrics for blood glucose from a session CSV.
    TIR thresholds:
      Non-diabetic: 70–140 mg/dL
      Diabetic:     70–180 mg/dL  (ADA 2023 standard)
    Returns: tir_pct, tar_pct (time-above), tbr_pct (time-below), urgency_low_pct (<54)
    """
    df = _clean_df(csv_path)
    if df is None:
        return {"error": "Session not found"}

    col = next((c for c in df.columns if "Glucose" in c), None)
    if col is None:
        return {"error": "No glucose data in session"}

    series = df[col].dropna()
    if len(series) == 0:
        return {"error": "Empty glucose series"}

    hi = 180 if has_diabetes else 140
    lo = 70
    urgency_lo = 54

    n = len(series)
    tir   = int((series.between(lo, hi)).sum()) / n * 100
    tar   = int((series > hi).sum()) / n * 100
    tbr   = int((series < lo).sum()) / n * 100
    urg   = int((series < urgency_lo).sum()) / n * 100
    mean_g = round(float(series.mean()), 1)
    cv_pct = round(float(series.std() / series.mean() * 100) if series.mean() > 0 else 0, 1)

    return {
        "time_in_range_pct":    round(tir, 1),
        "time_above_range_pct": round(tar, 1),
        "time_below_range_pct": round(tbr, 1),
        "urgency_low_pct":      round(urg, 1),
        "mean_glucose":         mean_g,
        "glucose_cv_pct":       cv_pct,
        "cv_status":            "Stable" if cv_pct < 36 else "Variable",
        "target_range":         f"{lo}–{hi} mg/dL",
        "tir_grade":            (
            "Excellent" if tir >= 70 else
            "Good"      if tir >= 50 else
            "Fair"      if tir >= 30 else
            "Poor"
        ),
    }


# ---------------------------------------------------------------------------
# 7. PREDICTED HbA1c  (from simulated glucose averages)
# ---------------------------------------------------------------------------
def predict_hba1c(user_id: str, history_dir: Path) -> Dict[str, Any]:
    """
    Estimates HbA1c from the mean simulated blood glucose across all sessions.
    Formula: HbA1c (%) = (mean_glucose_mg_dL + 46.7) / 28.7
    Source: Nathan et al., eAG/HbA1c conversion, ADAG Study (2008)
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"error": "No history found"}

    all_glucose = []
    for f in sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime)[-10:]:
        df = _clean_df(f)
        if df is None:
            continue
        col = next((c for c in df.columns if "Glucose" in c), None)
        if col:
            all_glucose.extend(df[col].dropna().tolist())

    if len(all_glucose) < 5:
        return {"error": "Not enough glucose data across sessions (need ≥ 1 session)"}

    mean_g = float(np.mean(all_glucose))
    hba1c  = round((mean_g + 46.7) / 28.7, 1)

    if hba1c < 5.7:
        classification, advice = "Normal",      "Maintain your current lifestyle."
    elif hba1c < 6.5:
        classification, advice = "Prediabetes", "Consider lifestyle changes. Consult a doctor."
    elif hba1c < 8.0:
        classification, advice = "Diabetes (Controlled)", "Continue monitoring. Stay on your medication plan."
    else:
        classification, advice = "Diabetes (Poorly Controlled)", "Please consult your doctor urgently."

    return {
        "predicted_hba1c_pct": hba1c,
        "classification": classification,
        "advice": advice,
        "based_on_n_points": len(all_glucose),
        "mean_glucose_mgdl": round(mean_g, 1),
        "note": "Predicted from simulation averages using ADAG formula. Not a lab result.",
    }


# ---------------------------------------------------------------------------
# 8. 10-YEAR CVD RISK SCORE  (simplified Framingham + INTERHEART)
# ---------------------------------------------------------------------------
def compute_cvd_risk(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes a simplified 10-year cardiovascular disease (CVD) risk score.
    Uses Framingham-derived point scores adapted for South Asian populations.

    Inputs from metadata: age, sex, systolic_bp, is_smoker, has_type1_diabetes,
    has_type2_diabetes, hba1c, ethnicity, bmi (computed from weight/height).

    Returns a risk percentage, category, and actionable factors.
    """
    age     = int(metadata.get("age", 40))
    sex     = str(metadata.get("sex", "Male")).lower()
    sys_bp  = float(metadata.get("systolic_bp", 120))
    smoker  = bool(metadata.get("is_smoker", False))
    t1d     = bool(metadata.get("has_type1_diabetes", False))
    t2d     = bool(metadata.get("has_type2_diabetes", False))
    hba1c   = metadata.get("hba1c")
    ethnicity = str(metadata.get("ethnicity", "Other")).lower()
    weight  = float(metadata.get("weight", 70))
    height  = float(metadata.get("height", 170))
    bmi     = weight / ((height / 100) ** 2)

    # ── Framingham point totals ──────────────────────────────────────────────
    points = 0

    # Age scoring (male)
    if sex == "male":
        age_map = [(34,0),(39,2),(44,5),(49,6),(54,8),(59,10),(64,11),(69,12),(100,14)]
    else:
        age_map = [(34,0),(39,2),(44,4),(49,5),(54,7),(59,8),(64,9),(69,10),(100,11)]
    for threshold, pts in age_map:
        if age <= threshold:
            points += pts; break

    # Systolic BP
    if sys_bp < 120:    points += 0
    elif sys_bp < 130:  points += 1
    elif sys_bp < 140:  points += 2
    elif sys_bp < 160:  points += 3
    else:               points += 4

    # Smoking
    if smoker: points += 4 if sex == "male" else 3

    # Diabetes
    if t1d or t2d:
        points += 3
        if hba1c and hba1c >= 9.0:
            points += 2  # Poorly controlled → extra risk

    # BMI (overweight adds risk, especially South Asian)
    overweight_threshold = 23.0 if "south" in ethnicity else 25.0
    if bmi >= 30:     points += 3
    elif bmi >= overweight_threshold: points += 1

    # South Asian multiplier (1.5× baseline risk vs European populations)
    south_asian_mult = 1.5 if "south" in ethnicity else 1.0

    # ── Convert points to rough % risk ──────────────────────────────────────
    # Simplified 10-year risk curve (male/female combined, adjusted)
    risk_table = [
        (5, 1), (7, 2), (9, 3), (11, 5), (13, 8), (15, 12), (17, 18), (100, 25)
    ]
    base_risk = 1
    for threshold, risk in risk_table:
        if points <= threshold:
            base_risk = risk; break

    final_risk = min(round(base_risk * south_asian_mult, 1), 40)

    if final_risk < 7.5:
        category, color = "Low", "#10b981"
        action = "Maintain a healthy lifestyle. Annual check-up recommended."
    elif final_risk < 20:
        category, color = "Moderate", "#f59e0b"
        action = "Consult a doctor about lifestyle changes. Consider BP/lipid check."
    else:
        category, color = "High", "#ef4444"
        action = "Seek medical evaluation urgently. CVD risk is significantly elevated."

    modifiable = []
    if smoker:       modifiable.append("Quit smoking (reduces risk ~25%)")
    if sys_bp > 130: modifiable.append("Control blood pressure (target < 130 mmHg)")
    if t1d or t2d:   modifiable.append("Achieve tight glycemic control (target HbA1c < 7%)")
    if bmi >= overweight_threshold: modifiable.append("Reduce BMI to healthy range")

    return {
        "ten_year_risk_pct": final_risk,
        "category": category,
        "color": color,
        "action": action,
        "framingham_points": points,
        "south_asian_multiplier_applied": "south" in ethnicity,
        "modifiable_risk_factors": modifiable,
        "disclaimer": "Estimated risk only. Not a clinical diagnosis. Consult a cardiologist.",
    }


# ---------------------------------------------------------------------------
# 9. BMR + CALORIC BALANCE  (energy balance tracker)
# ---------------------------------------------------------------------------
def compute_bmr_and_balance(metadata: Dict[str, Any], events: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Computes Basal Metabolic Rate (Mifflin-St Jeor equation) and estimates
    caloric balance from logged events.
    """
    weight = float(metadata.get("weight", 70))   # kg
    height = float(metadata.get("height", 170))  # cm
    age    = int(metadata.get("age", 30))
    sex    = str(metadata.get("sex", "Male")).lower()

    # Mifflin-St Jeor BMR (kcal/day)
    if sex == "male":
        bmr = 10 * weight + 6.25 * height - 5 * age + 5
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age - 161

    bmr = round(bmr, 0)

    # Estimate calories burned from events (activity factor)
    exercise_kcal = 0
    meal_kcal = 0
    if events:
        for ev in events:
            if ev.get("event_type") == "exercise":
                # METs approximation: intensity 0-1 → 3-12 METs
                mets = 3 + float(ev.get("value", 0.5)) * 9
                dur_hrs = int(ev.get("duration_seconds", 1800)) / 3600
                exercise_kcal += mets * weight * dur_hrs
            elif ev.get("event_type") == "meal":
                meal_kcal += float(ev.get("value", 0))

    total_burn = round(bmr + exercise_kcal, 0)
    balance    = round(meal_kcal - total_burn, 0)

    return {
        "bmr_kcal_day":       int(bmr),
        "estimated_burn_kcal": int(total_burn),
        "meal_intake_kcal":   int(meal_kcal),
        "caloric_balance":    int(balance),
        "balance_status":     "Surplus" if balance > 100 else ("Deficit" if balance < -100 else "Balanced"),
        "note":               "Estimates only. Actual metabolism varies by individual.",
    }


# ---------------------------------------------------------------------------
# 10. SLEEP DEBT ACCUMULATION
# ---------------------------------------------------------------------------
def compute_sleep_debt(user_id: str, history_dir: Path,
                       sessions_data: List[Dict] = None) -> Dict[str, Any]:
    """
    Computes running sleep debt from logged sleep events across sessions.
    Target: 8 hours/day. Debt caps at 16 hours (2 days).
    """
    if sessions_data is None:
        return {"sleep_debt_hours": None, "status": "No session data provided"}

    target_per_session = 8.0
    total_sleep = 0.0
    sessions_with_sleep = 0

    for sess in sessions_data[-14:]:  # last 14 sessions
        sleep_h = sess.get("sleep_hours", 0)
        if sleep_h > 0:
            total_sleep += sleep_h
            sessions_with_sleep += 1

    if sessions_with_sleep == 0:
        return {"sleep_debt_hours": None, "status": "No sleep events logged"}

    expected = sessions_with_sleep * target_per_session
    debt = round(max(0, expected - total_sleep), 1)

    return {
        "sleep_debt_hours": debt,
        "avg_sleep_logged": round(total_sleep / sessions_with_sleep, 1),
        "sessions_counted": sessions_with_sleep,
        "status": (
            "Optimal"  if debt == 0   else
            "Mild"     if debt <= 4   else
            "Moderate" if debt <= 8   else
            "Severe"
        ),
        "recommendation": (
            "Sleep debt is accumulating. Prioritize 8 hours of sleep."
            if debt > 4 else "Sleep is well balanced."
        ),
    }


# ---------------------------------------------------------------------------
# 11. PERSONAL NORMAL RANGES  (learned from user's own history)
# ---------------------------------------------------------------------------
def compute_personal_norms(user_id: str, history_dir: Path,
                           min_sessions: int = 5) -> Dict[str, Any]:
    """
    After min_sessions, computes personal mean ± 1SD for each vital.
    These can replace population norms in the health score for experienced users.
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"status": "insufficient_data", "sessions_needed": min_sessions}

    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime)
    if len(csv_files) < min_sessions:
        return {
            "status": "insufficient_data",
            "sessions_available": len(csv_files),
            "sessions_needed": min_sessions,
        }

    tracked = {
        "HeartRate":                 {"label": "Heart Rate",   "unit": "bpm"},
        "SystolicArterialPressure":  {"label": "Systolic BP",  "unit": "mmHg"},
        "DiastolicArterialPressure": {"label": "Diastolic BP", "unit": "mmHg"},
        "RespirationRate":           {"label": "Respiration",  "unit": "br/min"},
        "Glucose-BloodConcentration":{"label": "Glucose",      "unit": "mg/dL"},
        "OxygenSaturation":          {"label": "SpO₂",         "unit": "fraction"},
        "CoreTemperature":           {"label": "Core Temp",    "unit": "°C"},
    }

    all_means: Dict[str, list] = {col: [] for col in tracked}

    for f in csv_files:
        df = _clean_df(f)
        if df is None:
            continue
        for col in tracked:
            if col in df.columns:
                all_means[col].append(float(df[col].mean()))

    personal_norms = {}
    for col, vals in all_means.items():
        if len(vals) >= min_sessions:
            mean = round(float(np.mean(vals)), 2)
            sd   = round(float(np.std(vals)),  2)
            personal_norms[col] = {
                "label":          tracked[col]["label"],
                "unit":           tracked[col]["unit"],
                "personal_mean":  mean,
                "personal_sd":    sd,
                "personal_lo":    round(mean - sd, 2),
                "personal_hi":    round(mean + sd, 2),
            }

    return {
        "status": "ready",
        "sessions_used": len(csv_files),
        "personal_norms": personal_norms,
        "note": "Based on your own simulation history. More accurate than population averages.",
    }


# ---------------------------------------------------------------------------
# 12. WEEKLY INSIGHT SUMMARY
# ---------------------------------------------------------------------------
def generate_weekly_summary(user_id: str, history_dir: Path) -> Dict[str, Any]:
    """
    Reads the last 7 session files and produces a plain-text insight summary
    with best/worst day, trend arrows, and personalized recommendations.
    """
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"error": "No history"}

    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime)[-7:]
    if not csv_files:
        return {"error": "No sessions this week"}

    # Gather averages per session
    session_stats = []
    for f in csv_files:
        df = _clean_df(f)
        if df is None: continue
        s = {}
        for col, alias in [
            ("HeartRate", "hr"), ("Glucose-BloodConcentration", "glucose"),
            ("SystolicArterialPressure", "sys"), ("RespirationRate", "rr")
        ]:
            if col in df.columns:
                s[alias] = round(float(df[col].mean()), 1)
        s["session"] = f.name
        s["date"]    = datetime.datetime.fromtimestamp(f.stat().st_mtime).strftime("%A %d %b")
        session_stats.append(s)

    if not session_stats:
        return {"error": "Could not parse sessions"}

    # Best HR (closest to 72)
    hr_vals = [(s["date"], abs(s.get("hr", 999) - 72)) for s in session_stats if "hr" in s]
    best_hr_day  = min(hr_vals, key=lambda x: x[1])[0] if hr_vals else "—"

    # Glucose average
    g_vals = [s["glucose"] for s in session_stats if "glucose" in s]
    avg_g  = round(float(np.mean(g_vals)), 1) if g_vals else None

    # HR trend
    hr_series = [s["hr"] for s in session_stats if "hr" in s]
    hr_trend  = "↑ Rising" if len(hr_series) > 2 and hr_series[-1] > hr_series[0] + 3 else (
                "↓ Falling" if len(hr_series) > 2 and hr_series[-1] < hr_series[0] - 3 else "→ Stable")

    insights = []
    if avg_g and avg_g > 180:
        insights.append(f"🔴 High average glucose this week ({avg_g} mg/dL). Review your diet and medication.")
    elif avg_g and avg_g > 140:
        insights.append(f"🟡 Elevated average glucose ({avg_g} mg/dL). Monitor your carbohydrate intake.")
    elif avg_g:
        insights.append(f"🟢 Good glucose control this week (avg {avg_g} mg/dL).")

    if hr_trend.startswith("↑"):
        insights.append("🟡 Heart rate has been rising this week. Consider stress levels and sleep quality.")
    elif hr_trend.startswith("↓"):
        insights.append("🟢 Heart rate trend is improving this week.")

    return {
        "week_sessions":  len(session_stats),
        "best_hr_day":    best_hr_day,
        "avg_glucose":    avg_g,
        "hr_trend":       hr_trend,
        "insights":       insights,
        "session_summary": session_stats,
        "generated_at":   datetime.datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# 13. RECOVERY READINESS SCORE
# ---------------------------------------------------------------------------
def compute_recovery_readiness(user_id: str, history_dir: Path,
                                metadata: dict = None) -> dict:
    """
    Computes a 0–100 Recovery Readiness Score from recent simulation data.
    Factors:
      1. Resting HR deviation from personal baseline (lower = better recovery)
      2. Sleep from most recent session (>=7h = well-recovered)
      3. Time since last intense exercise (>24h = recovered)
      4. VO2max (from profile) — higher VO2max = recovers faster

    Interpretation:
      80–100 → Ready (Green) — safe to train at full intensity
      50–79  → Caution (Yellow) — moderate activity only
      0–49   → Rest (Red) — recovery needed
    """
    metadata = metadata or {}
    user_path = history_dir / user_id
    if not user_path.exists():
        return {"error": "No simulation history found for this user."}

    csv_files = sorted(user_path.glob("vitals_*.csv"), key=os.path.getmtime, reverse=True)
    if not csv_files:
        return {"error": "No session data to compute recovery readiness."}

    score = 100
    factors = []

    # ── Factor 1: Resting HR vs personal norm ───────────────────────────────
    latest_df = _clean_df(csv_files[0])
    resting_hr = None
    personal_hr_mean = None

    if latest_df is not None and "HeartRate" in latest_df.columns:
        resting_hr = round(float(latest_df["HeartRate"].mean()), 1)

        # Compute personal HR mean from last 5 sessions
        hr_means = []
        for f in csv_files[1:6]:
            df = _clean_df(f)
            if df is not None and "HeartRate" in df.columns:
                hr_means.append(float(df["HeartRate"].mean()))

        if hr_means:
            personal_hr_mean = round(float(np.mean(hr_means)), 1)
            hr_elevation = resting_hr - personal_hr_mean
            if hr_elevation > 10:
                penalty = min(30, int(hr_elevation * 2))
                score -= penalty
                factors.append(f"⚠️ Resting HR elevated by {round(hr_elevation, 1)} bpm above your baseline — suggests incomplete recovery.")
            elif hr_elevation > 5:
                score -= 10
                factors.append(f"🟡 Resting HR slightly elevated (+{round(hr_elevation, 1)} bpm). Light activity recommended.")
            else:
                factors.append(f"✅ Resting HR ({resting_hr} bpm) is within your normal range.")
        else:
            if resting_hr and resting_hr > 85:
                score -= 15
                factors.append(f"🟡 Elevated resting HR ({resting_hr} bpm). Consider rest.")
            elif resting_hr:
                factors.append(f"✅ Resting HR is {resting_hr} bpm.")

    # ── Factor 2: Recent sleep ───────────────────────────────────────────────
    # We don't track sleep events in CSVs, so use metadata hint
    last_sleep_h = metadata.get("last_sleep_hours")
    if last_sleep_h is not None:
        if last_sleep_h < 5:
            score -= 25
            factors.append(f"🔴 Only {last_sleep_h}h sleep logged — significant recovery deficit.")
        elif last_sleep_h < 7:
            score -= 12
            factors.append(f"🟡 {last_sleep_h}h sleep. Aim for 7–9h for full recovery.")
        else:
            factors.append(f"✅ Good sleep ({last_sleep_h}h).")
    else:
        factors.append("ℹ️ No sleep data available. Log sleep events for a more accurate score.")

    # ── Factor 3: VO2max boost (higher aerobic capacity = faster recovery) ──
    vo2max = metadata.get("vo2max")
    if vo2max:
        if vo2max >= 50:
            score = min(100, score + 5)
            factors.append(f"✅ High VO2max ({vo2max} mL/kg/min) — superior recovery capacity.")
        elif vo2max >= 35:
            factors.append(f"ℹ️ Average VO2max ({vo2max} mL/kg/min).")
        else:
            score -= 5
            factors.append(f"🟡 Low VO2max ({vo2max} mL/kg/min) — prioritise aerobic base training.")

    score = max(0, min(100, score))

    if score >= 80:
        status, color, recommendation = "Ready", "#10b981", "Your body is recovered. Safe to train at full or high intensity today."
    elif score >= 50:
        status, color, recommendation = "Caution", "#f59e0b", "Moderate activity is fine. Avoid maximum-intensity training today."
    else:
        status, color, recommendation = "Rest", "#ef4444", "Recovery is incomplete. Prioritise sleep, hydration, and low-intensity activity."

    return {
        "readiness_score": score,
        "status": status,
        "color": color,
        "recommendation": recommendation,
        "resting_hr": resting_hr,
        "personal_hr_baseline": personal_hr_mean,
        "factors": factors,
        "note": "Readiness is estimated from simulated physiological data, not a clinical assessment.",
    }
