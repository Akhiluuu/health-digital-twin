"""
healthbot_v4/apps/brain/orchestrator/orchestrator.py
AI Orchestrator for VitalHealth v5.0 Health Brain.
Coordinates Clinical Intent, Context Retrieval Planning, Clinical Snapshot, Longitudinal Reasoning, Risk Matrix, and Qwen3.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.graph.patient_graph import PatientGraphEngine
from healthbot_v4.apps.brain.risk.risk_engine import ClinicalRiskEngine
from healthbot_v4.apps.brain.recommendations.recommendation_engine import RecommendationEngine
from healthbot_v4.apps.brain.decision.decision_engine import HealthBrainDecisionEngine, ActionType
from healthbot_v4.apps.brain.summary.summary_engine import HealthSummaryEngine
from healthbot_v4.apps.brain.context.context_builder import ContextBudgeter
from healthbot_v4.apps.brain.rag.dual_rag import DualRAGService
from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntentEngine
from healthbot_v4.apps.brain.reasoning.retrieval_planner import ContextRetrievalPlanner
from healthbot_v4.apps.brain.copilot.clinical_snapshot import ClinicalSnapshotEngine
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalEngine
from healthbot_v4.apps.twin.simulation_runner import DigitalTwinRunner
from healthbot_v4.shared.models.base import TimelineEventType, RiskLevel


class OrchestratorResponse(BaseModel):
    patient_id: str
    response_text: str
    emergency_triggered: bool = False
    confidence_score: float = 0.95
    disclaimer: str = "VitalHealth AI is a clinical decision support system, not a substitute for professional medical advice."
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AIOrchestrator(HealthBrainSubsystem):
    """Central Orchestrator routing query workflows across Health Brain subsystems."""

    def __init__(self):
        super().__init__("ai_orchestrator")
        self.state_mgr = PatientStateManager()
        self.timeline_engine = MedicalTimelineEngine()
        self.graph_engine = PatientGraphEngine()
        self.risk_engine = ClinicalRiskEngine()
        self.rec_engine = RecommendationEngine()
        self.decision_engine = HealthBrainDecisionEngine()
        self.summary_engine = HealthSummaryEngine()
        self.context_budgeter = ContextBudgeter()
        self.rag_service = DualRAGService()
        self.qwen_engine = QwenInferenceEngine()
        self.intent_engine = ClinicalIntentEngine()
        self.planner = ContextRetrievalPlanner()
        self.snapshot_engine = ClinicalSnapshotEngine()
        self.longitudinal_engine = LongitudinalEngine()
        self.twin_runner = DigitalTwinRunner()

    async def initialize(self) -> None:
        await self.state_mgr.initialize()
        await self.timeline_engine.initialize()
        await self.graph_engine.initialize()
        await self.risk_engine.initialize()
        await self.rec_engine.initialize()
        await self.decision_engine.initialize()
        await self.summary_engine.initialize()
        await self.context_budgeter.initialize()
        await self.rag_service.initialize()
        await self.qwen_engine.initialize()
        await self.intent_engine.initialize()
        await self.planner.initialize()
        await self.snapshot_engine.initialize()
        await self.longitudinal_engine.initialize()
        await self.twin_runner.initialize()
        logger.info("🤖 AI Orchestrator initialized (Multi-Agent Tool Router & Guardrails Active)")

    async def process_patient_query(self, patient_id: str, session_id: str, query: str) -> OrchestratorResponse:
        logger.info(f"AIOrchestrator processing query for patient {patient_id} in session {session_id}")

        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        state = self.state_mgr.update_risks(patient_id, risks)

        # 1. Intent Analysis & Safety Gatekeeper
        intent_res = self.intent_engine.classify_intent(query)
        decision = self.decision_engine.decide_query_action(state, query)

        if ActionType.emergency_redirect in decision.actions or intent_res.primary_intent == "EMERGENCY":
            emergency_text = (
                "🚨 EMERGENCY WARNING: Your query describes symptoms that require immediate medical attention. "
                "Please call 911 or proceed to the nearest Emergency Room right away."
            )
            self.timeline_engine.record_event(
                patient_id,
                TimelineEventType.risk_flagged,
                "Emergency Safety Triage Triggered",
                "Severe symptoms detected in query input.",
            )
            return OrchestratorResponse(
                patient_id=patient_id,
                response_text=emergency_text,
                emergency_triggered=True,
                confidence_score=1.0,
                metadata={"actions": [a.value for a in decision.actions], "intent": intent_res.primary_intent.value},
            )

        # 2. Context Retrieval Planning
        plan = self.planner.create_retrieval_plan(intent_res, state)

        # 3. Longitudinal & Twin Simulation
        longitudinal_res = self.longitudinal_engine.analyze_patient_trajectory(state) if plan.retrieve_trends or plan.retrieve_timeline else None

        sim_context = ""
        twin_summary = None
        if plan.retrieve_twin and state.active_medications:
            sim_res = self.twin_runner.run_medication_simulation(state.profile, state.active_medications[0].name)
            sim_context = f"PHYSIOLOGICAL SIMULATION: {sim_res.clinical_summary}"
            twin_summary = sim_res.clinical_summary

        # 4. Clinical Snapshot
        snapshot = self.snapshot_engine.generate_snapshot(state, twin_summary=twin_summary)
        master_summary = self.summary_engine.build_master_summary(state)

        rag_context = self.rag_service.retrieve_context(patient_id, query) if plan.retrieve_rag else ""

        # 5. Dynamic Context Budgeter
        budgeted_ctx = self.context_budgeter.assemble_context(
            state,
            snapshot,
            plan,
            longitudinal_res=longitudinal_res,
            master_summary=master_summary,
            rag_context=rag_context,
            sim_context=sim_context,
        )

        # 6. Qwen3 Reasoning Engine Output
        reasoning_res = self.qwen_engine.generate_reasoning_response(budgeted_ctx, query)

        self.timeline_engine.record_event(
            patient_id, TimelineEventType.symptom_logged, "User Query Processed", query
        )

        return OrchestratorResponse(
            patient_id=patient_id,
            response_text=reasoning_res["response"],
            emergency_triggered=False,
            confidence_score=reasoning_res["confidence_score"],
            metadata={
                "intent": intent_res.primary_intent.value,
                "retrieval_plan": plan.explainable_matrix,
                "actions": [a.value for a in decision.actions],
                "tokens_budgeted": budgeted_ctx.total_token_estimate,
                "health_score": state.current_health_score,
                "sources_cited": reasoning_res.get("sources_cited", []),
            },
        )
