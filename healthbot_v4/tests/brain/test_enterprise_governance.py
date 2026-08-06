"""
healthbot_v4/tests/brain/test_enterprise_governance.py
Automated Pytest Suite for VitalHealth v6.0 Enterprise Governance & Infrastructure Services.
Verifies ABAC Consent Engine, Decoupled Clinical Policy Engine, HITL Escalation Queue, and Clinical Benchmark Evaluator.
"""

import pytest
from datetime import datetime, timezone
from healthbot_v4.apps.patient.models.patient_state import (
    UnifiedPatientState,
    FHIRPatientDemographics,
    FHIRCondition,
)
from healthbot_v4.apps.patient.privacy.consent_engine import (
    ABACConsentEngine,
    PatientConsentPolicy,
    AccessRequest,
)
from healthbot_v4.apps.brain.safety.policy_engine import ClinicalPolicyEngine
from healthbot_v4.apps.brain.safety.hitl_escalation import HITLEscalationManager
from healthbot_v4.apps.brain.evaluation.benchmark_evaluator import ClinicalBenchmarkEvaluator


@pytest.fixture
def abac_engine():
    engine = ABACConsentEngine()
    policy = PatientConsentPolicy(
        policy_id="pol-001",
        patient_id="PX-99214",
        granted_to_role="PRACTITIONER",
        permitted_categories=["VITALS", "MEDICATION", "LABS"],
        restricted_categories=["MENTAL_HEALTH", "GENETICS"],
    )
    engine.register_policy(policy)
    return engine


def test_abac_consent_permitted(abac_engine):
    request = AccessRequest(
        request_id="req-1",
        patient_id="PX-99214",
        requester_id="doc-441",
        requester_role="PRACTITIONER",
        target_category="MEDICATION",
    )
    decision = abac_engine.evaluate_access(request)
    assert decision.allowed is True
    assert decision.policy_evaluated == "pol-001"


def test_abac_consent_restricted(abac_engine):
    request = AccessRequest(
        request_id="req-2",
        patient_id="PX-99214",
        requester_id="doc-441",
        requester_role="PRACTITIONER",
        target_category="MENTAL_HEALTH",
    )
    decision = abac_engine.evaluate_access(request)
    assert decision.allowed is False
    assert "restricted" in decision.reason.lower()


def test_abac_emergency_breakglass(abac_engine):
    request = AccessRequest(
        request_id="req-3",
        patient_id="PX-99214",
        requester_id="er-doctor-99",
        requester_role="PRACTITIONER",
        target_category="MENTAL_HEALTH",
        is_emergency_breakglass=True,
        justification="Acute cardiac arrest triage"
    )
    decision = abac_engine.evaluate_access(request)
    assert decision.allowed is True
    assert decision.breakglass_triggered is True


def test_pediatric_aspirin_policy():
    pediatric_state = UnifiedPatientState(
        patient_id="PX-CHILD",
        demographics=FHIRPatientDemographics(patient_id="PX-CHILD", name="Tommy", age=10, gender="male"),
        conditions=[FHIRCondition(condition_id="c1", icd10_code="R50.9", name="Fever")]
    )
    res = ClinicalPolicyEngine.evaluate_policies(pediatric_state, "You can take 325mg Aspirin for fever relief.")
    assert res.passed is False
    assert len(res.violations) >= 1
    assert res.violations[0].rule_id == "RULE-PED-001"


def test_hitl_escalation_queue():
    hitl = HITLEscalationManager()
    should_esc, reasons = hitl.should_escalate(confidence_score=0.55, policy_passed=False)
    assert should_esc is True
    assert len(reasons) == 2

    task = hitl.create_escalation_task(
        patient_id="PX-99214",
        user_query="Can I stop Lisinopril?",
        proposed_response="Discontinuing Lisinopril may raise blood pressure.",
        confidence_score=0.55,
        reasons=reasons
    )
    assert task.status == "PENDING_REVIEW"
    assert len(hitl.get_pending_tasks()) == 1

    reviewed = hitl.review_task(task.task_id, "APPROVE", notes="Verified by Dr. Smith")
    assert reviewed.status == "APPROVED"
    assert len(hitl.get_pending_tasks()) == 0


def test_clinical_benchmark_evaluator():
    test_samples = [
        {"medqa_correct": True, "hallucinated": False, "citation_valid": True},
        {"medqa_correct": True, "hallucinated": False, "citation_valid": True},
    ]
    res = ClinicalBenchmarkEvaluator.evaluate_release_candidate("Qwen2.5-14B-v6.0", test_samples)
    assert res.overall_pass is True
    assert res.medqa_accuracy_percent == 100.0
    assert res.hallucination_rate_percent == 0.0
