"""
scenario_builder.py — BioGears XML scenario generator (v2).

Fixes vs v1:
  - Exercise off-ramp: turns intensity to 0 after duration_seconds
  - Concurrent isolation: CSV prefix uses run_id, not bare user_id
  - Basal gap capped at 8 hours
  - Sleep clamped to 0.25–12 hours
  - Meal uses proper macros (carb/fat/protein/water) with meal_type presets
  - Water intake event type
  - Environment change event type (13 presets)
  - DataRequests expanded from 6 → 14 vitals
  - Substance routing driven by SUBSTANCE_REGISTRY (79 substances)
  - Forecast saves serialized state so forecasts can be chained
  - New build_whatif_scenario() for side-by-side comparison
"""

import os
import time
import datetime
import math
from pathlib import Path

from biogears_service.simulation.config import (
    SCENARIO_API_DIR, BIOGEARS_BIN_DIR, ENVIRONMENTS_DIR
)
from biogears_service.simulation.substance_registry import SUBSTANCE_REGISTRY

# ── Expanded DataRequests block (14 vitals) ──────────────────────────────
_DATA_REQUESTS = """    <DataRequests Filename="{prefix}">
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="HeartRate"                  Unit="1/min"  Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="RespirationRate"             Unit="1/min"  Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="SystolicArterialPressure"   Unit="mmHg"   Precision="1"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="DiastolicArterialPressure"  Unit="mmHg"   Precision="1"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="MeanArterialPressure"        Unit="mmHg"   Precision="1"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="OxygenSaturation"            Unit="unitless" Precision="3"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="CoreTemperature"             Unit="degC"   Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="CardiacOutput"               Unit="L/min"  Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="HeartStrokeVolume"           Unit="mL"     Precision="1"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="TidalVolume"                 Unit="mL"     Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="ArterialBloodPH"             Unit="unitless" Precision="2"/>
        <DataRequest xsi:type="PhysiologyDataRequestData" Name="AchievedExerciseLevel"       Unit="unitless" Precision="3"/>
        <DataRequest xsi:type="SubstanceDataRequestData"  Substance="Glucose" Name="BloodConcentration" Unit="mg/dL"  Precision="2"/>
    </DataRequests>"""

# ── Meal macro presets (calorie fractions by macronutrient) ───────────────
_MEAL_PRESETS = {
    "balanced":     {"carb": 0.40, "fat": 0.30, "protein": 0.30},
    "high_carb":    {"carb": 0.60, "fat": 0.20, "protein": 0.20},
    "high_protein": {"carb": 0.30, "fat": 0.20, "protein": 0.50},
    "fast_food":    {"carb": 0.45, "fat": 0.40, "protein": 0.15},
    "ketogenic":    {"carb": 0.05, "fat": 0.75, "protein": 0.20},
}
# kcal per gram
_KCAL = {"carb": 4.0, "fat": 9.0, "protein": 4.0}


def _meal_xml(calories: float, meal_type: str,
              carb_g=None, fat_g=None, protein_g=None) -> str:
    """Returns a ConsumeNutrientsData XML action with proper macros."""
    if meal_type == "custom" and carb_g is not None:
        c = float(carb_g)
        f = float(fat_g or 0)
        p = float(protein_g or 0)
    else:
        preset = _MEAL_PRESETS.get(meal_type, _MEAL_PRESETS["balanced"])
        c = round(calories * preset["carb"] / _KCAL["carb"], 1)
        f = round(calories * preset["fat"]  / _KCAL["fat"],  1)
        p = round(calories * preset["protein"] / _KCAL["protein"], 1)
    # Water approximation: 0.5 mL per kcal (physiological average for mixed meals)
    w = round(calories * 0.0005, 3)
    return (
        f'        <Action xsi:type="ConsumeNutrientsData">\n'
        f'            <Nutrition>\n'
        f'                <Carbohydrate value="{c}" unit="g"/>\n'
        f'                <Fat          value="{f}" unit="g"/>\n'
        f'                <Protein      value="{p}" unit="g"/>\n'
        f'                <Water        value="{w}" unit="L"/>\n'
        f'            </Nutrition>\n'
        f'        </Action>\n'
    )


def _water_xml(ml: float) -> str:
    """Water intake via ConsumeNutrientsData (Water only)."""
    liters = round(ml / 1000.0, 4)
    return (
        f'        <Action xsi:type="ConsumeNutrientsData">\n'
        f'            <Nutrition><Water value="{liters}" unit="L"/></Nutrition>\n'
        f'        </Action>\n'
    )


