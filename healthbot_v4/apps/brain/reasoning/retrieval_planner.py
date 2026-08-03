"""
healthbot_v4/apps/brain/reasoning/retrieval_planner.py
Context Retrieval Planner for VitalHealth v5.0 Health Brain.
Dynamically decides which Health Brain subsystems to query based on Clinical Intent and Patient Profile.
"""

from typing import Dict, Any
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntent, IntentAnalysisResult
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState


class RetrievalPlan(BaseModel):
    retrieve_timeline: bool = False
    retrieve_summary: bool = True
    retrieve_twin: bool = False
    retrieve_ocr: bool = False
    retrieve_medication: bool = False
    retrieve_rag: bool = False
    retrieve_graph: bool = False
    retrieve_memory: bool = True
    retrieve_trends: bool = False
    retrieve_recommendations: bool = False
    retrieve_risks: bool = True
    explainable_matrix: Dict[str, str] = Field(default_factory=dict)


class ContextRetrievalPlanner(HealthBrainSubsystem):
    """Planner subsystem selecting optimal, non-bloated subsystem context."""

    def __init__(self):
        super().__init__("context_retrieval_planner")

    async def initialize(self) -> None:
        logger.info("🗺️ Context Retrieval Planner Subsystem initialized")

    def create_retrieval_plan(self, intent_res: IntentAnalysisResult, state: PatientState) -> RetrievalPlan:
        intent = intent_res.primary_intent
        plan = RetrievalPlan()
        matrix = {}

        # Always fetch State & Summary
        plan.retrieve_summary = True
        matrix["Summary"] = "RETRIEVED: Required for core clinical snapshot"

        plan.retrieve_risks = True
        matrix["Risks"] = "RETRIEVED: Safety monitoring active"

        if intent == ClinicalIntent.NUTRITION:
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Check glycemic/potassium drug interactions with food"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: ADA/ACC nutritional guidelines"
            if any(c.condition_name.lower() in ["diabetes", "type 2 diabetes"] for c in state.current_conditions) or any(l.loinc_code == "4548-4" for l in state.recent_labs):
                plan.retrieve_twin = True
                matrix["Twin"] = "RETRIEVED: Glucose trajectory prediction for dietary intake"

        elif intent == ClinicalIntent.MEDICATION or intent == ClinicalIntent.PRESCRIPTION:
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Active regimen query"
            plan.retrieve_graph = True
            matrix["Graph"] = "RETRIEVED: Drug-drug & drug-condition clinical graph"

        elif intent == ClinicalIntent.LONGITUDINAL_COMPARISON or intent == ClinicalIntent.TIMELINE:
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Time-series event history"
            plan.retrieve_trends = True
            matrix["Trends"] = "RETRIEVED: Vitals and lab value delta calculations"

        elif intent == ClinicalIntent.DIGITAL_TWIN:
            plan.retrieve_twin = True
            matrix["Twin"] = "RETRIEVED: BioGears physiological simulation"

        elif intent == ClinicalIntent.LAB_REPORT:
            plan.retrieve_ocr = True
            matrix["OCR"] = "RETRIEVED: Smart OCR lab values & reports"

        # Explicitly document skipped subsystems to keep context concise
        for sub in ["Timeline", "Twin", "OCR", "Medication", "RAG", "Graph", "Trends", "Recommendations"]:
            if sub not in matrix:
                matrix[sub] = f"SKIPPED: Not required for intent [{intent.value}]"

        plan.explainable_matrix = matrix
        logger.info(f"Retrieval Plan created for {intent.value}: {sum(1 for v in matrix.values() if v.startswith('RETRIEVED'))} subsystems selected")
        return plan
