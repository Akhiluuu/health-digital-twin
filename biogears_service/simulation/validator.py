"""
validator.py — Input validation before any BioGears scenario is built.

All functions return a list of human-readable error strings.
An empty list means the input is valid.
Safe values are clamped (with a warning) rather than rejected.
"""

import logging
from typing import List, Dict, Any, Optional

from biogears_service.simulation.substance_registry import SUBSTANCE_REGISTRY

logger = logging.getLogger("DigitalTwin.Validator")

# ── Constants ──────────────────────────────────────────────────────────────

VALID_EVENT_TYPES = {
    "exercise", "sleep", "meal", "substance", "water",
    "environment", "stress", "alcohol", "fast",           # ← NEW
}

VALID_MEAL_TYPES = {
    "balanced",     # 40% carb / 30% fat / 30% protein
    "high_carb",    # 60% carb / 20% fat / 20% protein
    "high_protein", # 30% carb / 20% fat / 50% protein
    "fast_food",    # 45% carb / 40% fat / 15% protein
    "ketogenic",    # 5%  carb / 75% fat / 20% protein
    "custom",       # user supplies carb_g, fat_g, protein_g fields
}

VALID_ENVIRONMENTS = {
    "Standard",
    "ExerciseEnvironment",
    "AnchorageDecember",
    "AnchorageInside",
    "CarbonMonoxideAtmospheric",
    "CheyenneMountainAmbulance",
    "CheyenneMountainAprilCool",
    "CheyenneMountainAprilWarm",
    "CheyenneMountainFireFighter",
    "Hypobaric3000m",
    "Hypobaric4000m",
    "Submerged",
    "SubmergedFreezing",
}

# ── Medication interaction pairs (substance_name_A → set of dangerous combos) ─
# Based on clinical pharmacology interaction databases.
INTERACTION_MAP = {
    frozenset({"Morphine", "Midazolam"}):           "Respiratory depression (CNS + opioid synergy)",
    frozenset({"Morphine", "Fentanyl"}):            "Additive opioid toxicity",
    frozenset({"Ketamine", "Midazolam"}):           "Profound CNS depression",
    frozenset({"Epinephrine", "Vasopressin"}):      "Severe hypertension risk",
    frozenset({"Naloxone", "Morphine"}):            "Withdrawal precipitation (informational)",
    frozenset({"Naloxone", "Fentanyl"}):            "Withdrawal precipitation (informational)",
    frozenset({"Rocuronium", "Succinylcholine"}):   "Competing neuromuscular blockade",
    frozenset({"Atropine", "Epinephrine"}):         "Compounding tachycardia risk",
}


# ── Registration Validation ────────────────────────────────────────────────

def validate_registration(data: Dict[str, Any]) -> List[str]:
    """Validates patient registration fields. Returns list of errors."""
    errors: List[str] = []

    sex = data.get("sex", "")
    if sex not in ("Male", "Female"):
        errors.append(f"'sex' must be 'Male' or 'Female', got '{sex}'.")

    try:
        age = int(data.get("age", 0))
        if not (1 <= age <= 120):
            errors.append(f"'age' must be 1–120, got {age}.")
    except (ValueError, TypeError):
        errors.append(f"'age' must be a valid integer, got '{data.get('age')}'.")

    try:
        weight = float(data.get("weight", 0))
        if not (1.0 <= weight <= 500.0):
            errors.append(f"'weight' must be 1–500 kg, got {weight}.")
    except (ValueError, TypeError):
        errors.append(f"'weight' must be a valid number, got '{data.get('weight')}'.")

    try:
        height = float(data.get("height", 0))
        if not (50.0 <= height <= 250.0):
            errors.append(f"'height' must be 50–250 cm, got {height}.")
    except (ValueError, TypeError):
        errors.append(f"'height' must be a valid number, got '{data.get('height')}'.")

    try:
        body_fat = float(data.get("body_fat", 0.2))
        if not (0.03 <= body_fat <= 0.70):
            errors.append(f"'body_fat' must be a fraction 0.03–0.70, got {body_fat}.")
    except (ValueError, TypeError):
        errors.append(f"'body_fat' must be a decimal fraction (e.g. 0.20), got '{data.get('body_fat')}'.")

    try:
        rhr = float(data.get("resting_hr", 72))
        if not (30 <= rhr <= 200):
            errors.append(f"'resting_hr' must be 30–200 bpm, got {rhr}.")
    except (ValueError, TypeError):
        errors.append(f"'resting_hr' must be a valid number, got '{data.get('resting_hr')}'.")

    try:
        systolic = float(data.get("systolic_bp", 114))
        if not (70 <= systolic <= 220):
            errors.append(f"'systolic_bp' must be 70–220 mmHg, got {systolic}.")
    except (ValueError, TypeError):
        errors.append(f"'systolic_bp' must be a valid number, got '{data.get('systolic_bp')}'.")

    try:
        diastolic = float(data.get("diastolic_bp", 73.5))
        if not (40 <= diastolic <= 140):
            errors.append(f"'diastolic_bp' must be 40–140 mmHg, got {diastolic}.")
    except (ValueError, TypeError):
        errors.append(f"'diastolic_bp' must be a valid number, got '{data.get('diastolic_bp')}'.")

    if data.get("has_type1_diabetes") and data.get("has_type2_diabetes"):
        errors.append("Cannot have both Type 1 and Type 2 diabetes simultaneously.")

    return errors


