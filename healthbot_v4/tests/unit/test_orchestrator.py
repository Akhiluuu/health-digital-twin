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
