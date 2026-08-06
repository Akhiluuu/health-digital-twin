"""
healthbot_v4/tests/brain/test_enterprise_scale.py
Automated Pytest Suite for VitalHealth v6.0 Enterprise Scale Extensions.
Verifies Health Knowledge Graph Engine, Multi-Model Router, Feature Store Engine, and Time-Series Ingestion Adapter.
"""

import pytest
import asyncio
from healthbot_v4.apps.patient.models.patient_state import (
    UnifiedPatientState,
    FHIRPatientDemographics,
    FHIRCondition,
    FHIRMedicationRequest,
)
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.brain.reasoning.model_router import MultiModelRouter
from healthbot_v4.apps.brain.analytics.feature_store import FeatureStoreEngine
from healthbot_v4.apps.gateway.timeseries_ingest import TimeSeriesIngestAdapter, VitalsStreamPayload
from healthbot_v4.apps.gateway.event_bus import EventBus, HealthEvent


@pytest.fixture
def scale_patient_state() -> UnifiedPatientState:
    return UnifiedPatientState(
        patient_id="PX-SCALE-01",
        demographics=FHIRPatientDemographics(patient_id="PX-SCALE-01", age=58, gender="male", bmi=27.4),
        conditions=[
            FHIRCondition(condition_id="c1", icd10_code="E11.9", name="Type 2 Diabetes"),
            FHIRCondition(condition_id="c2", icd10_code="I10", name="Hypertension"),
        ],
        active_regimen=[
            FHIRMedicationRequest(medication_id="m1", name="Metformin", dose="1000mg", compliance_rate=0.90),
            FHIRMedicationRequest(medication_id="m2", name="Lisinopril", dose="10mg", compliance_rate=0.95),
        ]
    )


def test_health_knowledge_graph(scale_patient_state):
    kg = HealthKnowledgeGraphEngine()
    subgraph = kg.build_patient_subgraph(scale_patient_state)
    assert subgraph["patient_id"] == "PX-SCALE-01"
    assert len(subgraph["traversal_paths"]) >= 2
    assert any("Type 2 Diabetes" in p for p in subgraph["traversal_paths"])


def test_multi_model_router():
    router = MultiModelRouter()
    # Simple query
    route_simple = router.select_model_route("What is a normal heart rate?")
    assert route_simple["target_model"] == "qwen2.5:14b-fast"

    # Complex multi-condition query
    route_complex = router.select_model_route(
        query="Compare my HbA1c lab history with Metformin dosing and kidney function trajectory",
        intent="LONGITUDINAL_COMPARISON",
        active_conditions_count=3,
        active_medications_count=4
    )
    assert route_complex["target_model"] == "qwen2.5:70b-med"
    assert route_complex["complexity_score"] >= 7


def test_feature_store_engine(scale_patient_state):
    vector = FeatureStoreEngine.compute_feature_vector(scale_patient_state)
    assert vector.patient_id == "PX-SCALE-01"
    assert vector.medication_compliance_rate_30d == 0.925
    assert vector.bmi == 27.4


@pytest.mark.asyncio
async def test_timeseries_ingest_adapter():
    bus = EventBus()
    alerts = []

    async def alert_handler(evt: HealthEvent):
        alerts.append(evt)

    bus.subscribe("VITALS_HR_SPIKE", alert_handler)
    ingest = TimeSeriesIngestAdapter(event_bus=bus)

    payload = VitalsStreamPayload(
        patient_id="PX-SCALE-01",
        metric_type="HEART_RATE",
        value=135.0,
        unit="bpm"
    )

    res = await ingest.ingest_reading(payload)
    assert res["status"] == "ACCEPTED"
    assert res["alert_triggered"] is True
    assert len(alerts) == 1
    assert alerts[0].payload["hr"] == 135.0