# ── Event Validation ───────────────────────────────────────────────────────

def validate_events(events: List[Dict[str, Any]]) -> List[str]:
    """
    Validates a list of health events.
    Returns ALL errors at once (not first-error-only).
    Also logs warnings for clamped values.
    """
    errors: List[str] = []

    for i, e in enumerate(events):
        etype  = e.get("event_type", "")
        val    = e.get("value")
        offset = e.get("time_offset", 0)
        label  = f"Event[{i}] ({etype or '?'})"

        # ── Common checks ──────────────────────────────────────────────────
        if etype not in VALID_EVENT_TYPES:
            known = ", ".join(sorted(VALID_EVENT_TYPES))
            errors.append(f"{label}: Unknown event_type '{etype}'. Valid types: {known}.")
            continue   # Skip per-type checks for unknown types

        if offset is not None:
            try:
                if int(offset) < 0:
                    errors.append(f"{label}: time_offset cannot be negative (got {offset}).")
            except (ValueError, TypeError):
                errors.append(f"{label}: time_offset must be an integer, got '{offset}'.")

        # ── Per-type checks ────────────────────────────────────────────────
        if etype == "exercise":
            if val is None:
                errors.append(f"{label}: 'value' (intensity 0.0\u20131.0) is required.")
            else:
                fval = float(val)
                if fval > 100:
                    # Clearly wrong unit (e.g. raw MET value > 14 that slipped through)
                    errors.append(
                        f"{label}: intensity value must be 0.0\u20131.0 (or at most ~14 if using MET "
                        f"scale, which must be normalised before submission). Got {val}."
                    )
                elif fval > 1.0:
                    # Likely an un-normalised MET value (e.g. 3.5 from the Activity Lab).
                    # Clamp to [0.0, 1.0] and warn — do NOT block the simulation.
                    clamped = round(min(fval / 13.0, 1.0), 2)  # MET scale: (MET-1)/13 ≈ 0–1
                    logger.warning(
                        f"{label}: intensity {val} is outside 0.0–1.0 — "
                        f"will be clamped to {clamped:.2f}. "
                        f"Please normalise before sending: intensity = (MET - 1) / 13."
                    )
                elif fval < 0.0:
                    errors.append(f"{label}: intensity cannot be negative. Got {val}.")

            dur = e.get("duration_seconds")
            if dur is not None:
                try:
                    dur_int = int(float(dur))  # accept floats like 1800.0 from the frontend
                    if not (60 <= dur_int <= 14400):
                        errors.append(
                            f"{label}: duration_seconds must be 60–14400 s (1 min–4 hrs), got {dur}."
                        )
                except (ValueError, TypeError):
                    errors.append(f"{label}: duration_seconds must be a number, got '{dur}'.")

        elif etype == "sleep":
            if val is None or float(val) <= 0:
                errors.append(f"{label}: 'value' (hours of sleep, > 0) is required.")
            elif not (0.25 <= float(val) <= 14.0):
                logger.warning(
                    f"{label}: sleep hours {val} outside 0.25–14 range — will be clamped."
                )

        elif etype == "meal":
            if val is None or not (5 <= float(val) <= 10000):
                errors.append(
                    f"{label}: 'value' (calories) must be 5–10000, got {val}."
                )
            mt = e.get("meal_type")
            if mt and mt not in VALID_MEAL_TYPES:
                errors.append(
                    f"{label}: meal_type '{mt}' unknown. Valid: {', '.join(sorted(VALID_MEAL_TYPES))}."
                )
            # For custom meals, warn if macros are missing but allow the simulation
            # to proceed — the scenario_builder will fall back to balanced preset.
            if mt == "custom":
                missing = [m for m in ("carb_g", "fat_g", "protein_g") if e.get(m) is None]
                if missing:
                    logger.warning(
                        f"{label}: meal_type 'custom' is missing macro fields: "
                        f"{missing}. Scenario builder will estimate from balanced preset."
                    )

        elif etype == "water":
            if val is None or not (5 <= float(val) <= 10000):
                errors.append(
                    f"{label}: 'value' (water in mL) must be 5–10000, got {val}."
                )

        elif etype == "substance":
            if val is None or float(val) <= 0:
                errors.append(f"{label}: 'value' (dose amount, > 0) is required.")

            sub = e.get("substance_name")
            if not sub:
                errors.append(f"{label}: 'substance_name' is required for substance events.")
            elif sub not in SUBSTANCE_REGISTRY:
                suggestions = [k for k in SUBSTANCE_REGISTRY if sub.lower() in k.lower()][:3]
                hint = f" Did you mean: {suggestions}?" if suggestions else ""
                errors.append(
                    f"{label}: Substance '{sub}' not found in registry.{hint}"
                )
            else:
                info = SUBSTANCE_REGISTRY[sub]
                unit = info.get("unit", "units")
                safe_max = info.get("safe_max", None)
                safety_level = info.get("safety_level", "safe")
                warning_text = info.get("warning")

                # Hard block on truly dangerous substances above safe_max
                if safe_max is not None and safe_max > 0 and val is not None and float(val) > safe_max:
                    errors.append(
                        f"{label}: Dose {val} {unit} exceeds safety maximum for '{sub}' "
                        f"(max: {safe_max} {unit}). "
                        f"{info.get('note', 'Reduce the dose to proceed.')}"
                    )

                # Log safety level warnings (non-blocking — returned separately)
                if safety_level in ("danger", "clinical_only") and warning_text:
                    logger.warning(
                        f"{label}: '{sub}' is safety_level='{safety_level}': {warning_text}"
                    )


        elif etype == "stress":                                     # ── NEW
            if val is None:
                errors.append(f"{label}: 'value' (stress intensity 0.0–1.0) is required.")
            elif not (0.0 <= float(val) <= 1.0):
                errors.append(f"{label}: Stress intensity must be 0.0–1.0. Got {val}.")

        elif etype == "alcohol":                                    # ── NEW
            if val is None or float(val) <= 0:
                errors.append(f"{label}: 'value' (standard drinks, > 0) is required.")
            elif float(val) > 10:
                errors.append(f"{label}: Max 10 standard drinks per event (safety cap). Got {val}.")

        elif etype == "fast":                                       # ── NEW
            if val is None or float(val) < 1:
                errors.append(f"{label}: 'value' (fasting hours, ≥ 1) is required.")
            elif float(val) > 48:
                errors.append(f"{label}: Maximum fast duration is 48 hours. Got {val}.")

    return errors


# ── Interaction Checker ────────────────────────────────────────────────────

def validate_interactions(events: List[Dict[str, Any]]) -> List[str]:
    """
    Checks for dangerous drug combinations in a batch.
    Returns a list of warning strings (non-blocking — shown to user as caution).
    """
    warnings_list = []
    substances_in_batch = {
        e.get("substance_name")
        for e in events
        if e.get("event_type") == "substance" and e.get("substance_name")
    }

    for pair, risk_description in INTERACTION_MAP.items():
        if pair.issubset(substances_in_batch):
            names = " + ".join(sorted(pair))
            warnings_list.append(
                f"⚠️ Drug interaction detected: {names} → {risk_description}. "
                f"Review this combination carefully."
            )

    return warnings_list
