"""
healthbot_v4/tests/brain/test_llm_upgrades.py
Comprehensive test suite verifying VitalHealth v5.0 LLM Architectural Upgrades.
"""

import pytest
import asyncio
from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
from healthbot_v4.apps.brain.reasoning.llm_router import LLMRouter, ModelTier
from healthbot_v4.apps.brain.reasoning.clinical_tools import ClinicalToolsRegistry
from healthbot_v4.apps.rag.engine.hybrid_retriever import HybridRAGEngine
from healthbot_v4.apps.brain.evaluation.semantic_cache import SemanticResponseCache
from healthbot_v4.apps.brain.context.context_builder import BudgetedContext


@pytest.mark.asyncio
async def test_qwen_engine_stream_and_context():
    engine = QwenInferenceEngine()
    engine.model_loaded = False
    ctx = BudgetedContext(
        patient_id="p_test_101",
        clinical_snapshot_block="Heart Rate: 72 bpm",
        master_summary_block="Master patient summary: healthy male",
        active_risks_block="ACTIVE CLINICAL RISKS: None",
        retrieval_plan_block="CLINICAL RETRIEVAL PLAN: Vitals"
    )
    
    # Test Response Generation
    res = engine.generate_reasoning_response(ctx, "How is my heart health?")
    assert res is not None
    assert "response" in res
    assert res["patient_id"] == "p_test_101"

    # Test Async Stream Generator
    streamed_tokens = []
    async for token in engine.generate_reasoning_stream(ctx, "How is my heart rate?"):
        streamed_tokens.append(token)
    
    assert len(streamed_tokens) > 0
    full_text = "".join(streamed_tokens)
    assert "Heart Rate" in full_text or "heart" in full_text.lower() or "Health" in full_text


def test_llm_router_tiers():
    router = LLMRouter()
    
    # Simple query should route to Tier 1
    d1 = router.route_query("Hello, how are you?")
    assert d1.target_tier == ModelTier.TIER_1_FAST

    # Complex clinical query should route to Tier 2
    d2 = router.route_query("Can I take Ibuprofen with Lisinopril for my Stage 3 CKD?")
    assert d2.target_tier == ModelTier.TIER_2_DEEP_CLINICAL
    assert d2.requires_drug_check is True


@pytest.mark.asyncio
async def test_clinical_tools_registry():
    registry = ClinicalToolsRegistry()
    schemas = registry.get_tool_schemas()
    assert len(schemas) >= 2

    # Test Drug Interaction Tool
    res_drug = await registry.execute_tool("check_drug_interactions", {"medications": ["Ibuprofen", "Lisinopril"]})
    assert res_drug["success"] is True
    assert res_drug["result"]["interaction_count"] > 0

    # Test BioGears Sim Tool
    res_sim = await registry.execute_tool("run_biogears_simulation", {"patient_id": "p_99", "action_name": "exercise"})
    assert res_sim["success"] is True
    assert res_sim["result"]["heart_rate_bpm"] == 72.0


def test_hybrid_rag_retrieval():
    rag = HybridRAGEngine()
    docs = rag.hybrid_retrieve("What is the HbA1c target for diabetes?", top_k=2)
    assert len(docs) > 0
    assert "ADA" in docs[0].source_document or "HbA1c" in docs[0].content


def test_semantic_cache():
    cache = SemanticResponseCache(similarity_threshold=0.8)
    cache.put("What is my heart rate?", "p_100", "Your heart rate is 72 bpm.", ["Vitals"])

    hit = cache.get("What is my heart rate?", "p_100")
    assert hit is not None
    assert "72 bpm" in hit.response_text

    miss = cache.get("Tell me about renal failure", "p_100")
    assert miss is None


def test_phi_sanitizer_hipaa():
    from healthbot_v4.apps.brain.security.phi_sanitizer import phi_sanitizer
    raw_text = "Patient John Doe with SSN 123-45-6789 and email john@example.com asked about symptoms."
    cleaned = phi_sanitizer.sanitize_text(raw_text, patient_name="John Doe")
    assert "[REDACTED_SSN]" in cleaned
    assert "[REDACTED_EMAIL]" in cleaned
    assert "[PATIENT]" in cleaned
    assert "John" not in cleaned


