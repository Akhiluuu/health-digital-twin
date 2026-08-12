"""
healthbot_v4/tests/brain/test_patient_persona.py

Comprehensive test suite verifying Patient Persona Engine and personalized AI synthesis.
"""

import pytest
from healthbot_v4.apps.brain.reasoning.patient_persona import (
    PatientPersonaEngine,
    EmotionalSentiment,
    HealthLiteracy,
    PatientPersona,
)
from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategyPlanner
from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
from healthbot_v4.apps.brain.context.context_builder import BudgetedContext
from healthbot_v4.shared.models.base import (
    PatientProfile,
    PatientState,
    NormalizedCondition,
    NormalizedMedication,
    BiologicalSex,
)


def test_sentiment_detection():
    engine = PatientPersonaEngine()

    assert engine.detect_sentiment("I am terrified about my chest pain") == EmotionalSentiment.ANXIOUS
    assert engine.detect_sentiment("What is the best way to hit my HbA1c goal?") == EmotionalSentiment.MOTIVATED
    assert engine.detect_sentiment("I don't understand why my blood pressure is high") == EmotionalSentiment.CONFUSED
    assert engine.detect_sentiment("How much water should I drink?") == EmotionalSentiment.ROUTINE


def test_literacy_detection():
    engine = PatientPersonaEngine()

    assert engine.detect_literacy("Explain my eGFR and troponin levels") == HealthLiteracy.EXPERT
    assert engine.detect_literacy("Explain in simple words like I'm 5") == HealthLiteracy.NOVICE
    assert engine.detect_literacy("What are the side effects of Metformin?") == HealthLiteracy.INTERMEDIATE


def test_persona_building_from_state():
    engine = PatientPersonaEngine()
    profile = PatientProfile(
        patient_id="p_john_doe",
        first_name="John",
        last_name="Doe",
        age=52,
        biological_sex=BiologicalSex.male,
        allergies=["Penicillin"],
    )
    state = PatientState(
        patient_id="p_john_doe",
        profile=profile,
        current_conditions=[NormalizedCondition(condition_name="Type 2 Diabetes")],
        active_medications=[NormalizedMedication(name="Metformin")],
    )

    persona = engine.build_persona(state=state, query="I feel scared about my glucose spike")
    assert persona.first_name == "John"
    assert persona.age == 52
    assert persona.emotional_sentiment == EmotionalSentiment.ANXIOUS
    assert "Type 2 Diabetes" in persona.chronic_conditions
    assert "Metformin" in persona.active_medications


def test_personalized_strategy_planning():
    engine = PatientPersonaEngine()
    planner = ResponseStrategyPlanner()

    profile = PatientProfile(patient_id="p_mary", first_name="Mary", age=68)
    state = PatientState(patient_id="p_mary", profile=profile)

    persona = engine.build_persona(state=state, query="I'm freaked out by this rash")
    strat = planner.plan_strategy("DERMATOLOGY", "I'm freaked out by this rash", persona=persona)

    assert strat.persona is not None
    assert strat.persona.first_name == "Mary"
    assert "Mary" in strat.tone
    assert "Reassuring" in strat.tone


def test_personalized_system_prompt():
    qwen = QwenInferenceEngine()
    qwen.model_loaded = False

    engine = PatientPersonaEngine()
    planner = ResponseStrategyPlanner()

    profile = PatientProfile(patient_id="p_alice", first_name="Alice", age=34)
    state = PatientState(patient_id="p_alice", profile=profile)
    persona = engine.build_persona(state=state, query="Explain simply what is blood pressure")
    strat = planner.plan_strategy("HEALTH_EDUCATION", "Explain simply what is blood pressure", persona=persona)

    ctx = BudgetedContext(
        patient_id="p_alice",
        clinical_snapshot_block="Heart Rate: 72",
        master_summary_block="Profile: Alice",
        active_risks_block="None",
        retrieval_plan_block="Plan",
    )

    prompt = qwen._build_health_system_prompt(ctx, strategy=strat)
    assert "Alice" in prompt
    assert "NOVICE" in prompt
    assert "LITERACY RULE" in prompt


if __name__ == "__main__":
    print("🚀 Running Patient Persona & Personalization Test Suite...")
    test_sentiment_detection()
    print("✅ test_sentiment_detection PASSED")

    test_literacy_detection()
    print("✅ test_literacy_detection PASSED")

    test_persona_building_from_state()
    print("✅ test_persona_building_from_state PASSED")

    test_personalized_strategy_planning()
    print("✅ test_personalized_strategy_planning PASSED")

    test_personalized_system_prompt()
    print("✅ test_personalized_system_prompt PASSED")

    print("\n🎉 ALL PATIENT PERSONA TESTS PASSED SUCCESSFULLY!")
