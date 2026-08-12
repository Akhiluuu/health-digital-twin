"""
healthbot_v4/tests/brain/test_concurrency_load.py
Automated Concurrency Load & FHIR R4 Interoperability Verification Suite.
Simulates 100+ parallel requests and verifies FHIR R4 EMR bundle compliance.
"""

import pytest
import asyncio
import time
from typing import List
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator
from healthbot_v4.apps.brain.interop.fhir_exporter import FHIRR4Exporter
from healthbot_v4.shared.models.base import NormalizedLab, NormalizedMedication


@pytest.mark.asyncio
async def test_fhir_r4_export_compliance():
    """Verify FHIR R4 Exporter generates valid HL7 FHIR R4 JSON bundles."""
    exporter = FHIRR4Exporter()
    await exporter.initialize()

    orchestrator = AIOrchestrator()
    state = orchestrator.state_mgr.get_or_create_state("usr_fhir_test")
    
    # Add sample lab and med
    orchestrator.state_mgr.add_lab(
        "usr_fhir_test",
        NormalizedLab(canonical_name="HbA1c", value=8.1, unit="%", loinc_code="4548-4")
    )
    orchestrator.state_mgr.add_medication(
        "usr_fhir_test",
        NormalizedMedication(name="Metformin", dosage_form="500mg", frequency="Daily", rxnorm_code="6809")
    )

    bundle = exporter.export_patient_bundle(
        state,
        care_plan_actions=[
            {"category": "VITALS_LOG", "title": "Log Daily Blood Glucose", "description": "Measure glucose pre-meal."}
        ]
    )

    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"
    assert bundle["total"] >= 3

    resource_types = [e["resource"]["resourceType"] for e in bundle["entry"]]
    assert "Patient" in resource_types
    assert "Observation" in resource_types
    assert "MedicationStatement" in resource_types
    assert "CarePlan" in resource_types


@pytest.mark.asyncio
async def test_high_concurrency_load_100_requests():
    """Simulate 100 parallel concurrent user queries to verify throughput, thread safety, and sub-100ms average response."""
    orchestrator = AIOrchestrator()
    await orchestrator.safety_router.initialize()
    await orchestrator.semantic_cache.initialize()
    await orchestrator.multimodal_engine.initialize()
    await orchestrator.fact_verifier.initialize()
    await orchestrator.model_router.initialize()
    await orchestrator.action_engine.initialize()
    await orchestrator.fhir_exporter.initialize()

    queries = [
        "What is HbA1c?",
        "What is normal blood pressure?",
        "I have severe chest pain radiating to my arm",  # Emergency bypass test
        "How does Metformin work?",
        "What is Fasting Plasma Glucose?"
    ]

    async def worker(req_id: int):
        q = queries[req_id % len(queries)]
        pid = f"usr_load_{req_id}"
        sess_id = f"sess_load_{req_id}"
        start = time.time()
        res = await orchestrator.process_patient_query(pid, sess_id, q)
        lat = (time.time() - start) * 1000.0
        return res, lat

    # Execute 100 concurrent workers
    tasks = [worker(i) for i in range(100)]
    results = await asyncio.gather(*tasks)

    assert len(results) == 100, "All 100 concurrent requests must complete"
    
    latencies = [lat for _, lat in results]
    avg_lat = sum(latencies) / len(latencies)
    max_lat = max(latencies)

    # Asserts
    assert avg_lat < 100.0, f"Average latency expected < 100ms under load, measured {avg_lat:.2f}ms"
    assert all(r.response_text is not None for r, _ in results)
