"""
healthbot_v4/tests/brain/test_enterprise_v6_architecture.py
Automated Pytest Suite for VitalHealth v6.0 Enterprise Architecture.
Verifies FHIR Patient State, Semantic Compressor, Event Bus, Tool Registry, Counterfactual Scenario Engine, Confidence Calculator, and Explainability Audit.
"""

import pytest
import asyncio
from datetime import datetime, timezone
from healthbot_v4.apps.patient.models.patient_state import (
    UnifiedPatientState,
    FHIRPatientDemographics,
    FHIRCondition,
    FHIRMedicationRequest,
    FHIRObservationLab,
    FHIRAllergyIntolerance,
)
from healthbot_v4.apps.brain.context.semantic_compressor import SemanticContextCompressor
from healthbot_v4.apps.gateway.event_bus import EventBus, HealthEvent
from healthbot_v4.apps.brain.tools.registry import VitalHealthToolRegistry
from healthbot_v4.apps.brain.reasoning.biogears_scenario_engine import BioGearsScenarioEngine
from healthbot_v4.apps.brain.safety.confidence_calculator import ConfidenceCalculator
from healthbot_v4.apps.brain.safety.explainability import ExplainabilityAuditEngine


@pytest.fixture
def sample_patient_state() -> UnifiedPatientState:
    return UnifiedPatientState(
        patient_id="PX-99214",
        demographics=FHIRPatientDemographics(patient_id="PX-99214", name="Elena Rostova", age=54, gender="female", blood_type="A+"),
        conditions=[
            FHIRCondition(condition_id="c1", icd10_code="E11.9", name="Type 2 Diabetes"),
            FHIRCondition(condition_id="c2", icd10_code="N18.3", name="Chronic Kidney Disease Stage 3a"),
        ],
        active_regimen=[
            FHIRMedicationRequest(medication_id="m1", name="Metformin", dose="1000mg", frequency="BID"),
            FHIRMedicationRequest(medication_id="m2", name="Apixaban", dose="5mg", frequency="BID"),
        ],
        lab_trends=[
            FHIRObservationLab(lab_id="l1", biomarker_name="HbA1c", value=7.4, unit="%", reference_range="4.0-5.6%", status="ELEVATED", trend="IMPROVING"),
        ],
        allergies=[
            FHIRAllergyIntolerance(allergy_id="a1", substance="Penicillin", reaction="Anaphylaxis"),
        ]
    )


def test_fhir_patient_state(sample_patient_state):
    state = sample_patient_state
    assert state.get_condition_names() == ["Type 2 Diabetes", "Chronic Kidney Disease Stage 3a"]
    assert state.has_condition("Diabetes") is True
    assert state.has_condition("Hypertension") is False
    assert state.has_allergy("Penicillin") is True
    assert len(state.get_active_medication_names()) == 2


def test_semantic_compressor(sample_patient_state):
    compressed = SemanticContextCompressor.compress(sample_patient_state, intent="MEDICATION")
    assert "PATIENT [PX-99214]" in compressed
    assert "Type 2 Diabetes" in compressed
    assert "Metformin 1000mg" in compressed
    assert "Penicillin" in compressed


@pytest.mark.asyncio
async def test_event_bus():
    bus = EventBus()
    received_events = []

    async def mock_handler(evt: HealthEvent):
        received_events.append(evt)

    bus.subscribe("VITALS_HR_SPIKE", mock_handler)
    test_evt = HealthEvent(patient_id="PX-99214", event_type="VITALS_HR_SPIKE", payload={"hr": 132})
    
    await bus.publish(test_evt)
    assert len(received_events) == 1
    assert received_events[0].payload["hr"] == 132


def test_tool_registry_drug_interactions(sample_patient_state):
    # Test NSAID + CKD/Anticoagulant contraindication tool
    result = VitalHealthToolRegistry.check_drug_interactions(sample_patient_state, "Ibuprofen 400mg")
    assert result.success is True
    assert result.result_data["has_interactions"] is True
    severities = [i["severity"] for i in result.result_data["interactions"]]
    assert "HIGH_CONTRAINDICATION" in severities or "HIGH_BLEEDING_RISK" in severities


def test_tool_registry_ascvd_risk(sample_patient_state):
    result = VitalHealthToolRegistry.calculate_ascvd_risk(sample_patient_state)
    assert result.success is True
    assert "ascvd_10yr_risk_percent" in result.result_data


def test_biogears_scenario_engine(sample_patient_state):
    query = "What happens if I stop taking Metformin?"
    sim_res = BioGearsScenarioEngine.run_counterfactual_scenario(sample_patient_state, query)
    assert sim_res is not None
    assert "BioGears 90-Day Metabolic Scenario" in sim_res.scenario_title
    assert sim_res.delta_summary["HbA1c_increase"] == "+0.9%"


def test_confidence_calculator(sample_patient_state):
    breakdown = ConfidenceCalculator.calculate(sample_patient_state)
    assert breakdown.composite_score >= 0.80
    assert breakdown.tier in ["HIGH", "MODERATE"]


def test_explainability_audit(sample_patient_state):
    breakdown = ConfidenceCalculator.calculate(sample_patient_state)
    cert = ExplainabilityAuditEngine.generate_certificate(
        patient_id=sample_patient_state.patient_id,
        intent="MEDICATION",
        query="Can I take Ibuprofen?",
        summary="NSAID contraindicated due to active CKD.",
        evidence_sources=["ADA_2026", "BioGears_Sim"],
        confidence=breakdown,
        clinical_reasons=["CKD Stage 3a present in FHIR state"]
    )
    assert cert.audit_id.startswith("aud-")
    assert cert.patient_id == "PX-99214"
    assert cert.safety_guardrails_passed is True