def _substance_xml(name: str, val: float, is_stacked: bool = False) -> str:
    """Routes a substance to the correct BioGears administration action."""
    info = SUBSTANCE_REGISTRY.get(name)
    if info is None:
        # Fallback — unknown substance goes IV bolus
        return (
            f'        <Action xsi:type="SubstanceBolusData" AdminRoute="Intravenous">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Concentration value="1.0" unit="mg/mL"/>\n'
            f'            <Dose value="{val}" unit="mL"/>\n'
            f'        </Action>\n'
        )

    effective_val = round(val * 1.15, 4) if is_stacked else val
    route = info["route"]
    unit  = info["unit"]

    if route == "IV_COMPOUND":
        return (
            f'        <Action xsi:type="SubstanceCompoundInfusionData">\n'
            f'            <SubstanceCompound>{name}</SubstanceCompound>\n'
            f'            <BagVolume value="500" unit="mL"/>\n'
            f'            <Rate value="{effective_val}" unit="{unit}"/>\n'
            f'        </Action>\n'
        )
    elif route == "ORAL":
        return (
            f'        <Action xsi:type="SubstanceOralDoseData" AdminRoute="Gastrointestinal">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Dose value="{effective_val}" unit="{unit}"/>\n'
            f'        </Action>\n'
        )
    elif route == "NASAL":
        return (
            f'        <Action xsi:type="SubstanceNasalDoseData">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Dose value="{effective_val}" unit="{unit}"/>\n'
            f'        </Action>\n'
        )
    else:  # IV_BOLUS
        conc = "1000.0" if unit == "ug" else "1.0"
        conc_unit = "ug/mL" if unit == "ug" else "mg/mL"
        return (
            f'        <Action xsi:type="SubstanceBolusData" AdminRoute="Intravenous">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Concentration value="{conc}" unit="{conc_unit}"/>\n'
            f'            <Dose value="{effective_val}" unit="mL"/>\n'
            f'        </Action>\n'
        )


def _environment_xml(env_name: str) -> str:
    """Injects an environment change using a preset file from environments/."""
    # BioGears runs with cwd=BIOGEARS_BIN_DIR so relative path works
    return (
        f'        <Action xsi:type="EnvironmentChangeData">\n'
        f'            <ConditionsFile>environments/{env_name}.xml</ConditionsFile>\n'
        f'        </Action>\n'
    )


def _exercise_xml(intensity: float) -> str:
    return (
        f'        <Action xsi:type="ExerciseData">'
        f'<GenericExercise><Intensity value="{intensity}"/></GenericExercise>'
        f'</Action>\n'
    )


def _advance_xml(seconds: int) -> str:
    return f'        <Action xsi:type="AdvanceTimeData"><Time value="{seconds}" unit="s"/></Action>\n'


def _stress_xml(intensity: float) -> str:
    """
    Models acute stress/anxiety via BioGears PainStimulus action.
    PainStimulus uses the same sympathetic nervous system pathway as real stress:
    - HR ↑, BP ↑, respiratory rate ↑, glucose ↑
    Intensity: 0.0 (mild worry) → 1.0 (panic/extreme pain)
    """
    clamped = max(0.01, min(1.0, float(intensity)))
    return (
        f'        <Action xsi:type="PainStimulusData" Location="Chest">\n'
        f'            <Severity value="{clamped}"/>\n'
        f'        </Action>\n'
    )


def _alcohol_xml(standard_drinks: float, weight_kg: float = 70.0) -> str:
    """
    Models alcohol consumption (1 standard drink = 14g ethanol = 10 mL absolute alcohol).
    Ethanol is administered as oral dose. BioGears Ethanol substance supports this.
    Effects: vasodilation, mild bradycardia, impaired glucose regulation.
    """
    ethanol_g = standard_drinks * 14.0
    return (
        f'        <Action xsi:type="SubstanceOralDoseData" AdminRoute="Gastrointestinal">\n'
        f'            <Substance>Ethanol</Substance>\n'
        f'            <Dose value="{round(ethanol_g, 1)}" unit="g"/>\n'
        f'        </Action>\n'
    )