def test_dynamic_response_strategy_7_layers():
    from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategyPlanner, QueryComplexity, VerbosityBudget, UIModality
    planner = ResponseStrategyPlanner()

    # 1. Chit-chat micro query
    s_chat = planner.plan_strategy("GENERAL_CONVERSATION", "Hello! How are you?")
    assert s_chat.formatting_schema == "CHIT_CHAT"
    assert s_chat.complexity == QueryComplexity.MICRO_CHAT
    assert s_chat.verbosity == VerbosityBudget.MICRO

    # 2. Medication query
    s_med = planner.plan_strategy("MEDICATION", "How should I take Metformin 500mg?")
    assert s_med.formatting_schema == "PHARMACOLOGY_SAFETY"
    assert s_med.temperature == 0.28

    # 3. Emergency query
    s_emerg = planner.plan_strategy("EMERGENCY", "I have severe chest pain and left arm numbness")
    assert s_emerg.formatting_schema == "EMERGENCY_TRIAGE"
    assert s_emerg.requires_alert_banner is True

    # 4. Mental health query
    s_mental = planner.plan_strategy("MENTAL_HEALTH", "I feel overwhelmed and stressed")
    assert s_mental.formatting_schema == "MENTAL_HEALTH_WELLBEING"
    assert s_mental.temperature == 0.65

    # 5. Lab report audit
    s_lab = planner.plan_strategy("LAB_REPORT", "Explain my HbA1c and glucose results")
    assert s_lab.formatting_schema == "LAB_REPORT_ANALYSIS"
    assert s_lab.complexity == QueryComplexity.DEEP_CLINICAL_AUDIT


@pytest.mark.asyncio
async def test_qwen_engine_adaptive_formatting():
    from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategyPlanner
    engine = QwenInferenceEngine()
    engine.model_loaded = False
    ctx = BudgetedContext(
        patient_id="p_test_dyn",
        clinical_snapshot_block="Heart Rate: 70 bpm",
        master_summary_block="Healthy male profile",
        active_risks_block="None",
        retrieval_plan_block="Plan",
    )
    planner = ResponseStrategyPlanner()

    # Test Chit-Chat fallback
    strat_chat = planner.plan_strategy("GENERAL_CONVERSATION", "Hi")
    res_chat = engine.generate_reasoning_response(ctx, "Hi", intent="GENERAL_CONVERSATION", strategy=strat_chat)
    assert "Executive Summary" not in res_chat["response"]
    assert "VitalHealth AI" in res_chat["response"] or "Hello" in res_chat["response"]

    # Test Emergency fallback
    strat_emerg = planner.plan_strategy("EMERGENCY", "chest pain")
    res_emerg = engine.generate_reasoning_response(ctx, "chest pain", intent="EMERGENCY", strategy=strat_emerg)
    assert "🚨 **EMERGENCY WARNING" in res_emerg["response"]


if __name__ == "__main__":
    print("🚀 Running LLM Architectural Upgrades Verification Suite...")
    asyncio.run(test_qwen_engine_stream_and_context())
    print("✅ test_qwen_engine_stream_and_context PASSED")
    
    test_llm_router_tiers()
    print("✅ test_llm_router_tiers PASSED")

    test_dynamic_response_strategy_7_layers()
    print("✅ test_dynamic_response_strategy_7_layers PASSED")

    asyncio.run(test_qwen_engine_adaptive_formatting())
    print("✅ test_qwen_engine_adaptive_formatting PASSED")
    
    asyncio.run(test_clinical_tools_registry())
    print("✅ test_clinical_tools_registry PASSED")
    
    test_hybrid_rag_retrieval()
    print("✅ test_hybrid_rag_retrieval PASSED")
    
    test_semantic_cache()
    print("✅ test_semantic_cache PASSED")

    test_phi_sanitizer_hipaa()
    print("✅ test_phi_sanitizer_hipaa PASSED")
    
    print("\n🎉 ALL LLM UPGRADE SUITE TESTS PASSED SUCCESSFULLY!")


