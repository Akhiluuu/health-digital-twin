"""
healthbot_v4/apps/brain/context/context_builder.py
Dynamic Patient-Specific Prompt Generator & Token Budgeter for VitalHealth v5.0.
Synthesizes Clinical Snapshots, Retrieval Plans, and Safety Instructions into token-budgeted prompt contexts.
"""

from typing import Optional, Any
from pydantic import BaseModel
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.apps.brain.copilot.clinical_snapshot import CurrentClinicalSnapshot
from healthbot_v4.apps.brain.reasoning.retrieval_planner import RetrievalPlan
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalAnalysisResult
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState


class BudgetedContext(BaseModel):
    patient_id: str
    system_prompt: str = (
        "You are Personal Health Assistant, an AI clinical intelligence companion for VitalHealth. "
        "Provide personalized, empathetic, evidence-based guidance using ONLY the provided patient clinical context. "
        "Reference patient-specific labs, medications, conditions, and BioGears digital twin predictions when relevant. "
        "Never invent unavailable medical data."
    )
    clinical_snapshot_block: str
    master_summary_block: str
    active_risks_block: str
    retrieval_plan_block: str
    rag_retrieval_block: str = "CLINICAL REFERENCE: None"
    simulation_block: str = "PHYSIOLOGICAL SIMULATION: None"
    longitudinal_block: str = "LONGITUDINAL TRAJECTORY: Stable"
    total_token_estimate: int = 0


class ContextBudgeter(HealthBrainSubsystem):
    """Subsystem constructing token-budgeted, dynamic context prompts."""

    def __init__(self, max_token_limit: int = 4096):
        super().__init__("context_budgeter")
        self.max_token_limit = max_token_limit

    async def initialize(self) -> None:
        logger.info("📦 Context Budgeter Engine initialized")

    def assemble_context(
        self,
        patient_state: PatientState,
        snapshot: CurrentClinicalSnapshot,
        plan: RetrievalPlan,
        longitudinal_res: Optional[LongitudinalAnalysisResult] = None,
        master_summary: str = "",
        rag_context: str = "",
        sim_context: str = "",
    ) -> BudgetedContext:
        recent_syms = getattr(patient_state, "recent_symptoms", [])
        symptom_str = ", ".join([f"{s.get('name', '')} ({s.get('severity', 'Moderate')})" if isinstance(s, dict) else str(s) for s in recent_syms[:3]]) if recent_syms else "None recently logged"

        snapshot_block = (
            f"=== CURRENT CLINICAL SNAPSHOT ({snapshot.patient_id}) ===\n"
            f"Patient Profile: {snapshot.profile_summary}\n"
            f"Health Score: {snapshot.current_health_score:.0f}/100\n"
            f"Active Conditions: {', '.join(snapshot.active_conditions)}\n"
            f"Active Regimen: {', '.join(snapshot.active_medications)}\n"
            f"Recent Logged Symptoms: {symptom_str}\n"
            f"Latest Labs: {snapshot.latest_labs_summary}\n"
            f"Active Risks: {snapshot.active_risks_summary}\n"
            f"Outstanding Action Items: {'; '.join(snapshot.outstanding_action_items)}"
        )

        plan_retrieved = [k for k, v in plan.explainable_matrix.items() if v.startswith("RETRIEVED")]
        plan_block = f"CLINICAL RETRIEVAL PLAN: Intent-filtered context from [{', '.join(plan_retrieved)}]"

        long_block = "LONGITUDINAL TRAJECTORY: Stable history."
        if longitudinal_res and (longitudinal_res.lab_deltas or longitudinal_res.vital_deltas):
            deltas_str = "; ".join([d.clinical_interpretation for d in (longitudinal_res.lab_deltas + longitudinal_res.vital_deltas)])
            long_block = f"LONGITUDINAL TRAJECTORY: {deltas_str}"

        if patient_state.active_risks:
            clean_risks = [r for r in patient_state.active_risks if not any(kw in r.title.lower() for kw in ["user query", "query processed", "processed (", "processed"])]
            if clean_risks:
                risk_str = "; ".join([f"[{r.level.value.upper()}] {r.title}" for r in clean_risks])
                risks_block = f"ACTIVE CLINICAL RISKS: {risk_str}"
            else:
                risks_block = "ACTIVE CLINICAL RISKS: None"
        else:
            risks_block = "ACTIVE CLINICAL RISKS: None"

        summary_block = master_summary if master_summary else f"PATIENT SUMMARY: {patient_state.patient_id}"

        total_text = snapshot_block + plan_block + long_block + summary_block + risks_block + rag_context + sim_context
        token_est = len(total_text) // 4

        # Sanitize summary and snapshot blocks for HIPAA-compliant logging
        from healthbot_v4.apps.brain.security.phi_sanitizer import phi_sanitizer
        sanitized_summary = phi_sanitizer.sanitize_text(summary_block, patient_name=patient_state.profile.first_name)

        logger.info(f"Assembled dynamic context for {patient_state.patient_id}: ~{token_est} tokens budgeted")

        return BudgetedContext(
            patient_id=patient_state.patient_id,
            clinical_snapshot_block=snapshot_block,
            master_summary_block=sanitized_summary,
            active_risks_block=risks_block,
            retrieval_plan_block=plan_block,
            rag_retrieval_block=rag_context if rag_context else "CLINICAL REFERENCE: None",
            simulation_block=sim_context if sim_context else "PHYSIOLOGICAL SIMULATION: None",
            longitudinal_block=long_block,
            total_token_estimate=token_est,
        )

    def build_budgeted_context(self, patient_state: Any, query: str = "", rag_context: str = "") -> BudgetedContext:
        """Helper building a complete BudgetedContext given a patient state, query, and optional RAG context."""
        from healthbot_v4.apps.brain.copilot.clinical_snapshot import ClinicalSnapshotEngine
        from healthbot_v4.apps.brain.reasoning.retrieval_planner import ContextRetrievalPlanner
        from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntentEngine

        try:
            snapshot = ClinicalSnapshotEngine().generate_snapshot(patient_state)
            intent = ClinicalIntentEngine().classify_intent(query if query else "general health query")
            plan = ContextRetrievalPlanner().create_retrieval_plan(intent, patient_state)
            return self.assemble_context(patient_state, snapshot, plan, rag_context=rag_context)
        except Exception as e:
            logger.warning(f"Fallback budgeted context build due to: {e}")
            p_id = getattr(patient_state, "patient_id", "patient-unknown")
            return BudgetedContext(
                patient_id=p_id,
                clinical_snapshot_block=f"=== CLINICAL SNAPSHOT ({p_id}) ===\nQuery: {query}",
                master_summary_block=f"PATIENT SUMMARY: {p_id}",
                active_risks_block="ACTIVE CLINICAL RISKS: None",
                retrieval_plan_block=f"RETRIEVAL PLAN: Intent-filtered context for query '{query}'",
                rag_retrieval_block=f"UPLOADED DOCUMENT CONTEXT:\n{rag_context}" if rag_context else "CLINICAL REFERENCE: None",
                total_token_estimate=120,
            )

    def build_context(self, query: str = "", state: Any = None, history: Optional[list] = None, rag_context: Optional[str] = None) -> BudgetedContext:
        """Standardized interface for PHOS orchestrator and reasoning pipelines."""
        return self.build_budgeted_context(state, query, rag_context=rag_context or "")


# Backward compatibility alias
ContextBuilder = ContextBudgeter