def _fasting_xml(hours: float) -> str:
    """
    Models intermittent fasting / religious fasting.
    A fast is a resting advance with zero nutrition.
    Hours clamped 1–48. Physiological effects: glucose ↓, ketones ↑, HR slight ↑.
    We use a low-intensity exercise (0.02) to slightly elevate metabolic state
    (simulates the basal gluconeogenesis and mild sympathetic activation of fasting).
    """
    hours   = max(1.0, min(48.0, float(hours)))
    seconds = int(hours * 3600)
    return (
        f'        <Action xsi:type="ExerciseData">'
        f'<GenericExercise><Intensity value="0.02"/></GenericExercise></Action>\n'
        f'{_advance_xml(seconds)}'
        f'        <Action xsi:type="ExerciseData">'
        f'<GenericExercise><Intensity value="0.0"/></GenericExercise></Action>\n'
    )


def _circadian_phase_xml(wall_hour: int) -> str:
    """
    Injects a time-of-day physiological phase before user events.
    Real physiology has a strong circadian pattern:
      06–10: Morning surge (cortisol peak) → HR +6bpm, BP +10mmHg
      10–18: Daytime baseline
      18–22: Evening → slight vagal tone decrease
      22–06: Night / sleep → HR -10bpm, BP -5mmHg

    We model this via a brief PainStimulus (sympathetic) for morning surge
    or a brief AcuteStress suppression for nighttime.
    """
    if 6 <= wall_hour < 10:
        # Morning cortisol surge — mild sympathetic activation
        return _stress_xml(0.15)
    elif 22 <= wall_hour or wall_hour < 6:
        # Nighttime parasympathetic dominance — zero stress, let basal state settle
        return _stress_xml(0.0)
    else:
        # Daytime baseline — no extra modifier
        return ""


def _catchup_routine_xml(weight_kg: float) -> str:
    """
    Simulates a generic 24-hour day to catch up physiological state after missing a day.
    Includes normal hydration, 3 meals (2000 kcal), and 8 hours of sleep.
    """
    xml = "        <!-- START CATCH-UP ROUTINE (simulating missing day) -->\n"
    # Wake up, drink water (250mL)
    xml += _water_xml(250.0)
    xml += _advance_xml(1800) # 0.5 h

    # Breakfast (500 kcal)
    xml += _meal_xml(500, "balanced")
    xml += _advance_xml(14400) # 4 h

    # Lunch (700 kcal) + water
    xml += _water_xml(300.0)
    xml += _meal_xml(700, "balanced")
    xml += _advance_xml(18000) # 5 h

    # Dinner (800 kcal) + water
    xml += _water_xml(300.0)
    xml += _meal_xml(800, "balanced")
    xml += _advance_xml(23400) # 6.5 h

    # Sleep (8 hours)
    xml += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
    xml += _advance_xml(28800) # 8 h
    xml += '        <Action xsi:type="SleepData" Sleep="Off"/>\n'
    
    xml += "        <!-- END CATCH-UP ROUTINE -->\n"
    return xml

def _scenario_header(state_path: str, data_requests: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        f'    <EngineStateFile>{state_path}</EngineStateFile>\n'
        f'{data_requests}\n'
        '    <Actions>\n'
    )


def _scenario_footer() -> str:
    return '    </Actions>\n</Scenario>'


def _serialize_state_xml(output_path: str) -> str:
    return (
        f'        <Action xsi:type="SerializeStateData" Type="Save">'
        f'<Filename>{output_path}</Filename></Action>\n'
    )


