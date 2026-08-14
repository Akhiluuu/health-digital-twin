"""
Integration test suite for Medical Reports, OCR, and LLM Pipeline.
Verifies PDF/Image text extraction, LOINC/RxNorm entity parsing,
PatientStateManager ingestion, and AIOrchestrator LLM context injection.
"""

import pytest
import asyncio
from unittest.mock import MagicMock
from healthbot_v4.apps.api.server import _extract_text_from_bytes, _chunk_text, _generate_hash_embedding
from healthbot_v4.apps.ocr.engine.record_builder import SmartOCRPipeline
from healthbot_v4.apps.ocr.multimodal_engine import MultimodalTriageEngine
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator


def test_text_extraction_from_bytes():
    sample_text = "PATIENT REPORT\nDr. Smith\nHbA1c: 7.8%\nFasting Blood Glucose: 135 mg/dL\nMetformin 500mg daily"
    extracted = _extract_text_from_bytes(sample_text.encode("utf-8"), "report.txt", "text/plain")
    assert "HbA1c" in extracted
    assert "Metformin" in extracted


def test_smart_ocr_pipeline_parsing():
    pipeline = SmartOCRPipeline()
    sample_report = (
        "CLINICAL LABORATORY REPORT\n"
        "Physician: Dr. Sarah Jenkins\n"
        "HbA1c: 8.4 %\n"
        "Serum Creatinine: 1.5 mg/dL\n"
        "Total Cholesterol: 215 mg/dL\n"
        "TSH: 5.2 mIU/L\n"
        "Rx: Metformin 1000mg twice daily\n"
        "Rx: Lisinopril 10mg daily\n"
    )
    record = pipeline.process_raw_text(patient_id="usr_test_ocr", raw_text=sample_report, document_name="lab_results.pdf")

    assert record.processing_status == "COMPLETED"
    assert record.doctor_name == "Sarah Jenkins"

    # Labs check
    lab_names = [l.canonical_name for l in record.extracted_labs]
    assert any("HbA1c" in name for name in lab_names)
    assert any("Creatinine" in name for name in lab_names)
    assert any("Cholesterol" in name for name in lab_names)

    # Meds check
    med_names = [m.name.lower() for m in record.extracted_medications]
    assert "metformin" in med_names
    assert "lisinopril" in med_names


def test_multimodal_triage_engine():
    engine = MultimodalTriageEngine()
    sample_payload = "HbA1c: 7.2%\nFasting Blood Glucose: 110 mg/dL"
    res = engine.process_image_payload(sample_payload, patient_id="usr_test_multi")

    assert res.document_type == "LAB_REPORT"
    assert len(res.entities_extracted) >= 1
    assert "HbA1c" in res.triage_summary or "Glucose" in res.triage_summary


def test_chunking_and_embeddings():
    sample_text = "Patient presents with type 2 diabetes mellitus and hypertension. Active meds include Metformin."
    chunks = _chunk_text(sample_text, doc_id="doc_123", doc_name="chart.txt", chunk_size=20, overlap=5)

    assert len(chunks) >= 1
    assert "id" in chunks[0]
    assert len(chunks[0]["embedding"]) == 384


@pytest.mark.asyncio
async def test_orchestrator_llm_context_injection():
    # Setup state manager with extracted lab
    mgr = PatientStateManager()
    await mgr.initialize()
    state = mgr.get_or_create_state("usr_ocr_e2e")

    from healthbot_v4.shared.models.base import NormalizedLab
    from datetime import datetime, timezone

    state.recent_labs.append(
        NormalizedLab(
            canonical_name="HbA1c (Glycated Hemoglobin)",
            loinc_code="4548-4",
            value=8.4,
            unit="%",
            classification="High",
            timestamp=datetime.now(timezone.utc)
        )
    )

    orchestrator = AIOrchestrator()
    await orchestrator.initialize()

    response = await orchestrator.process_patient_query(
        patient_id="usr_ocr_e2e",
        session_id="sess_ocr_e2e",
        query="What was my latest HbA1c lab result?"
    )

    assert response.patient_id == "usr_ocr_e2e"
    assert not response.emergency_triggered
    assert len(response.response_text) > 20
