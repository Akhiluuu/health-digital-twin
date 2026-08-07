"""
healthbot_v4/apps/brain/orchestrator/phos_orchestrator.py

PHOS Master Reasoning Engine Orchestrator for VitalHealth.
Executes the full 14-step multi-agent clinical reasoning pipeline, converting user queries
into evidence-grounded, schema-validated clinical insights with complete provenance.
"""

import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntentEngine
from healthbot_v4.apps.brain.reasoning.retrieval_planner import ContextRetrievalPlanner
from healthbot_v4.apps.brain.evidence.otm import OrchestratorToolManager
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.brain.evidence.correlation_engine import EvidenceCorrelationEngine
from healthbot_v4.apps.brain.reasoning.hypothesis_engine import HypothesisEngine
from healthbot_v4.apps.brain.reasoning.confidence_gap_engine import ConfidenceAndGapEngine
from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategyPlanner
from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
from healthbot_v4.apps.brain.reasoning.followup_generator import FollowUpGenerator
from healthbot_v4.apps.brain.reasoning.ui_selector import UIComponentSelector
from healthbot_v4.apps.brain.context.context_builder import ContextBuilder, BudgetedContext
from healthbot_v4.shared.logger.logger import logger


class PHOSResponsePayload(BaseModel):
    query: str
    patient_id: str
    intent_analysis: Dict[str, Any]
    evidence_plan: Dict[str, Any]
    phkg_correlations: Dict[str, Any]
    hypotheses: List[Dict[str, Any]]
    confidence_analysis: Dict[str, Any]
    response_strategy: Dict[str, Any]
    answer_text: str
    follow_ups: List[str]
    ui_components: List[Dict[str, Any]]
    pipeline_latency_ms: float

    def to_full_contract(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "patient_id": self.patient_id,
            "intentAnalysis": self.intent_analysis,
            "evidencePlan": self.evidence_plan,
            "correlations": self.phkg_correlations,
            "hypotheses": self.hypotheses,
            "confidence": self.confidence_analysis,
            "strategy": self.response_strategy,
            "answerText": self.answer_text,
            "followUps": self.follow_ups,
            "uiComponents": self.ui_components,
            "latencyMs": self.pipeline_latency_ms,
        }