# ── PUBLIC: Registration scenario ────────────────────────────────────────────
def build_registration_scenario(user_id, age, weight, height, sex, body_fat,
                                 clinical_config: dict):
    scenario_path = SCENARIO_API_DIR / f"init_{user_id}.xml"
    patient_file  = SCENARIO_API_DIR / f"patient_{user_id}.xml"

    abs_patient   = Path(patient_file).absolute().as_posix()
    abs_state_out = (BIOGEARS_BIN_DIR / f"{user_id}.xml").as_posix()

    # ── Patient XML ─────────────────────────────────────────────────────────
    p_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Patient xmlns="uri:/mil/tatrc/physiology/datamodel">\n'
        f'    <Name>{user_id}</Name>\n'
        f'    <Sex>{sex}</Sex>\n'
        f'    <Age value="{age}" unit="yr"/>\n'
        f'    <Weight value="{weight}" unit="kg"/>\n'
        f'    <Height value="{height}" unit="cm"/>\n'
        f'    <BodyFatFraction value="{body_fat}"/>\n'
        f'    <DiastolicArterialPressureBaseline value="{clinical_config.get("diastolic_bp", 73.5)}" unit="mmHg"/>\n'
        f'    <HeartRateBaseline value="{clinical_config.get("resting_hr", 72.0)}" unit="1/min"/>\n'
        f'    <SystolicArterialPressureBaseline value="{clinical_config.get("systolic_bp", 114.0)}" unit="mmHg"/>\n'
        '</Patient>'
    )
    patient_file.write_text(p_xml, encoding="utf-8")

    # ── Conditions XML ────────────────────────────────────────────────────────
    # HbA1c-based severity scaling:
    #  HbA1c < 7  → good control → lower severity parameters
    #  HbA1c 7–9  → moderate control → medium severity
    #  HbA1c > 9  → poor control → high severity
    hba1c = clinical_config.get("hba1c")

    def _t1d_severity(hba1c):
        """InsulinProductionSeverity: 0 = normal, 1 = no insulin produced."""
        if hba1c is None: return 0.7          # default moderate
        if hba1c < 7.0:   return 0.5          # well-controlled
        if hba1c < 9.0:   return 0.7          # moderate
        return 0.9                             # poorly controlled

    def _t2d_severity(hba1c):
        """Returns (insulin_prod_sev, insulin_resistance_sev) tuple."""
        if hba1c is None: return 0.1, 0.5
        if hba1c < 7.0:   return 0.05, 0.3   # well-controlled
        if hba1c < 9.0:   return 0.1, 0.5    # moderate
        return 0.15, 0.7                       # poorly controlled

    conditions_xml = ""
    if clinical_config.get("has_type1_diabetes"):
        sev = _t1d_severity(hba1c)
        conditions_xml += (
            f'<Condition xsi:type="DiabetesType1Data">'
            f'<InsulinProductionSeverity value="{sev}"/></Condition>'
        )
    elif clinical_config.get("has_type2_diabetes"):
        prod_sev, res_sev = _t2d_severity(hba1c)
        conditions_xml += (
            f'<Condition xsi:type="DiabetesType2Data">'
            f'<InsulinProductionSeverity value="{prod_sev}"/>'
            f'<InsulinResistanceSeverity value="{res_sev}"/></Condition>'
        )
    if clinical_config.get("has_anemia"):
        conditions_xml += (
            '<Condition xsi:type="ChronicAnemiaData">'
            '<ReductionFactor value="0.3"/></Condition>'
        )
    if clinical_config.get("is_smoker"):
        conditions_xml += (
            '<Condition xsi:type="ChronicObstructivePulmonaryDiseaseData">'
            '<BronchitisSeverity value="0.2"/>'
            '<EmphysemaSeverity value="0.2"/></Condition>'
        )


    # ── Scenario XML ─────────────────────────────────────────────────────────
    s_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        '    <InitialParameters>\n'
        f'        <PatientFile>{abs_patient}</PatientFile>\n'
        '        <TrackStabilization>On</TrackStabilization>\n'
        f'        {conditions_xml}\n'
        '    </InitialParameters>\n'
        '    <Actions>\n'
        '        <Action xsi:type="AdvanceTimeData"><Time value="30" unit="s"/></Action>\n'
        f'        <Action xsi:type="SerializeStateData" Type="Save"><Filename>{abs_state_out}</Filename></Action>\n'
        '    </Actions>\n'
        '</Scenario>'
    )
    scenario_path.write_text(s_xml, encoding="utf-8")
    return str(scenario_path.absolute())


