"""
healthbot_v4/tests/brain/demo_e2e_execution.py
End-to-End Enterprise Health OS (v6.0) Live Execution Demonstration Script.
Processes a user query through the entire data-centric, state-driven orchestrator pipeline.
"""

import asyncio
import json
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator
from healthbot_v4.apps.patient.models.patient_state import (
    UnifiedPatientState,
    FHIRPatientDemographics,
    FHIRCondition,
    FHIRMedicationRequest,
    FHIRObservationLab,
    FHIRAllergyIntolerance,
)
from healthbot_v4.apps.brain.context.semantic_compressor import SemanticContextCompressor
from healthbot_v4.apps.brain.tools.registry import VitalHealthToolRegistry
from healthbot_v4.apps.brain.reasoning.biogears_scenario_engine import BioGearsScenarioEngine
from healthbot_v4.apps.brain.safety.confidence_calculator import ConfidenceCalculator
from healthbot_v4.apps.brain.safety.explainability import ExplainabilityAuditEngine
from healthbot_v4.apps.patient.privacy.consent_engine import ABACConsentEngine, PatientConsentPolicy, AccessRequest
from healthbot_v4.apps.brain.safety.policy_engine import ClinicalPolicyEngine
from healthbot_v4.apps.brain.safety.hitl_escalation import HITLEscalationManager