class PHOSOrchestrator:
    """
    Unified Orchestrator for Personal Health Operating System (PHOS).
    Executes the 14-step evidence pipeline.
    """

    def __init__(self):
        self.intent_engine = ClinicalIntentEngine()
        self.retrieval_planner = ContextRetrievalPlanner()
        self.otm = OrchestratorToolManager()
        self.graph_engine = HealthKnowledgeGraphEngine()
        self.correlation_engine = EvidenceCorrelationEngine(self.graph_engine)
        self.hypothesis_engine = HypothesisEngine()
        self.confidence_gap_engine = ConfidenceAndGapEngine()
        self.strategy_planner = ResponseStrategyPlanner()
        self.qwen_engine = QwenInferenceEngine()
        self.followup_generator = FollowUpGenerator()
        self.ui_selector = UIComponentSelector()
        self.context_builder = ContextBuilder()

    async def initialize(self) -> None:
        logger.info("🚀 Initializing PHOS Multi-Agent Reasoning Engine...")
        await self.intent_engine.initialize()
        await self.retrieval_planner.initialize()
        await self.qwen_engine.initialize()
        logger.info("✅ PHOS Orchestrator online.")

    def process_query(
        self,
        query: str,
        state: UnifiedPatientState,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> PHOSResponsePayload:
        start_time = time.time()
        patient_id = state.patient_id
        logger.info(f"⚡ [PHOS Engine] Processing query: '{query}' for patient {patient_id}")

        # Step 1 & 2: Intent Understanding
        intent_res = self.intent_engine.classify_intent(query)
        logger.info(f"Step 2: Intent classified as [{intent_res.primary_intent.value}] (Goal: {intent_res.clinicalGoal.value})")

        # Step 3: Evidence Planner
        retrieval_plan = self.retrieval_planner.create_retrieval_plan(intent_res, state)
        req_domains = [k for k, v in retrieval_plan.model_dump().items() if v is True and k.startswith("retrieve_")]
        evidence_plan_dict = {
            "intent": intent_res.primary_intent.value,
            "requiredDomains": req_domains,
            "priorityOrder": ["medical_records", "biogears_twin", "vitals_history", "labs", "symptoms"],
        }
        logger.info(f"Step 3: Evidence plan formulated ({len(req_domains)} domains)")

        # Step 4 & 5: Subsystem Retrieval & Evidence Bundle Assembly
        bundle = self.otm.collect_evidence(
            query=query,
            intent=intent_res.primary_intent.value,
            state=state,
        )
        logger.info(f"Step 4-5: Collected evidence bundle ({len(bundle.findings)} findings across {len(bundle.sources)} sources)")

        # Step 6 & 7: Knowledge Graph Ingestion & Cross-Domain Correlation
        items = bundle.to_evidence_items()
        correlations = self.correlation_engine.correlate_bundle(patient_id, items)
        logger.info(f"Step 6-7: PHKG ingestion & correlation done ({len(correlations.get('correlations', []))} relations discovered)")

        # Step 8 & 9: Hypothesis Generation & Validation
        hypotheses = self.hypothesis_engine.generate_and_validate(
            intent=intent_res.primary_intent.value,
            query=query,
            bundle=bundle,
        )
        logger.info(f"Step 8-9: Generated {len(hypotheses)} clinical differential hypotheses")

        # Step 10: Explainable Confidence & Gap Detection
        confidence_res = self.confidence_gap_engine.analyze(bundle)
        logger.info(f"Step 10: Confidence analyzed ({confidence_res.confidence_label}, overall {confidence_res.overall_confidence * 100:.0f}%)")

        # Step 11: Response Strategy Selection
        strategy = self.strategy_planner.plan_strategy(
            intent=intent_res.primary_intent.value,
            query=query,
            confidence_label=confidence_res.confidence_label,
        )
        logger.info(f"Step 11: Response strategy set to [{strategy.mode.value}] ({strategy.tone})")

        # Step 12: Composition Engine (LLM Synthesis over Evidence Bundle)
        budgeted_context = self.context_builder.build_context(
            query=query,
            state=state,
            history=conversation_history or [],
        )
        reasoning_res = self.qwen_engine.generate_reasoning_response(
            context=budgeted_context,
            user_query=query,
            conversation_history=conversation_history,
            intent=intent_res.primary_intent.value,
            evidence_bundle=bundle,
        )
        answer_text = reasoning_res["response"]
        logger.info("Step 12: Answer composed via Qwen reasoning engine")

        # Step 13: Follow-Up Questions
        follow_ups_dict = self.followup_generator.generate_followups(
            intent=intent_res.primary_intent.value,
            query=query,
            missing_gaps=confidence_res.missing_gaps,
        )
        follow_ups = follow_ups_dict.get("followUps", [])

        # Step 14: UI Component Selection
        ui_selection = self.ui_selector.select_components(
            strategy=strategy,
            summary_text=answer_text[:200] + "...",
            follow_ups=follow_ups,
        )

        latency = (time.time() - start_time) * 1000
        logger.info(f"✨ [PHOS Engine] Completed 14-step pipeline in {latency:.1f}ms")

        return PHOSResponsePayload(
            query=query,
            patient_id=patient_id,
            intent_analysis={
                "primaryIntent": intent_res.primary_intent.value,
                "secondaryIntents": [i.value for i in intent_res.secondary_intents],
                "clinicalGoal": intent_res.clinicalGoal.value,
                "confidence": intent_res.confidence,
                "extractedEntities": intent_res.extracted_entities,
            },
            evidence_plan=evidence_plan_dict,
            phkg_correlations=correlations,
            hypotheses=[h.to_json_contract() for h in hypotheses],
            confidence_analysis=confidence_res.to_json_contract(),
            response_strategy=strategy.to_json_contract(),
            answer_text=answer_text,
            follow_ups=follow_ups,
            ui_components=ui_selection.to_json_contract().get("widgets", []),
            pipeline_latency_ms=latency,
        )