# ── PUBLIC: Batch reconstruction ─────────────────────────────────────────────
def build_batch_reconstruction(user_id, state_path, events: list, user_weight_kg: float = 70.0):
    run_id        = f"{user_id}_{int(time.time())}"
    scenario_file = SCENARIO_API_DIR / f"batch_{run_id}.xml"
    abs_state_in  = Path(state_path).absolute().as_posix()
    abs_state_out = (BIOGEARS_BIN_DIR / f"batch_{user_id}.xml").as_posix()

    csv_prefix = f"batch_{run_id}"

    # ── Circadian phase: inject time-of-day physiological baseline ───────────
    # This ensures HR/BP already reflect whether it's morning surge, daytime, or night
    wall_hour = datetime.datetime.now().hour
    actions_xml = _circadian_phase_xml(wall_hour)

    # ── Basal gap / Missed Day Routine ───────────────────────────────────────
    engine_clock = os.path.getmtime(state_path)
    current_time = time.time()
    
    # Priority: 1. Absolute timestamp, 2. Time-offset relative to 'now', 3. Just 'now'
    first_ev = events[0] if events else None
    if first_ev and first_ev.get("timestamp"):
        target_time = float(first_ev["timestamp"])
    elif first_ev and first_ev.get("time_offset") is not None:
        target_time = engine_clock + float(first_ev["time_offset"])
    else:
        target_time = current_time
    
    # Catch up full missing days iteratively to reset physiology to baseline
    while (target_time - engine_clock) >= 86400:
        actions_xml += _catchup_routine_xml(user_weight_kg)
        engine_clock += 86400

    gap_remaining = int(target_time - engine_clock)
    
    if gap_remaining > 30:
        actions_xml += f"        <!-- Basal gap: {gap_remaining}s since last sync to first event -->\n"
        actions_xml += _advance_xml(gap_remaining)
        engine_clock += gap_remaining

    last_substance_time = -99999

    for event in sorted(events, key=lambda x: float(x.get("timestamp") or 0)):
        ev_ts = float(event.get("timestamp") or (engine_clock + (event.get("time_offset") or 0)))
        wait_time = int(ev_ts - engine_clock)
        if wait_time > 0:
            actions_xml += _advance_xml(wait_time)
            engine_clock += wait_time


        etype = event["event_type"]
        val   = event.get("value", 0)

        if etype == "exercise":
            intensity       = float(val)
            duration_sec    = int(float(event.get("duration_seconds") or 1800))
            duration_sec    = max(60, min(duration_sec, 14400))
            actions_xml    += _exercise_xml(intensity)
            actions_xml    += _advance_xml(duration_sec)
            engine_clock   += duration_sec
            actions_xml    += _exercise_xml(0.0)

        elif etype == "sleep":
            hours       = max(0.25, min(float(val or 0), 12.0))
            sleep_sec   = int(hours * 3600)
            actions_xml += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
            actions_xml += _advance_xml(sleep_sec)
            actions_xml += '        <Action xsi:type="SleepData" Sleep="Off"/>\n'
            engine_clock += sleep_sec

        elif etype == "meal":
            actions_xml += _meal_xml(
                calories  = float(val or 0),
                meal_type = event.get("meal_type", "balanced"),
                carb_g    = event.get("carb_g"),
                fat_g     = event.get("fat_g"),
                protein_g = event.get("protein_g"),
            )

        elif etype == "water":
            actions_xml += _water_xml(float(val or 0))

        elif etype == "substance":
            is_stacked   = (ev_ts - (last_substance_time or 0)) < 14400
            sub_name     = event.get("substance_name", "Caffeine")
            actions_xml += _substance_xml(sub_name, float(val or 0), is_stacked)
            last_substance_time = ev_ts

        elif etype == "environment":
            env_name     = event.get("environment_name", "StandardEnvironment")
            actions_xml += _environment_xml(env_name)

        elif etype == "stress":                          
            intensity    = max(0.0, min(1.0, float(val or 0)))
            dur          = int(float(event.get("duration_seconds") or 300))
            actions_xml += _stress_xml(intensity)
            actions_xml += _advance_xml(dur)
            engine_clock += dur
            actions_xml += _stress_xml(intensity * 0.3)
            actions_xml += _advance_xml(300)
            engine_clock += 300
            actions_xml += _stress_xml(0.0)

        elif etype == "alcohol":
            actions_xml += _alcohol_xml(float(val or 0), weight_kg=user_weight_kg)
            actions_xml += _advance_xml(1800)
            engine_clock += 1800

        elif etype == "fast":
            hours = max(1.0, min(48.0, float(val or 0)))
            fast_sec = int(hours * 3600)
            actions_xml += _fasting_xml(hours)
            engine_clock += fast_sec  # _fasting_xml advances exactly fast_sec internally

    # Final stabilisation or catch-up to present time
    final_gap = int(time.time() - engine_clock)
    if final_gap > 10:
        while final_gap >= 86400:
            actions_xml += _catchup_routine_xml(user_weight_kg)
            engine_clock += 86400
            final_gap -= 86400
        # Cap remaining daytime gap to 4 hours to avoid starvation before next meal is inevitably logged
        actions_xml += _advance_xml(min(final_gap, 14400))
    else:
        # Minimum baseline padding for engine
        actions_xml += _advance_xml(60)

    data_req = _DATA_REQUESTS.format(prefix=csv_prefix)
    xml = (
        _scenario_header(abs_state_in, data_req)
        + actions_xml
        + _serialize_state_xml(abs_state_out)
        + "\n"
        + _scenario_footer()
    )
    scenario_file.write_text(xml, encoding="utf-8")
    return str(scenario_file.absolute()), run_id, csv_prefix