async def run_e2e_demo():
    print("=" * 80)
    print("🚀 VITALHEALTH ENTERPRISE HEALTH OS (v6.0) - E2E LIVE PIPELINE DEMO")
    print("=" * 80)

    # 1. Instantiate Unified Patient State
    state = UnifiedPatientState(
        patient_id="PX-DEMO-001",
        demographics=FHIRPatientDemographics(
            patient_id="PX-DEMO-001",
            name="Alexander Vance",
            age=56,
            gender="male",
            blood_type="O+",
            bmi=28.2
        ),
        conditions=[
            FHIRCondition(condition_id="c1", icd10_code="E11.9", name="Type 2 Diabetes"),
            FHIRCondition(condition_id="c2", icd10_code="N18.3", name="Chronic Kidney Disease Stage 3a"),
        ],
        active_regimen=[
            FHIRMedicationRequest(medication_id="m1", name="Metformin", dose="1000mg", frequency="BID", compliance_rate=0.92),
            FHIRMedicationRequest(medication_id="m2", name="Apixaban", dose="5mg", frequency="BID", compliance_rate=0.98),
        ],
        lab_trends=[
            FHIRObservationLab(lab_id="l1", biomarker_name="HbA1c", value=7.6, unit="%", reference_range="4.0-5.6%", status="ELEVATED", trend="STABLE"),
            FHIRObservationLab(lab_id="l2", biomarker_name="eGFR", value=52.0, unit="mL/min/1.73m2", reference_range=">60", status="LOW", trend="STABLE"),
        ],
        allergies=[
            FHIRAllergyIntolerance(allergy_id="a1", substance="Penicillin", reaction="Anaphylaxis", severity="severe")
        ]
    )

    print("\n1️⃣ UNIFIED PATIENT STATE (FHIR R4 Aligned):")
    print(f"   Patient: {state.demographics.name} ({state.demographics.age}y/{state.demographics.gender})")
    print(f"   Conditions: {state.get_condition_names()}")
    print(f"   Regimen: {state.get_active_medication_names()}")
    print(f"   Allergies: {state.get_allergy_names()}")

    # 2. ABAC Consent Engine Verification
    consent_engine = ABACConsentEngine()
    policy = PatientConsentPolicy(
        policy_id="pol-demo",
        patient_id=state.patient_id,
        granted_to_role="PRACTITIONER",
        permitted_categories=["VITALS", "MEDICATION", "LABS"]
    )
    consent_engine.register_policy(policy)
    access_req = AccessRequest(
        request_id="req-demo",
        patient_id=state.patient_id,
        requester_id="doc-99",
        requester_role="PRACTITIONER",
        target_category="MEDICATION"
    )
    access_dec = consent_engine.evaluate_access(access_req)
    print(f"\n2️⃣ ABAC CONSENT ENGINE EVALUATION:")
    print(f"   Role: {access_req.requester_role} -> Category: {access_req.target_category}")
    print(f"   Decision: {'ALLOWED' if access_dec.allowed else 'DENIED'} (Reason: {access_dec.reason})")

    # 3. User Counterfactual Query
    query = "What happens if I stop taking my Metformin?"
    print(f"\n3️⃣ USER COUNTERFACTUAL QUERY:")
    print(f"   '{query}'")

    # 4. BioGears Counterfactual Scenario Engine Execution
    sim_res = BioGearsScenarioEngine.run_counterfactual_scenario(state, query)
    print(f"\n4️⃣ BIOGEARS COUNTERFACTUAL SCENARIO ENGINE:")
    print(f"   Scenario Title: {sim_res.scenario_title}")
    print(f"   Baseline: {sim_res.baseline_metrics}")
    print(f"   90-Day Projection: {sim_res.predicted_metrics}")
    print(f"   Delta Impact: {sim_res.delta_summary}")

    # 5. Semantic Context Compressor
    compressed_ctx = SemanticContextCompressor.compress(state, intent="MEDICATION")
    print(f"\n5️⃣ SEMANTIC CONTEXT COMPRESSOR (Token-Dense Representation):")
    print("   " + "\n   ".join(compressed_ctx.split("\n")))

    # 6. Tool Registry Drug Interaction Audit
    tool_res = VitalHealthToolRegistry.check_drug_interactions(state, "Ibuprofen")
    print(f"\n6️⃣ DETERMINISTIC TOOL REGISTRY AUDIT (Checking Ibuprofen):")
    print(f"   Has Interactions: {tool_res.result_data['has_interactions']}")
    for interaction in tool_res.result_data['interactions']:
        print(f"   🚨 [{interaction['severity']}] {interaction['description']}")

    # 7. Decoupled Clinical Policy Engine Evaluation
    policy_res = ClinicalPolicyEngine.evaluate_policies(state, "You can stop taking Metformin and take Ibuprofen for pain.")
    print(f"\n7️⃣ DECOUPLED CLINICAL POLICY ENGINE:")
    print(f"   Policy Passed: {policy_res.passed}")
    for v in policy_res.violations:
        print(f"   ⚠️ Violation [{v.rule_id}]: {v.description}")

    # 8. Multi-Factor Clinical Confidence Calculator
    confidence = ConfidenceCalculator.calculate(state, has_sim_data=True, tool_results_passed=True)
    print(f"\n8️⃣ MULTI-FACTOR CONFIDENCE ENGINE:")
    print(f"   Composite Score: {confidence.composite_score:.3f} (Tier: {confidence.tier})")

    # 9. Practitioner HITL Escalation Queue Check
    hitl = HITLEscalationManager()
    should_esc, esc_reasons = hitl.should_escalate(confidence.composite_score, policy_res.passed, has_critical_interaction=True, is_counterfactual_sim=True)
    print(f"\n9️⃣ HUMAN-IN-THE-LOOP (HITL) PRACTITIONER ESCALATION QUEUE:")
    print(f"   Escalation Required: {should_esc}")
    print(f"   Escalation Reasons: {esc_reasons}")

    # 10. Explainability Audit Certificate
    cert = ExplainabilityAuditEngine.generate_certificate(
        patient_id=state.patient_id,
        intent="MEDICATION_COUNTERFACTUAL",
        query=query,
        summary=sim_res.clinical_interpretation,
        evidence_sources=["BioGears_v5.4_Metabolic_Sim", "ADA_2026_Standards_Sec6"],
        confidence=confidence,
        clinical_reasons=["Metformin discontinuation elevates fasting glucose delta by +38 mg/dL"]
    )
    print(f"\n🔟 EXPLAINABILITY AUDIT CERTIFICATE:")
    print(f"   Certificate ID: {cert.audit_id}")
    print(f"   Timestamp: {cert.timestamp.isoformat()}")
    print(f"   Evidence Cited: {cert.evidence_sources}")

    print("\n" + "=" * 80)
    print("✅ END-TO-END VITALHEALTH ENTERPRISE HEALTH OS PIPELINE EXECUTED SUCCESSFULLY")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_e2e_demo())
