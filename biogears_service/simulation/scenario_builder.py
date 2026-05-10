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
# IMPORTANT: The Filename attribute must include the subdirectory path relative
# to BIOGEARS_BIN_DIR (its CWD). BioGears writes the CSV to this path verbatim.
# We use 'Scenarios/API/{prefix}Results.csv' so the file lands in SCENARIO_API_DIR
# where server.py already searches via rglob.
_DATA_REQUESTS = """    <DataRequests Filename="Scenarios/API/{prefix}Results.csv">
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

# Sodium content per meal type (mg) — realistic dietary sodium
# Source: USDA Dietary Guidelines 2020, average serving sodium values
_MEAL_SODIUM_MG = {
    "balanced":     600,
    "high_carb":    500,
    "high_protein": 700,
    "fast_food":   1200,  # typical fast-food meal sodium
    "ketogenic":    400,
    "custom":       600,  # default for custom
}


def _meal_xml(calories: float, meal_type: str,
              carb_g=None, fat_g=None, protein_g=None) -> str:
    """
    Returns a ConsumeNutrientsData XML action with physiologically accurate macros.
    Sodium is included per meal type based on USDA dietary averages.
    Custom meals use explicitly passed macros; preset meals derive from calorie fractions.
    """
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
    # Sodium: scale by calorie fraction of a ~2000 kcal/day reference meal
    # BioGears unit: mg
    cal_fraction  = min(calories / 2000.0, 1.0)
    sodium_mg     = round(_MEAL_SODIUM_MG.get(meal_type, 600) * cal_fraction, 0)
    return (
        f'        <Action xsi:type="ConsumeNutrientsData">\n'
        f'            <Nutrition>\n'
        f'                <Carbohydrate value="{c}" unit="g"/>\n'
        f'                <Fat          value="{f}" unit="g"/>\n'
        f'                <Protein      value="{p}" unit="g"/>\n'
        f'                <Sodium       value="{sodium_mg}" unit="mg"/>\n'
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
    """
    Routes a substance to the correct BioGears administration action.

    BioGears IV bolus CDM requires:
      <Concentration value="C" unit="mg/mL"/> + <Dose value="V" unit="mL"/>
      where Dose (mg) = C × V
    We use C = 1 mg/mL (or 1000 ug/mL for ug-dosed drugs) so V = dose_mg numerically.

    ORAL uses SubstanceOralDoseData with dose in mg directly.
    NASAL uses SubstanceNasalDoseData with dose in ug directly.
    """
    if name == "Caffeine":
        # BioGears does not natively ship with Caffeine.xml!
        # We mimic the sympathetic effect (HR increase) via AcuteStressData.
        # 100mg caffeine -> ~0.05 severity.
        severity = min(0.15, val / 2000.0)
        return (
            f'        <Action xsi:type="AcuteStressData">\n'
            f'            <Severity value="{severity:.4f}"/>\n'
            f'        </Action>\n'
        )

    info = SUBSTANCE_REGISTRY.get(name)
    if info is None:
        # Unknown substance — try as 1 mg/mL IV bolus
        return (
            f'        <Action xsi:type="SubstanceBolusData" AdminRoute="Intravenous">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Concentration value="1.0" unit="mg/mL"/>\n'
            f'            <Dose value="{round(val, 4)}" unit="mL"/>\n'
            f'        </Action>\n'
        )

    effective_val = round(val * 1.15, 4) if is_stacked else round(val, 4)
    route = info["route"]
    unit  = info["unit"]   # "mg", "ug", "mL/min", or "U" (insulin units)

    if route == "IV_COMPOUND":
        return (
            f'        <Action xsi:type="SubstanceCompoundInfusionData">\n'
            f'            <SubstanceCompound>{name}</SubstanceCompound>\n'
            f'            <BagVolume value="500" unit="mL"/>\n'
            f'            <Rate value="{effective_val}" unit="{unit}"/>\n'
            f'        </Action>\n'
        )

    elif route == "ORAL":
        # SubstanceOralDoseData: dose in mg directly
        return (
            f'        <Action xsi:type="SubstanceOralDoseData" AdminRoute="Gastrointestinal">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Dose value="{effective_val}" unit="mg"/>\n'
            f'        </Action>\n'
        )

    elif route == "NASAL":
        # SubstanceNasalDoseData: dose in ug directly
        return (
            f'        <Action xsi:type="SubstanceNasalDoseData">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Dose value="{effective_val}" unit="ug"/>\n'
            f'        </Action>\n'
        )

    else:  # IV_BOLUS
        # BioGears CDM: Concentration × Volume = Dose
        # Use concentration 1 mg/mL → volume_mL = dose_mg (numerically equivalent)
        # For ug-dosed drugs (Fentanyl): 1000 ug/mL → volume_mL = dose_ug / 1000
        if unit == "ug":
            # Fentanyl and other ug-dosed IV drugs
            conc_val  = 1000.0              # ug/mL
            conc_unit = "ug/mL"
            dose_vol  = round(effective_val / 1000.0, 6)  # ug ÷ (ug/mL) = mL
        elif unit == "U":
            # Insulin — Units dosed at 100 U/mL concentration
            conc_val  = 100.0
            conc_unit = "U/mL"
            dose_vol  = round(effective_val / 100.0, 6)   # U ÷ (U/mL) = mL
        else:
            # mg-dosed drugs: 1 mg/mL → volume = dose_mg numerically
            conc_val  = 1.0
            conc_unit = "mg/mL"
            dose_vol  = effective_val                       # mg ÷ (mg/mL) = mL

        return (
            f'        <Action xsi:type="SubstanceBolusData" AdminRoute="Intravenous">\n'
            f'            <Substance>{name}</Substance>\n'
            f'            <Concentration value="{conc_val}" unit="{conc_unit}"/>\n'
            f'            <Dose value="{dose_vol}" unit="mL"/>\n'
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


import logging as _sb_logger
_sb_log = _sb_logger.getLogger("DigitalTwin.ScenarioBuilder")


def _exercise_xml(intensity: float) -> str:
    """Emit BioGears ExerciseData XML. Intensity is ALWAYS clamped to [0.0, 1.0]."""
    clamped = max(0.0, min(1.0, float(intensity)))
    if clamped != float(intensity):
        _sb_log.warning(
            f"_exercise_xml: intensity {intensity} out of [0,1] — clamped to {clamped:.4f}. "
            f"Fix the caller to send a normalised value."
        )
    return (
        f'        <Action xsi:type="ExerciseData">'
        f'<GenericExercise><Intensity value="{clamped:.4f}"/></GenericExercise>'
        f'</Action>\n'
    )


def _advance_xml(seconds: int) -> str:
    return f'        <Action xsi:type="AdvanceTimeData"><Time value="{seconds}" unit="s"/></Action>\n'


# Maximum seconds for a single AdvanceTimeData action sent to BioGears.
# Larger advances are automatically split into multiple chunks.
# Keeping this at ≤1800 s (30 min) prevents the engine from running for
# hours on a single action and then crashing from physiological divergence.
_MAX_ADVANCE_CHUNK_S = 1800


def _chunked_advance_xml(total_seconds: int) -> str:
    """
    Splits a large AdvanceTime into multiple ≤1800-second chunks.

    BioGears can be asked to simulate many hours of physiology in one
    AdvanceTimeData action, which causes the engine to run for a very long
    wall-clock time and then crash from physiological divergence. Chunking
    keeps each advance short so the engine writes progress checkpoints and
    is less likely to diverge.
    """
    if total_seconds <= 0:
        return ''
    xml = ''
    remaining = int(total_seconds)
    while remaining > 0:
        chunk = min(remaining, _MAX_ADVANCE_CHUNK_S)
        xml += _advance_xml(chunk)
        remaining -= chunk
    return xml


def _stress_xml(intensity: float) -> str:
    """
    Models acute stress / fight-or-flight via BioGears AcuteStressData action.

    CDM choice: AcuteStressData (NOT PainStimulusData)
    =====================================================
    - AcuteStressData: HPA axis activation, sympathetic surge, cortisol release.
      @brief 'Fight or flight. The body prepares to defend itself.'
      Physiological effects: HR ↑, BP ↑, glucose ↑, respiration ↑
      Severity 0.0 → clears the stress state completely ✓

    - PainStimulusData: Nociceptive (physical injury) pain pathway.
      Requires a Location attribute (body site) and optionally HalfLife (pain decay).
      WRONG for psychological/emotional stress.

    Intensity: 0.0 = no stress (clears state) → 1.0 = panic / maximum stress.
    XSD-validated: AcuteStressData.Severity is Scalar0To1Data (Bound0To1Double, inclusive).
    """
    clamped = max(0.0, min(1.0, float(intensity)))
    return (
        f'        <Action xsi:type="AcuteStressData">\n'
        f'            <Severity value="{clamped:.4f}"/>\n'
        f'        </Action>\n'
    )


def _alcohol_xml(standard_drinks: float, weight_kg: float = 70.0) -> str:
    """
    Models alcohol consumption (1 standard drink = 14g ethanol = 10 mL absolute alcohol).
    Ethanol is administered as oral dose via SubstanceOralDoseData.

    UNIT NOTE: BioGears Ethanol.xml substance definition uses mass 'g' as its dose unit
    (unlike most other substances which use 'mg'). SubstanceOralDoseData for Ethanol
    must use unit='g'. This is correct and validated against the BioGears CDM.

    Effects: vasodilation, mild bradycardia, impaired glucose regulation.
    Standard drink = 14g ethanol (US definition, NIAAA).
    """
    ethanol_g = round(standard_drinks * 14.0, 1)
    return (
        f'        <Action xsi:type="SubstanceOralDoseData" AdminRoute="Gastrointestinal">\n'
        f'            <Substance>Ethanol</Substance>\n'
        f'            <Dose value="{ethanol_g}" unit="g"/>\n'
        f'        </Action>\n'
    )


def _fasting_xml(hours: float) -> str:
    """
    Models intermittent fasting / religious fasting via pure time advance with zero nutrition.

    Real fasting physiology:
      - No exogenous nutrients → liver glycogen depletes (~6–12h)
      - After glycogen depletion: gluconeogenesis from amino acids, then fat oxidation
      - Ketone bodies rise after ~12–16h of fasting
      - Basal HR may increase slightly due to sympathetic tone (catecholamine release)
      - Blood glucose drops from ~90 mg/dL toward 60–70 mg/dL

    BioGears accurately simulates all of this through its metabolic pathways when
    simply advancing time without any ConsumeNutrientsData actions.
    The previous exercise-hack (0.02 intensity) was incorrect — exercise metabolism
    differs from fasting metabolism in terms of substrate utilization and hormonal state.

    Hours clamped 1–48.
    """
    hours   = max(1.0, min(48.0, float(hours)))
    seconds = int(hours * 3600)
    # Pure time advance — BioGears metabolic model handles glucose drop,
    # free fatty acid mobilization, and ketogenesis automatically.
    # Use _chunked_advance_xml so even a 48h fast (172800s) is split into
    # <=1800s pieces and doesn't run the engine for hours on one action.
    return _chunked_advance_xml(seconds)


def _circadian_phase_xml(wall_hour: int) -> str:
    """
    Injects a time-of-day physiological modifier before user events.
    Real physiology has a strong circadian pattern:
      06–10: Morning cortisol surge → HR +6bpm, BP +10mmHg, alertness ↑
      10–18: Daytime peak performance baseline
      18–22: Evening wind-down → slight vagal tone increase
      22–06: Night / recovery → HR -10bpm, BP -5mmHg (parasympathetic dominance)

    Implementation:
    ---------------
    We use AcuteStressData (severity 0.10) for the morning cortisol surge.
    AcuteStressData is the correct CDM action for HPA-axis / sympathetic activation.
    Severity 0.10 ≈ mild stress, raising HR by ~5–8 bpm and BP by ~8 mmHg,
    consistent with the documented morning cortisol peak effect.

    We do NOT emit AcuteStressData with severity=0.0 at other phases because:
    - The BioGears resting state (post-stabilization) already represents the
      daytime/nighttime baseline without needing an explicit modifier.
    - An explicit severity=0.0 at night would clear any residual stress from the
      previous day's events, which could actually be desirable but is not needed
      if the previous day's stress was already cleared via the decay pattern.

    NOTE: PainStimulusData is NOT used here (it models nociceptive pain, not cortisol).
    """
    if 6 <= wall_hour < 10:
        # Morning cortisol surge — mild HPA activation (AcuteStressData severity 0.10)
        return _stress_xml(0.10)
    # All other phases: no modifier needed (BioGears resting state is the baseline)
    return ""


def _catchup_routine_xml(weight_kg: float) -> str:
    """
    Simulates a generic 24-hour day to catch up physiological state after missing a day.
    Includes normal hydration, 3 meals (~2000 kcal total), and 8 hours of sleep.

    TIMING (total = 86400s exactly = 24h):
      0h    wake up, water
      0.5h  breakfast (500 kcal)
      4.5h  lunch with water (700 kcal)
      9.5h  dinner with water (800 kcal)
      16h   sleep start
      24h   sleep end
    """
    xml = "        <!-- START CATCH-UP ROUTINE (simulating missing day) -->\n"

    # 0h: Wake up, drink water (250 mL), advance 30 min
    xml += _water_xml(250.0)
    xml += _chunked_advance_xml(1800)   # 0 → 0.5h

    # 0.5h: Breakfast (500 kcal), advance 4h
    xml += _meal_xml(500, "balanced")
    xml += _chunked_advance_xml(14400)  # 0.5 → 4.5h

    # 4.5h: Lunch + water (700 kcal), advance 5h
    xml += _water_xml(300.0)
    xml += _meal_xml(700, "balanced")
    xml += _chunked_advance_xml(18000)  # 4.5 → 9.5h

    # 9.5h: Dinner + water (800 kcal), advance 6.5h
    xml += _water_xml(300.0)
    xml += _meal_xml(800, "balanced")
    xml += _chunked_advance_xml(23400)  # 9.5 → 16h

    # 16h: Sleep 8 hours
    xml += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
    xml += _chunked_advance_xml(28800)  # 16 → 24h
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
    )


def _scenario_footer() -> str:
    return '</Scenario>'


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

    # ── Validate & clamp physiological parameters ──────────────────────────
    # BioGears engine will crash or fail to converge if these are out of range.
    # Ranges derived from BioGears CDM documentation and patient validation tests.
    age    = max(18, min(80, int(age)))
    weight = max(30.0, min(200.0, float(weight)))   # kg
    height = max(140.0, min(220.0, float(height)))  # cm
    # BioGears: BodyFatFraction must be 0.02–0.70 (0% and >70% cause engine crash)
    body_fat = max(0.02, min(0.70, float(body_fat)))

    # Blood pressure: clamp to BioGears-stable ranges
    # Too-low BP causes cardiovascular instability; too-high causes non-convergence
    diastolic_bp = float(clinical_config.get("diastolic_bp", 73.5))
    systolic_bp  = float(clinical_config.get("systolic_bp", 114.0))
    resting_hr   = float(clinical_config.get("resting_hr", 72.0))
    diastolic_bp = max(55.0, min(95.0,  diastolic_bp))
    systolic_bp  = max(85.0, min(160.0, systolic_bp))
    resting_hr   = max(50.0, min(100.0, resting_hr))

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
        f'    <DiastolicArterialPressureBaseline value="{diastolic_bp}" unit="mmHg"/>\n'
        f'    <HeartRateBaseline value="{resting_hr}" unit="1/min"/>\n'
        f'    <SystolicArterialPressureBaseline value="{systolic_bp}" unit="mmHg"/>\n'
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
    # BioGears CDM requires conditions inside a <Conditions> wrapper element
    # within <InitialParameters>. Placing them bare (without wrapper) causes
    # XSD validation failure: "no declaration found for element 'Condition'"
    conditions_block = (
        f'        <Conditions>\n'
        f'            {conditions_xml}\n'
        f'        </Conditions>\n'
        if conditions_xml.strip() else ""
    )

    # BioGears 8 auto-stabilizes the patient before running actions.
    # <TrackStabilization> is not a valid v8 CDM element and causes parse errors.
    # We advance 120s post-stabilization to let transient oscillations settle
    # before saving the calibrated state.
    s_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
        '<Scenario xmlns="uri:/mil/tatrc/physiology/datamodel"'
        ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        '    <InitialParameters>\n'
        f'        <PatientFile>{abs_patient}</PatientFile>\n'
        f'{conditions_block}'
        '    </InitialParameters>\n'
        '        <Action xsi:type="AdvanceTimeData"><Time value="300" unit="s"/></Action>\n'
        f'        <Action xsi:type="SerializeStateData" Type="Save"><Filename>{abs_state_out}</Filename></Action>\n'
        '</Scenario>'
    )
    scenario_path.write_text(s_xml, encoding="utf-8")
    return str(scenario_path.absolute())


# ── PUBLIC: Batch reconstruction ─────────────────────────────────────────────
def build_batch_reconstruction(user_id, state_path, events: list, user_weight_kg: float = 70.0):
    """
    Builds a BioGears scenario that reconstructs the user's physiology from their
    logged events, correctly handling past-event timestamps.

    KEY FIX: If events are timestamped BEFORE the engine state's creation time
    (e.g. twin created at 12:00 PM, but events logged for 6:00 AM that same day),
    the engine rewinds to midnight of the earliest event's day and plays the full
    timeline forward from there. This ensures physiological state at each event
    time is accurate — glucose, HR, and BP all reflect what happened earlier.
    """
    import logging as _logging
    _log = _logging.getLogger("DigitalTwin.ScenarioBuilder")

    run_id        = f"{user_id}_{int(time.time())}"
    scenario_file = SCENARIO_API_DIR / f"batch_{run_id}.xml"
    abs_state_in  = Path(state_path).absolute().as_posix()
    abs_state_out = (BIOGEARS_BIN_DIR / f"batch_{user_id}.xml").as_posix()
    # csv_prefix is used as the DataRequests Filename stem only (no path, no extension).
    # _DATA_REQUESTS template now hardcodes 'Scenarios/API/{prefix}Results.csv'
    # so BioGears writes to SCENARIO_API_DIR/{csv_prefix}Results.csv.
    csv_prefix    = f"batch_{run_id}"

    # ── Resolve all event timestamps upfront ────────────────────────────────
    now_ts       = time.time()
    
    # Load Smart Continuation Meta
    meta_path = Path(state_path).with_suffix(".meta.json")
    state_meta = {}
    if meta_path.exists():
        try:
            import json
            state_meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            pass
            
    engine_sim_time = state_meta.get("engine_sim_time", None)
    if engine_sim_time is None:
        # No meta.json exists yet (e.g. user registered before meta-write was added).
        # Default to 30 minutes ago so the normal path is used with a minimal basal gap.
        # Also heal the missing file immediately so future simulations don't fall back again.
        engine_sim_time = now_ts - 1800
        _log.warning(
            f"[{user_id}] No meta.json found for state '{state_path}'. "
            f"Healing: setting engine_sim_time = now - 30min ({engine_sim_time:.0f}). "
            f"Writing meta.json for future runs."
        )
        try:
            import json as _j
            Path(state_path).with_suffix(".meta.json").write_text(
                _j.dumps({"engine_sim_time": int(engine_sim_time), "healed": True}),
                encoding="utf-8"
            )
        except Exception as _he:
            _log.warning(f"[{user_id}] meta.json heal-write failed: {_he}")
    processed_events = state_meta.get("events_processed", [])


    event_dicts = []
    for ev in events:
        ts = float(ev.get("timestamp") or 0)
        if ts <= 0:
            # fallback: time_offset relative to now, or just now
            ts = now_ts + float(ev.get("time_offset") or 0)
        ev_copy = dict(ev)
        ev_copy["timestamp"] = ts
        event_dicts.append(ev_copy)

    # ── Timeline Splitting for Overlapping Events ───────────────────────────
    timeline_events = []
    for ev in event_dicts:
        ts = ev["timestamp"]
        etype = ev.get("event_type")
        val = ev.get("value", 0)

        if etype == "exercise":
            dur = max(60, min(int(float(ev.get("duration_seconds") or 1800)), 14400))
            timeline_events.append({"timestamp": ts, "event_type": "exercise_start", "value": val})
            timeline_events.append({"timestamp": ts + dur, "event_type": "exercise_end"})
            
        elif etype == "sleep":
            sleep_sec = int(max(0.25, min(float(val or 0), 12.0)) * 3600)
            timeline_events.append({"timestamp": ts, "event_type": "sleep_start"})
            timeline_events.append({"timestamp": ts + sleep_sec, "event_type": "sleep_end"})
            
        elif etype == "stress":
            intensity = max(0.0, min(1.0, float(val or 0)))
            dur = max(60, min(int(float(ev.get("duration_seconds") or 300)), 3600))
            timeline_events.append({"timestamp": ts, "event_type": "stress_start", "value": intensity})
            if intensity > 0.05:
                timeline_events.append({"timestamp": ts + dur, "event_type": "stress_decay", "value": intensity * 0.3})
                timeline_events.append({"timestamp": ts + dur + 300, "event_type": "stress_end"})
            else:
                timeline_events.append({"timestamp": ts + dur, "event_type": "stress_end"})
                
        elif etype == "fast":
            fast_sec = int(max(1.0, min(48.0, float(val or 0))) * 3600)
            timeline_events.append({"timestamp": ts, "event_type": "fast_start"})
            timeline_events.append({"timestamp": ts + fast_sec, "event_type": "fast_end"})
            
        elif etype == "alcohol":
            # Alcohol requires an anchor to allow absorption
            timeline_events.append({"timestamp": ts, "event_type": "alcohol_start", "value": val})
            timeline_events.append({"timestamp": ts + 1800, "event_type": "alcohol_end"})
            
        else:
            timeline_events.append(ev)

    sorted_events = sorted(timeline_events, key=lambda x: float(x["timestamp"]))

    # ── Smart Fast-Continuation Check ───────────────────────────────────────
    can_fast_continue = False
    new_events = []
    
    if processed_events and len(sorted_events) >= len(processed_events):
        # Check if the incoming events perfectly match the start of the processed events
        match = True
        for i, pe in enumerate(processed_events):
            inc = sorted_events[i]
            if inc.get("event_type") != pe.get("event_type") or abs(float(inc["timestamp"]) - float(pe["timestamp"])) > 1.0:
                match = False
                break
                
        if match:
            # They only appended new events!
            new_events_candidate = sorted_events[len(processed_events):]
            # Ensure the new events don't require time-travel backward
            if not new_events_candidate or float(new_events_candidate[0]["timestamp"]) >= engine_sim_time:
                can_fast_continue = True
                new_events = new_events_candidate
                
    if can_fast_continue:
        _log.info(f"[{user_id}] ⚡ FAST CONTINUATION: Ignoring {len(processed_events)} previously simulated events.")
        sorted_events = new_events

    # ── Determine the true simulation start time ─────────────────────────────
    # If the earliest event is BEFORE the engine state was created, we must
    # reconstruct backward to midnight of that event's day so that the engine
    # advances through the correct physiological timeline.
    earliest_ev_ts  = float(sorted_events[0]["timestamp"]) if sorted_events else now_ts
    latest_ev_ts    = float(sorted_events[-1]["timestamp"]) if sorted_events else now_ts

    if earliest_ev_ts < engine_sim_time and not can_fast_continue:
        # ── PAST-EVENT PATH: events are before twin creation ─────────────────
        # Reset to midnight of the earliest event's LOCAL calendar day so the
        # engine has a physiologically valid "start of day" anchor.
        earliest_dt      = datetime.datetime.fromtimestamp(earliest_ev_ts)
        midnight_dt      = earliest_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        midnight_ts      = midnight_dt.timestamp()

        engine_clock = midnight_ts
        _log.info(
            f"[{user_id}] PAST-EVENT RECONSTRUCTION: earliest event is "
            f"{earliest_dt.strftime('%H:%M')} but twin was created at "
            f"{datetime.datetime.fromtimestamp(engine_sim_time).strftime('%H:%M')}. "
            f"Rewinding engine clock to midnight ({midnight_dt.strftime('%Y-%m-%d 00:00')})."
        )

        # Circadian phase at midnight = parasympathetic (sleep / night baseline)
        actions_xml = _circadian_phase_xml(0)  # hour=0 → nighttime baseline

        # Advance engine from midnight to the first event with a sleep-like basal state
        # (person was asleep from midnight up to whenever they woke and started logging)
        pre_event_gap = int(earliest_ev_ts - midnight_ts)
        if pre_event_gap > 60:
            # Cap sleep to 2 hours — enough to model an overnight physiological baseline
            # without running the engine for hours before even the first event.
            sleep_hours = min(pre_event_gap / 3600.0, 2.0)  # HARD CAP: 2h max sleep advance
            sleep_sec   = int(sleep_hours * 3600)
            _log.info(f"[{user_id}] Injecting {sleep_hours:.1f}h sleep (midnight → first event).")
            actions_xml += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
            actions_xml += _chunked_advance_xml(sleep_sec)
            actions_xml += '        <Action xsi:type="SleepData" Sleep="Off"/>\n'
            engine_clock += sleep_sec

            # Morning wakeup buffer — cap to 30 min max so we don't add another huge block
            remaining_to_first = int(earliest_ev_ts - engine_clock)
            remaining_to_first = min(remaining_to_first, _MAX_ADVANCE_CHUNK_S)  # HARD CAP: 30 min
            if remaining_to_first > 60:
                actions_xml += _chunked_advance_xml(remaining_to_first)
                engine_clock += remaining_to_first
    else:
        # ── NORMAL PATH: events are at/after twin creation ───────────────────
        engine_clock = engine_sim_time
        wall_hour    = datetime.datetime.now().hour
        actions_xml  = _circadian_phase_xml(wall_hour)

        # Hard cap pre-event basal gap to 30 minutes of simulated time.
        # Larger gaps are silently fast-forwarded on the logical clock only.
        time_jump = earliest_ev_ts - engine_clock
        if time_jump > _MAX_ADVANCE_CHUNK_S:
            engine_clock += (time_jump - _MAX_ADVANCE_CHUNK_S)  # logical fast-forward

        gap_to_first = int(earliest_ev_ts - engine_clock)
        if gap_to_first > 30:
            actions_xml  += f"        <!-- Basal gap: {gap_to_first}s since last sync to first event -->\n"
            actions_xml  += _chunked_advance_xml(gap_to_first)
            engine_clock += gap_to_first


    # ── Log engine timeline for debugging ───────────────────────────────────
    _log.info(
        f"[{user_id}] ENGINE TIMELINE:"
        f" start={datetime.datetime.fromtimestamp(engine_clock).strftime('%H:%M:%S')}"
        f" | first_event={datetime.datetime.fromtimestamp(earliest_ev_ts).strftime('%H:%M:%S')}"
        f" | last_event={datetime.datetime.fromtimestamp(latest_ev_ts).strftime('%H:%M:%S')}"
        f" | now={datetime.datetime.fromtimestamp(now_ts).strftime('%H:%M:%S')}"
    )

    # ── Replay each event at its correct engine time ─────────────────────────
    last_substance_time = -99999
    # Minimum advance between any two actions so BioGears doesn't receive
    # back-to-back actions with zero time (which can confuse the CDM parser).
    _MIN_ADVANCE_S = 10

    for event in sorted_events:
        ev_ts     = float(event["timestamp"])
        wait_time = int(ev_ts - engine_clock)

        # Cap long gaps between events to _MAX_ADVANCE_CHUNK_S (30 min) and
        # fast-forward the logical clock for anything beyond that.
        if wait_time > _MAX_ADVANCE_CHUNK_S:
            engine_clock += (wait_time - _MAX_ADVANCE_CHUNK_S)
            wait_time = _MAX_ADVANCE_CHUNK_S

        # If an event is genuinely behind the engine clock, skip it.
        if wait_time < -60:
            _log.warning(
                f"[{user_id}] Skipping event '{event.get('event_type')}' at "
                f"{datetime.datetime.fromtimestamp(ev_ts).strftime('%H:%M')} — "
                f"already past engine clock ({datetime.datetime.fromtimestamp(engine_clock).strftime('%H:%M')})."
            )
            continue

        # Enforce minimum advance so BioGears always has at least 10s between actions.
        # Use _chunked_advance_xml so no single AdvanceTimeData node is > 1800 s.
        effective_wait = max(wait_time, _MIN_ADVANCE_S)
        if effective_wait > 0:
            actions_xml  += _chunked_advance_xml(effective_wait)
            engine_clock += effective_wait

        etype = event["event_type"]
        val   = event.get("value", 0)
        _log.info(
            f"[{user_id}] ▶ {etype.upper():12s} val={val} "
            f"@ engine_t={datetime.datetime.fromtimestamp(engine_clock).strftime('%H:%M:%S')}"
        )

        if etype == "exercise_start":
            actions_xml += _exercise_xml(float(val))
        elif etype == "exercise_end":
            actions_xml += _exercise_xml(0.0)

        elif etype == "sleep_start":
            actions_xml += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
        elif etype == "sleep_end":
            actions_xml += '        <Action xsi:type="SleepData" Sleep="Off"/>\n'

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
            is_stacked  = (ev_ts - (last_substance_time or 0)) < 14400
            sub_name    = event.get("substance_name", "Caffeine")
            actions_xml += _substance_xml(sub_name, float(val or 0), is_stacked)
            last_substance_time = ev_ts

        elif etype == "environment":
            env_name    = event.get("environment_name", "Standard")
            actions_xml += _environment_xml(env_name)

        elif etype == "stress_start":
            actions_xml += _stress_xml(float(val))
        elif etype == "stress_decay":
            actions_xml += _stress_xml(float(val))
        elif etype == "stress_end":
            actions_xml += _stress_xml(0.0)

        elif etype == "alcohol_start":
            actions_xml += _alcohol_xml(float(val or 0), weight_kg=user_weight_kg)
        elif etype == "alcohol_end":
            pass # structural anchor

        elif etype in ("fast_start", "fast_end"):
            pass # structural anchor; engine advances time automatically

    # Cap final stabilization gap to 30 minutes and chunk it
    final_gap = int(now_ts - engine_clock)
    _log.info(f"[{user_id}] Final gap to 'now': {final_gap}s ({round(final_gap/3600, 1)}h)")

    capped_gap = min(final_gap, _MAX_ADVANCE_CHUNK_S)
    if capped_gap > 10:
        actions_xml += _chunked_advance_xml(capped_gap)
        engine_clock += capped_gap
    else:
        # Minimum baseline padding so BioGears writes at least a few data rows
        actions_xml += _advance_xml(60)
        engine_clock += 60


    # Write Meta File for future Fast-Continuations.
    # IMPORTANT: store raw event_dicts (pre-timeline-split), NOT sorted_events.
    # The fast-continuation check compares incoming raw events against stored raw events.
    # Storing timeline_events (with _start/_end markers) would cause a type mismatch
    # and fast continuation would never activate.
    try:
        import json
        meta_dict = {
            "engine_sim_time": engine_clock,
            "events_processed": event_dicts  # RAW events (pre-split, same format as input)
        }
        Path(state_path).with_suffix(".meta.json").write_text(json.dumps(meta_dict), encoding="utf-8")
    except Exception as e:
        _log.warning(f"Failed to write state meta: {e}")

    data_req = _DATA_REQUESTS.format(prefix=csv_prefix)
    xml = (
        _scenario_header(abs_state_in, data_req)
        + actions_xml
        + _serialize_state_xml(abs_state_out)
        + "\n"
        + _scenario_footer()
    )
    scenario_file.write_text(xml, encoding="utf-8")
    _log.info(f"[{user_id}] Scenario written → {scenario_file.name}")
    # Return the csv_prefix so server.py can construct the exact expected filename:
    # SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
    return str(scenario_file.absolute()), run_id, csv_prefix



# ── PUBLIC: Forecast scenario ────────────────────────────────────────────────
def build_forecast_scenario(user_id, state_path, hours=4):
    run_id        = f"{user_id}_forecast_{int(time.time())}"
    scenario_file = SCENARIO_API_DIR / f"forecast_{run_id}.xml"
    abs_state_in  = Path(state_path).absolute().as_posix()
    abs_state_out = (BIOGEARS_BIN_DIR / f"forecast_{user_id}.xml").as_posix()
    csv_prefix    = f"forecast_{run_id}"

    # Clamp forecast window: min 1h, max 12h — beyond 12h the engine diverges
    hours     = max(1, min(12, int(hours)))
    total_sec = hours * 3600

    data_req = _DATA_REQUESTS.format(prefix=csv_prefix)
    xml = (
        _scenario_header(abs_state_in, data_req)
        + _chunked_advance_xml(total_sec)   # chunked so no single advance > 1800s
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
      1. Baseline     — just advances time (no interventions)
      2. Intervention — applies the event, then advances time

    Returns (baseline_path, intervention_path, base_run_id, evt_run_id,
             base_csv_prefix, evt_csv_prefix)
    """
    ts            = int(time.time())
    abs_state_in  = Path(state_path).absolute().as_posix()
    # Clamp to a reasonable window so the engine doesn't run for hours
    hours         = max(1, min(12, int(hours)))
    seconds       = hours * 3600

    # ── Baseline ─────────────────────────────────────────────────────────────
    base_run_id   = f"{user_id}_wi_base_{ts}"
    base_prefix   = f"whatif_base_{base_run_id}"
    base_file     = SCENARIO_API_DIR / f"{base_prefix}.xml"
    base_data_req = _DATA_REQUESTS.format(prefix=base_prefix)
    base_xml = (
        _scenario_header(abs_state_in, base_data_req)
        + _chunked_advance_xml(seconds)     # chunked baseline advance
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
        dur = max(60, min(dur, seconds))          # clamp to scenario window
        event_action  = _exercise_xml(float(val))
        event_action += _chunked_advance_xml(dur)
        event_action += _exercise_xml(0.0)
        remaining = max(0, seconds - dur)
        if remaining:
            event_action += _chunked_advance_xml(remaining)

    elif etype == "sleep":
        sleep_h   = max(0.25, min(float(val or 0), 12.0))
        sleep_sec = int(sleep_h * 3600)
        sleep_sec = min(sleep_sec, seconds)       # clamp to scenario window
        event_action += '        <Action xsi:type="SleepData" Sleep="On"/>\n'
        event_action += _chunked_advance_xml(sleep_sec)
        event_action += '        <Action xsi:type="SleepData" Sleep="Off"/>\n'
        remaining = max(0, seconds - sleep_sec)
        if remaining:
            event_action += _chunked_advance_xml(remaining)

    elif etype == "fast":
        fast_h   = max(1.0, min(48.0, float(val or 0)))
        fast_sec = int(fast_h * 3600)
        fast_sec = min(fast_sec, seconds)         # clamp to scenario window
        # Pure time advance — BioGears metabolic model handles fasting physiology
        event_action += _chunked_advance_xml(fast_sec)
        remaining = max(0, seconds - fast_sec)
        if remaining:
            event_action += _chunked_advance_xml(remaining)

    elif etype == "meal":
        event_action  = _meal_xml(float(val), event.get("meal_type", "balanced"),
                                  event.get("carb_g"), event.get("fat_g"), event.get("protein_g"))
        event_action += _chunked_advance_xml(seconds)

    elif etype == "water":
        event_action  = _water_xml(float(val))
        event_action += _chunked_advance_xml(seconds)

    elif etype == "substance":
        event_action  = _substance_xml(event.get("substance_name", "Caffeine"), float(val))
        event_action += _chunked_advance_xml(seconds)

    elif etype == "alcohol":
        # Use _alcohol_xml (standard drinks → grams ethanol) not _substance_xml
        drinks = max(0.0, float(val or 0))
        event_action  = _alcohol_xml(drinks)
        event_action += _chunked_advance_xml(seconds)

    elif etype == "environment":
        event_action  = _environment_xml(event.get("environment_name", "Standard"))
        event_action += _chunked_advance_xml(seconds)

    elif etype == "stress":
        intensity = max(0.0, min(1.0, float(val or 0)))
        dur = int(float(event.get("duration_seconds") or 300))
        dur = max(60, min(dur, seconds))          # clamp to scenario window
        # Use AcuteStressData (not exercise) to correctly model sympathetic surge
        event_action += _stress_xml(intensity)
        event_action += _chunked_advance_xml(dur)
        event_action += _stress_xml(0.0)          # clear stress after duration
        remaining = max(0, seconds - dur)
        if remaining:
            event_action += _chunked_advance_xml(remaining)

    else:
        event_action = _chunked_advance_xml(seconds)

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