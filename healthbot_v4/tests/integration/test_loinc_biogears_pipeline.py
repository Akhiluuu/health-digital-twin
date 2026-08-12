import pytest
from healthbot_v4.apps.ocr.engine.record_builder import SmartOCRPipeline
from biogears_service.simulation.scenario_builder import build_registration_scenario
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager

def test_ocr_loinc_extraction():
    pipeline = SmartOCRPipeline()
    raw_text = """
    PATIENT LAB REPORT
    HbA1c: 7.8 %
    Fasting Blood Glucose: 145 mg/dL
    eGFR: 48.0 mL/min
    Creatinine: 1.6 mg/dL
    Total Cholesterol: 230 mg/dL
    ALT: 68 U/L
    AST: 45 U/L
    """
    record = pipeline.process_raw_text("test_user_1", raw_text, "lab_report.pdf")
    labs = record.extracted_labs
    lab_dict = {l.canonical_name: l.value for l in labs}

    assert "HbA1c (Glycated Hemoglobin)" in lab_dict or "HbA1c" in str(labs)
    assert any(l.canonical_name == "HbA1c (Glycated Hemoglobin)" and l.value == 7.8 for l in labs)
    assert any(l.canonical_name == "eGFR" and l.value == 48.0 for l in labs)
    assert any(l.canonical_name == "Creatinine" and l.value == 1.6 for l in labs)
    assert any(l.canonical_name == "ALT" and l.value == 68.0 for l in labs)


def test_scenario_builder_loinc_calibration():
    from pathlib import Path
    # Test T2D and Renal Impairment XML generation based on lab values
    clinical_config = {
        "hba1c": 7.8,
        "egfr": 48.0,
        "creatinine": 1.6,
        "resting_hr": 72.0,
        "systolic_bp": 135.0,
        "diastolic_bp": 85.0
    }
    xml_path = build_registration_scenario(
        user_id="test_user_1",
        age=45,
        weight=80.0,
        height=175.0,
        sex="Male",
        body_fat=0.22,
        clinical_config=clinical_config
    )
    xml_content = Path(xml_path).read_text(encoding="utf-8")

    assert "DiabetesType2Data" in xml_content
    assert "ChronicRenalStenosisData" in xml_content
    assert "InsulinResistanceSeverity" in xml_content
    assert "LeftKidneySeverity" in xml_content


@pytest.mark.asyncio
async def test_organ_scores_loinc_integration():
    from biogears_service.api.server import get_organ_scores
    from healthbot_v4.apps.api.server import state_mgr
    from healthbot_v4.shared.models.base import NormalizedLab, NormalizedVital
    from datetime import datetime, timezone

    uid = "test_organ_user"
    state = state_mgr.get_or_create_state(uid)

    # Inject elevated BP vital & labs
    bp_vital = NormalizedVital(
        vital_type="blood_pressure",
        value_primary=145.0, value_secondary=95.0, unit="mmHg",
        timestamp=datetime.now(timezone.utc)
    )
    state.recent_vitals.append(bp_vital)

    labs = [
        NormalizedLab(canonical_name="HbA1c", loinc_code="4548-4", value=8.2, unit="%", timestamp=datetime.now(timezone.utc)),
        NormalizedLab(canonical_name="eGFR", loinc_code="33914-3", value=42.0, unit="mL/min", timestamp=datetime.now(timezone.utc)),
        NormalizedLab(canonical_name="ALT", loinc_code="1742-6", value=85.0, unit="U/L", timestamp=datetime.now(timezone.utc)),
        NormalizedLab(canonical_name="Total Cholesterol", loinc_code="2093-3", value=240.0, unit="mg/dL", timestamp=datetime.now(timezone.utc)),
    ]
    for lab in labs:
        state_mgr.add_lab(uid, lab)

    scores_res = get_organ_scores(uid)
    scores = scores_res["scores"]

    assert scores["metabolic"]["score"] < 90.0
    assert scores["kidneys"]["score"] < 90.0
    assert scores["liver"]["score"] < 90.0
    assert scores["heart"]["score"] < 90.0