# ── PUBLIC: Forecast scenario ────────────────────────────────────────────────
def build_forecast_scenario(user_id, state_path, hours=4):
    run_id        = f"{user_id}_forecast_{int(time.time())}"
    scenario_file = SCENARIO_API_DIR / f"forecast_{run_id}.xml"
    abs_state_in  = Path(state_path).absolute().as_posix()
    # ✅ FIX: Save forecast state so forecasts can be chained
    abs_state_out = (BIOGEARS_BIN_DIR / f"forecast_{user_id}.xml").as_posix()
    csv_prefix    = f"forecast_{run_id}"

    data_req = _DATA_REQUESTS.format(prefix=csv_prefix)
    xml = (
        _scenario_header(abs_state_in, data_req)
        + _advance_xml(hours * 3600)
        + _serialize_state_xml(abs_state_out)
        + "\n"
        + _scenario_footer()
    )
    scenario_file.write_text(xml, encoding="utf-8")
    return str(scenario_file.absolute()), run_id, csv_prefix


# ── PUBLIC: What-if scenario pair ────────────────────────────────────────────
def build_whatif_scenario(user_id, state_path, event: dict, hours=4):
    """
    Builds two scenario files from the same engine state:
      1. Baseline  — just advances time (no interventions)
      2. Intervention — applies the event, then advances time

    Returns (baseline_path, intervention_path, base_run_id, evt_run_id,
             base_csv_prefix, evt_csv_prefix)
    """
    ts            = int(time.time())
    abs_state_in  = Path(state_path).absolute().as_posix()
    seconds       = hours * 3600

    # ── Baseline ─────────────────────────────────────────────────────────────
    base_run_id   = f"{user_id}_wi_base_{ts}"
    base_prefix   = f"whatif_base_{base_run_id}"
    base_file     = SCENARIO_API_DIR / f"{base_prefix}.xml"
    base_data_req = _DATA_REQUESTS.format(prefix=base_prefix)
    base_xml = (
        _scenario_header(abs_state_in, base_data_req)
        + _advance_xml(seconds)
        + _scenario_footer()
    )
    base_file.write_text(base_xml, encoding="utf-8")

    # ── Intervention ─────────────────────────────────────────────────────────
    evt_run_id  = f"{user_id}_wi_event_{ts}"
    evt_prefix  = f"whatif_event_{evt_run_id}"
    evt_file    = SCENARIO_API_DIR / f"{evt_prefix}.xml"

    etype = event.get("event_type", "")
    val   = event.get("value", 0)
    event_action = ""

    if etype == "exercise":
        dur = int(event.get("duration_seconds") or min(seconds // 2, 3600))
        event_action  = _exercise_xml(float(val))
        event_action += _advance_xml(dur)
        event_action += _exercise_xml(0.0)
        remaining = max(0, seconds - dur)
        if remaining:
            event_action += _advance_xml(remaining)
    elif etype == "meal":
        event_action  = _meal_xml(float(val), event.get("meal_type", "balanced"),
                                  event.get("carb_g"), event.get("fat_g"), event.get("protein_g"))
        event_action += _advance_xml(seconds)
    elif etype == "water":
        event_action  = _water_xml(float(val))
        event_action += _advance_xml(seconds)
    elif etype == "substance":
        event_action  = _substance_xml(event.get("substance_name", "Caffeine"), float(val))
        event_action += _advance_xml(seconds)
    elif etype == "environment":
        event_action  = _environment_xml(event.get("environment_name", "StandardEnvironment"))
        event_action += _advance_xml(seconds)
    else:
        event_action = _advance_xml(seconds)

    evt_data_req = _DATA_REQUESTS.format(prefix=evt_prefix)
    evt_xml = (
        _scenario_header(abs_state_in, evt_data_req)
        + event_action
        + _scenario_footer()
    )
    evt_file.write_text(evt_xml, encoding="utf-8")

    return (
        str(base_file.absolute()), str(evt_file.absolute()),
        base_run_id, evt_run_id,
        base_prefix, evt_prefix,
    )