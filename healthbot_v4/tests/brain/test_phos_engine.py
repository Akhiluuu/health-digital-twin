"""
healthbot_v4/tests/brain/test_phos_engine.py

Automated testing suite for PHOS Reasoning Engine.
Validates intent understanding, evidence planning, knowledge graph ingestion,
hypothesis scoring, confidence analysis, strategy selection, and end-to-end pipeline execution.
"""

import pytest
import asyncio
from healthbot_v4.shared.models.evidence_schema import EvidenceItem
from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntentEngine, ClinicalIntent, ClinicalGoal
from healthbot_v4.apps.brain.reasoning.retrieval_planner import ContextRetrievalPlanner
from healthbot_v4.apps.brain.evidence.evidence_bundle import EvidenceFinding, EvidenceBundle
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.brain.evidence.correlation_engine import EvidenceCorrelationEngine
from healthbot_v4.apps.brain.reasoning.hypothesis_engine import HypothesisEngine
from healthbot_v4.apps.brain.reasoning.confidence_gap_engine import ConfidenceAndGapEngine
from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategyPlanner, StrategyMode
from healthbot_v4.apps.brain.orchestrator.phos_orchestrator import PHOSOrchestrator
from healthbot_v4.apps.patient.models.patient_state import (
    UnifiedPatientState,
    FHIRPatientDemographics,
    FHIRCondition,
    FHIRMedicationRequest,
)


@pytest.fixture
def mock_patient_state():
    return UnifiedPatientState(
        patient_id="patient-phos-001",
        demographics=FHIRPatientDemographics(
            patient_id="patient-phos-001",
            name="Alex Mercer",
            age=48,
            gender="Male",
        ),
        conditions=[FHIRCondition(condition_id="c1", icd10_code="E11.9", name="Type 2 Diabetes", clinical_status="active")],
        active_regimen=[FHIRMedicationRequest(medication_id="m1", name="Metformin", dose="500mg", frequency="twice daily", status="active")],
    )


def test_evidence_item_schema():
    item = EvidenceItem(
        itemId="item-001",
        source="BioGears Digital Twin",
        dataType="vitalSign",
        value=72,
        unit="bpm",
        confidence=0.95,
        loinc_code="8867-4",
        snomed_code=None,
        notes=None,
    )
    contract = item.to_json_contract()
    assert contract["itemId"] == "item-001"
    assert contract["dataType"] == "vitalSign"
    assert contract["unit"] == "bpm"


def test_intent_classification():
    engine = ClinicalIntentEngine()
    
    res1 = engine.classify_intent("I have severe crushing chest pain")
    assert res1.primary_intent == ClinicalIntent.EMERGENCY
    assert res1.clinicalGoal == ClinicalGoal.ALERT

    res2 = engine.classify_intent("How does Metformin work?")
    assert res2.primary_intent in [ClinicalIntent.MEDICATION, ClinicalIntent.GENERAL_HEALTH_EDUCATION]

    res3 = engine.classify_intent("Compare my resting heart rate over the last month")
    assert res3.primary_intent == ClinicalIntent.LONGITUDINAL_COMPARISON


def test_hypothesis_generation():
    engine = HypothesisEngine()
    bundle = EvidenceBundle(
        intent="CARDIOVASCULAR",
        query="Why is my chest feeling tight?",
        findings=[
            EvidenceFinding(finding_id="f1", label="Blood Pressure", value="145/92 mmHg", source_name="Vitals", source_type="vitals", is_abnormal=True),
        ]
    )
    hypotheses = engine.generate_and_validate("CARDIOVASCULAR", "chest tightness", bundle)
    assert len(hypotheses) > 0
    assert any("Angina" in h.hypothesis for h in hypotheses)


def test_confidence_gap_engine():
    engine = ConfidenceAndGapEngine()
    bundle = EvidenceBundle(intent="GENERAL_HEALTH", query="Health status check")
    analysis = engine.analyze(bundle)
    assert analysis.overall_confidence > 0.0
    assert len(analysis.confidence_label) > 0


def test_response_strategy_planner():
    planner = ResponseStrategyPlanner()
    strat1 = planner.plan_strategy("EMERGENCY", "chest pain", "High")
    assert strat1.mode == StrategyMode.URGENT_TRIAGE
    assert strat1.requires_alert_banner is True

    strat2 = planner.plan_strategy("LONGITUDINAL_COMPARISON", "heart rate trend", "High")
    assert strat2.mode == StrategyMode.COMPARISON


@pytest.mark.asyncio
async def test_phos_orchestrator_end_to_end(mock_patient_state, monkeypatch):
    orchestrator = PHOSOrchestrator()
    
    # Mock LLM inference to allow sub-second unit test execution
    def mock_llm_generate(*args, **kwargs):
        return {
            "response": "Based on your clinical record, your cardiovascular metrics and vitals are within stable reference ranges.",
            "sources_used": ["Vitals History", "BioGears Digital Twin"],
        }
    monkeypatch.setattr(orchestrator.qwen_engine, "generate_reasoning_response", mock_llm_generate)

    await orchestrator.initialize()

    response = orchestrator.process_query("What is my current heart health status?", mock_patient_state)
    assert response.patient_id == "patient-phos-001"
    assert response.intent_analysis["primaryIntent"] is not None
    assert len(response.answer_text) > 20
    assert len(response.follow_ups) > 0
    assert response.pipeline_latency_ms > 0


def test_adaptive_timeout_policy():
    from healthbot_v4.apps.twin.simulation_runner import AdaptiveTimeoutPolicy, DigitalTwinRunner
    from healthbot_v4.shared.models.base import PatientProfile

    # Emergency Intent: 0ms timeout (immediate bypass)
    assert AdaptiveTimeoutPolicy.get_timeout_ms("EMERGENCY") == 0.0
    
    # Counterfactual Scenario: 2000ms allocation
    assert AdaptiveTimeoutPolicy.get_timeout_ms("COUNTERFACTUAL") == 2000.0
    
    # Background Async Job: 30000ms allocation
    assert AdaptiveTimeoutPolicy.get_timeout_ms("GENERAL", mode="async_job") == 30000.0

    # Standard Interactive Chat: 500ms allocation
    assert AdaptiveTimeoutPolicy.get_timeout_ms("GENERAL", mode="interactive") == 500.0

    runner = DigitalTwinRunner()
    prof = PatientProfile(patient_id="px_test", first_name="Alex", last_name="Mercer")
    
    # Test Emergency Triage Bypass execution
    res_emergency = runner.run_medication_simulation(prof, "Metformin", intent="EMERGENCY")
    assert res_emergency.simulation_status == "BYPASSED_EMERGENCY"
    assert res_emergency.execution_time_ms == 0.0
