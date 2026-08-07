"""
healthbot_v4/tests/brain/test_extreme_cases.py

Comprehensive test suite verifying extreme clinical case handling (Item 2, Item 3, Item 4, Item 6).
"""

import pytest
from healthbot_v4.apps.brain.reasoning.patient_persona import (
    PatientPersonaEngine,
    AgeCohort,
    PolypharmacyRiskLevel,
)
from healthbot_v4.apps.brain.reasoning.response_strategy import (
    ResponseStrategyPlanner,
    StrategyMode,
    UIModality,
    VerbosityBudget,
)
from healthbot_v4.apps.brain.reasoning.followup_generator import FollowUpGenerator
from healthbot_v4.shared.models.base import (
    PatientProfile,
    PatientState,
    NormalizedVital,
    NormalizedMedication,
    NormalizedCondition,
)


def test_hyper_acute_vitals_detection():
    engine = PatientPersonaEngine()
    planner = ResponseStrategyPlanner()

    profile = PatientProfile(patient_id="p_critical", first_name="Robert", age=62)
    # Simulate extreme hypertensive crisis: Systolic BP 195
    vitals = [NormalizedVital(vital_type="blood_pressure", value_primary=195.0, value_secondary=125.0)]
    state = PatientState(patient_id="p_critical", profile=profile, recent_vitals=vitals)

    persona = engine.build_persona(state=state, query="How do I feel right now?")
    assert persona.is_hyper_acute_vitals is True
    assert any("Hypertensive Crisis" in d for d in persona.hyper_acute_details)

    strat = planner.plan_strategy("GENERAL_HEALTH", "How do I feel right now?", persona=persona)
    assert strat.mode == StrategyMode.URGENT_TRIAGE
    assert strat.ui_modality == UIModality.CRITICAL_ALERT
    assert strat.requires_alert_banner is True


def test_polypharmacy_risk_audit():
    engine = PatientPersonaEngine()
    planner = ResponseStrategyPlanner()

    profile = PatientProfile(patient_id="p_poly", first_name="Eleanor", age=74)
    meds = [
        NormalizedMedication(name="Warfarin"),
        NormalizedMedication(name="Aspirin"),
        NormalizedMedication(name="Lisinopril"),
        NormalizedMedication(name="Metformin"),
        NormalizedMedication(name="Atorvastatin"),
    ]
    state = PatientState(patient_id="p_poly", profile=profile, active_medications=meds)

    persona = engine.build_persona(state=state, query="Can I take ibuprofen?")
    assert persona.polypharmacy_risk == PolypharmacyRiskLevel.HIGH

    strat = planner.plan_strategy("MEDICATION", "Can I take ibuprofen?", persona=persona)
    assert "Polypharmacy" in strat.tone


def test_geriatric_and_pediatric_cohorts():
    engine = PatientPersonaEngine()
    planner = ResponseStrategyPlanner()

    # Geriatric patient (Age 78)
    g_profile = PatientProfile(patient_id="p_elderly", first_name="Arthur", age=78)
    g_state = PatientState(patient_id="p_elderly", profile=g_profile)
    g_persona = engine.build_persona(state=g_state, query="What are my vitamin options?")
    assert g_persona.age_cohort == AgeCohort.GERIATRIC

    g_strat = planner.plan_strategy("NUTRITION", "What are my vitamin options?", persona=g_persona)
    assert g_strat.verbosity == VerbosityBudget.COMPACT

    # Pediatric caregiver query
    p_profile = PatientProfile(patient_id="p_mom", first_name="Sarah", age=32)
    p_state = PatientState(patient_id="p_mom", profile=p_profile)
    p_persona = engine.build_persona(state=p_state, query="My baby has a fever of 101F")
    assert p_persona.pediatric_caregiver is True

    p_strat = planner.plan_strategy("PEDIATRIC", "My baby has a fever of 101F", persona=p_persona)
    assert "Caregiver" in p_strat.tone


def test_personalized_followup_generation():
    engine = PatientPersonaEngine()
    gen = FollowUpGenerator()

    # 1. Polypharmacy follow-up
    profile = PatientProfile(patient_id="p_poly2", first_name="Charles", age=70)
    meds = [
        NormalizedMedication(name="Metformin"),
        NormalizedMedication(name="Lisinopril"),
        NormalizedMedication(name="Atorvastatin"),
        NormalizedMedication(name="Omeprazole"),
    ]
    state = PatientState(patient_id="p_poly2", profile=profile, active_medications=meds)
    persona = engine.build_persona(state=state, query="Check my meds")

    res = gen.generate_followups("MEDICATION", "Check my meds", persona=persona)
    follow_ups = res["followUps"]
    assert len(follow_ups) > 0
    assert any("interaction check" in f.lower() for f in follow_ups)

    # 2. Chronic condition follow-up
    profile2 = PatientProfile(patient_id="p_diabetic", first_name="David", age=45)
    state2 = PatientState(
        patient_id="p_diabetic",
        profile=profile2,
        current_conditions=[NormalizedCondition(condition_name="Type 2 Diabetes")],
    )
    persona2 = engine.build_persona(state=state2, query="What should I eat for dinner?")

    res2 = gen.generate_followups("NUTRITION", "What should I eat for dinner?", persona=persona2)
    assert any("Type 2 Diabetes" in f for f in res2["followUps"])


if __name__ == "__main__":
    print("🚀 Running Extreme Case Test Suite...")
    test_hyper_acute_vitals_detection()
    print("✅ test_hyper_acute_vitals_detection PASSED")

    test_polypharmacy_risk_audit()
    print("✅ test_polypharmacy_risk_audit PASSED")

    test_geriatric_and_pediatric_cohorts()
    print("✅ test_geriatric_and_pediatric_cohorts PASSED")

    test_personalized_followup_generation()
    print("✅ test_personalized_followup_generation PASSED")

    print("\n🎉 ALL EXTREME CASE TESTS PASSED SUCCESSFULLY!")
