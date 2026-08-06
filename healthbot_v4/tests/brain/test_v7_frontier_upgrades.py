"""
healthbot_v4/tests/brain/test_v7_frontier_upgrades.py
Automated Pytest Suite for VitalHealth v7.0 Frontier Upgrades.
Verifies Temporal Durable Workflows, DPO Learning Pipeline, Zero-Knowledge Privacy Engine, and Multimodal Vision Triage.
"""

import pytest
import asyncio
from healthbot_v4.apps.workflow.temporal_orchestrator import TemporalClinicalWorkflowOrchestrator
from healthbot_v4.apps.brain.learning.dpo_pipeline import DPOContinuousLearningPipeline
from healthbot_v4.apps.brain.safety.hitl_escalation import EscalationTask
from healthbot_v4.apps.patient.privacy.zkp_privacy import ZeroKnowledgePrivacyEngine
from healthbot_v4.apps.ocr.multimodal_engine import MultimodalTriageEngine


@pytest.mark.asyncio
async def test_temporal_durable_workflow():
    orchestrator = TemporalClinicalWorkflowOrchestrator()
    workflow_state = await orchestrator.start_patient_onboarding_workflow("PX-V7-001", "HbA1c 8.2%")
    assert workflow_state.status == "COMPLETED"
    assert workflow_state.current_step == "COMPLETED"
    assert len(workflow_state.history) == 3
    assert workflow_state.result_data["calibration_score"] == 98.0


def test_dpo_continuous_learning_pipeline():
    dpo_pipeline = DPOContinuousLearningPipeline()
    task = EscalationTask(
        patient_id="PX-V7-002",
        user_query="Can I stop my blood pressure med?",
        proposed_response="Stopping blood pressure meds requires doctor signoff.",
        confidence_score=0.60,
        escalation_reasons=["Low confidence"],
        status="MODIFIED",
        modified_response="Do not stop blood pressure medication abruptly; consult your physician."
    )
    harvested = dpo_pipeline.harvest_hitl_task(task)
    assert harvested is True
    assert dpo_pipeline.get_dataset_size() == 1

    dataset = dpo_pipeline.export_dataset_for_finetuning()
    assert len(dataset) == 1
    assert dataset[0]["prompt"] == "Can I stop my blood pressure med?"
    assert "abruptly" in dataset[0]["chosen"]


def test_zero_knowledge_privacy_engine():
    # Test Proof Generation (actual_age=45, min_required=18 -> True)
    proof_token = ZeroKnowledgePrivacyEngine.generate_age_proof("PX-V7-003", actual_age=45, min_required_age=18)
    assert proof_token.is_valid is True
    assert len(proof_token.proof_hash) == 64

    # Test Proof Verification
    is_authentic = ZeroKnowledgePrivacyEngine.verify_proof_token(proof_token)
    assert is_authentic is True


def test_multimodal_vision_triage_engine():
    engine = MultimodalTriageEngine()
    result = engine.process_image_payload("HbA1c test report 8.2%", hint_category="LAB_REPORT", patient_id="PX-V7-004")
    assert result.document_type == "LAB_REPORT"
    assert len(result.entities_extracted) == 2
    assert result.entities_extracted[0].code == "4548-4"
