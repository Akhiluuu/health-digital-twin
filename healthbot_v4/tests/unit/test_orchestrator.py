"""
healthbot_v4/tests/unit/test_orchestrator.py
Unit tests for AI Orchestrator pipeline and safety guardrails.
"""

import pytest
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator


@pytest.mark.asyncio
async def test_orchestrator_normal_query():
    orchestrator = AIOrchestrator()
    await orchestrator.initialize()

    res = await orchestrator.process_patient_query(
        patient_id="usr_orch_1",
        session_id="sess_orch_1",
        query="How is my health score today?",
    )

    assert res.patient_id == "usr_orch_1"
    assert res.emergency_triggered is False
    assert "health score" in res.response_text.lower()
    assert "disclaimer" in res.model_dump()


@pytest.mark.asyncio
async def test_orchestrator_emergency_query():
    orchestrator = AIOrchestrator()
    await orchestrator.initialize()

    res = await orchestrator.process_patient_query(
        patient_id="usr_orch_2",
        session_id="sess_orch_2",
        query="I have severe chest pain and cannot breathe!",
    )

    assert res.patient_id == "usr_orch_2"
    assert res.emergency_triggered is True
    assert "EMERGENCY WARNING" in res.response_text
    assert res.confidence_score == 1.0


@pytest.mark.asyncio
async def test_orchestrator_sanitization_and_medications():
    orchestrator = AIOrchestrator()
    await orchestrator.initialize()

    patient_ctx = {
        "medicines": [
            {"name": "Metformin", "dose": "500mg", "frequency": "daily", "type": "Tablet"},
            {"name": "Lisinopril", "dose": "10mg", "frequency": "daily", "type": "Tablet"}
        ],
        "vitals": {
            "heart_rate": 88,
            "systolic_bp": 128,
            "diastolic_bp": 82
        },
        "activeSymptoms": ["User Query Processed (Explain my symptoms)", "Headache"]
    }

    res = await orchestrator.process_patient_query(
        patient_id="usr_test_meds",
        session_id="sess_meds",
        query="Check my medications",
        patient_context=patient_ctx
    )

    # 1. Ensure User Query Processed artifacts are stripped
    assert "User Query Processed" not in res.response_text
    # 2. Ensure active medications are listed
    assert "Metformin" in res.response_text or "Lisinopril" in res.response_text
    assert "No active medications" not in res.response_text


@pytest.mark.asyncio
async def test_orchestrator_live_telemetry_vitals():
    orchestrator = AIOrchestrator()
    await orchestrator.initialize()

    patient_ctx = {
        "sim_vitals": {
            "heart_rate": 94,
            "systolic_bp": 132,
            "diastolic_bp": 86
        }
    }

    res = await orchestrator.process_patient_query(
        patient_id="usr_test_vitals",
        session_id="sess_vitals",
        query="How's my heart health?",
        patient_context=patient_ctx
    )

    # Ensure live telemetry vitals (94 bpm) are reflected in output instead of hardcoded 72 bpm
    assert "94 bpm" in res.response_text
    assert "User Query Processed" not in res.response_text

