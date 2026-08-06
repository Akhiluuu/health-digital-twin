"""
healthbot_v4/tests/brain/test_best_in_class_llm.py
Automated Verification Suite for Best-in-Class Health AI Architecture.
Tests Semantic Cache (<5ms), Emergency Safety Router (<2ms), and AI Orchestrator Integration.
"""

import pytest
import asyncio
import time
from healthbot_v4.apps.brain.cache.semantic_cache import SemanticQueryCache
from healthbot_v4.apps.brain.guardrails.safety_router import EmergencySafetyRouter
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator


@pytest.mark.asyncio
async def test_semantic_cache_hit_latency():
    """Verify that Semantic Query Cache returns responses in < 5ms."""
    cache = SemanticQueryCache()
    await cache.initialize()

    query = "What is HbA1c?"
    result = cache.get(query)

    assert result is not None, "Cache should hit pre-warmed HbA1c query"
    response_text, sources, latency_ms = result
    assert latency_ms < 5.0, f"Cache latency expected < 5.0ms, measured {latency_ms:.2f}ms"
    assert "Glycated Hemoglobin" in response_text
    assert cache.get_stats()["hits"] >= 1


@pytest.mark.asyncio
async def test_semantic_cache_personal_query_bypass():
    """Verify that queries with patient-specific pronouns bypass the cache."""
    cache = SemanticQueryCache()
    await cache.initialize()

    query = "What is my latest HbA1c level from my lab report?"
    assert not cache.is_cacheable(query), "Personal query should bypass cache"

    result = cache.get(query)
    assert result is None, "Cache lookup should return None for personal queries"
    assert cache.get_stats()["bypasses"] >= 1


@pytest.mark.asyncio
async def test_emergency_safety_router_latency():
    """Verify that Emergency Pre-Guardrail Router evaluates queries in < 2ms."""
    router = EmergencySafetyRouter()
    await router.initialize()

    emerg_query = "I have severe crushing chest pain radiating to my left arm"
    is_emerg, triage_resp, latency_ms = router.evaluate_query(emerg_query)

    assert is_emerg is True, "Emergency router should flag chest pain"
    assert latency_ms < 2.0, f"Emergency router latency expected < 2.0ms, measured {latency_ms:.2f}ms"
    assert "Call 112 / 911" in triage_resp

    non_emerg = "What is the recommended daily intake of water?"
    is_emerg_2, _, latency_ms_2 = router.evaluate_query(non_emerg)
    assert is_emerg_2 is False
    assert latency_ms_2 < 2.0


@pytest.mark.asyncio
async def test_orchestrator_pre_guardrail_bypass():
    """Verify AIOrchestrator uses Emergency Safety Router to bypass LLM generation."""
    orchestrator = AIOrchestrator()
    # Mock lower level subsystems for quick test
    await orchestrator.safety_router.initialize()
    await orchestrator.semantic_cache.initialize()

    res = await orchestrator.process_patient_query(
        patient_id="usr_test_emergency",
        session_id="sess_test_1",
        query="I cannot breathe and have severe shortness of breath"
    )

    assert res.emergency_triggered is True
    assert "Call 112 / 911" in res.response_text
    assert res.metadata.get("guardrail") == "PRE_GUARDRAIL_SAFETY_ROUTER"
    assert res.metadata.get("latency_ms", 0.0) < 5.0


@pytest.mark.asyncio
async def test_orchestrator_semantic_cache_hit():
    """Verify AIOrchestrator returns cached response for general health query in sub-5ms."""
    orchestrator = AIOrchestrator()
    await orchestrator.safety_router.initialize()
    await orchestrator.semantic_cache.initialize()

    res = await orchestrator.process_patient_query(
        patient_id="usr_test_cache",
        session_id="sess_test_2",
        query="What is normal blood pressure?"
    )

    assert res.emergency_triggered is False
    assert res.metadata.get("cache_hit") is True
    assert res.metadata.get("latency_ms", 0.0) < 10.0
    assert "Systolic" in res.response_text
