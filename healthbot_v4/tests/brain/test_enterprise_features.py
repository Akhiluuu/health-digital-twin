"""
healthbot_v4/tests/brain/test_enterprise_features.py
Automated Verification Suite for 4 Enterprise Health AI Extensions.
Tests Multimodal Triage, Fact Verification Guard, Multi-Model Router, and Proactive Action Engine.
"""

import pytest
import asyncio
from healthbot_v4.apps.ocr.multimodal_engine import MultimodalTriageEngine
from healthbot_v4.apps.brain.guardrails.fact_verifier import FactVerificationGuard
from healthbot_v4.apps.brain.reasoning.model_router import MultiModelRouter
from healthbot_v4.apps.brain.journey.action_engine import ProactiveActionEngine
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator


@pytest.mark.asyncio
async def test_multimodal_image_triage_lab_report():
    """Verify Multimodal Engine extracts LOINC entities from lab report images."""
    engine = MultimodalTriageEngine()
    await engine.initialize()

    res = engine.process_image_payload("hba1c lab report august 2026", hint_category="LAB_REPORT")

    assert res.document_type == "LAB_REPORT"
    assert len(res.entities_extracted) >= 2
    assert any(e.code == "4548-4" for e in res.entities_extracted)
    assert res.processing_latency_ms < 50.0


@pytest.mark.asyncio
async def test_fact_verification_guard_correction():
    """Verify Fact Verification Guard corrects hallucinated reference claims."""
    guard = FactVerificationGuard()
    await guard.initialize()

    bad_response = "Your test results are fine. Please note that normal HbA1c is 8.0%."
    verified_text, corrected, latency_ms = guard.verify_and_correct_response(bad_response)

    assert corrected is True
    assert "normal HbA1c is below 5.7%" in verified_text
    assert latency_ms < 10.0


@pytest.mark.asyncio
async def test_model_router_complexity_scaling():
    """Verify MultiModelRouter routes complex queries to Qwen 70B Specialist."""
    router = MultiModelRouter()
    await router.initialize()

    query = "Compare my longitudinal HbA1c trends with my Metformin dosage history and physiological twin glucose prediction"
    res = router.select_model_route(query, intent="LONGITUDINAL_COMPARISON", active_conditions_count=3, active_medications_count=2)

    assert res["complexity_score"] >= 7
    assert res["target_model"] == "qwen2.5:70b-med"
    assert res["routing_latency_ms"] < 5.0


@pytest.mark.asyncio
async def test_proactive_action_engine_extraction():
    """Verify Proactive Action Engine extracts structured health tasks."""
    engine = ProactiveActionEngine()
    await engine.initialize()

    resp = "Please log your blood pressure daily and consult your doctor if values exceed 140/90. Take Metformin with meals."
    query = "How do I manage my blood pressure and diabetes?"

    actions = engine.extract_proactive_actions("usr_test_patient", resp, query)

    assert len(actions) >= 2
    categories = [a.category for a in actions]
    assert "VITALS_LOG" in categories
    assert "DOCTOR_APPOINTMENT" in categories or "MEDICATION_ADHERENCE" in categories


@pytest.mark.asyncio
async def test_orchestrator_end_to_end_enterprise_flow():
    """Integration test: AIOrchestrator executing full flow with multimodal input, fact verification, and proactive actions."""
    orchestrator = AIOrchestrator()
    await orchestrator.safety_router.initialize()
    await orchestrator.semantic_cache.initialize()
    await orchestrator.multimodal_engine.initialize()
    await orchestrator.fact_verifier.initialize()
    await orchestrator.model_router.initialize()
    await orchestrator.action_engine.initialize()

    res = await orchestrator.process_patient_query(
        patient_id="usr_enterprise_demo",
        session_id="sess_ent_1",
        query="What does my latest lab report say about my glucose and HbA1c?",
        image_payload="hba1c lab report base64 stream"
    )

    assert res.emergency_triggered is False
    assert res.metadata.get("multimodal_summary") is not None
    assert res.metadata.get("model_route") is not None
    assert "fact_verification" in res.metadata
    assert "proactive_actions" in res.metadata
