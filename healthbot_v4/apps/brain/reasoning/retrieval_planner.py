"""
healthbot_v4/apps/brain/reasoning/retrieval_planner.py
Context Retrieval Planner for VitalHealth v5.0 Health Brain.
Dynamically decides which Health Brain subsystems to query based on Clinical Intent and Patient Profile.
Supports all 28 clinical intents including new categories: mental health, injury, pediatric,
women's health, dermatology, dental, travel, and general health education.
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
    retrieve_conversation_history: bool = True  # Always retrieve for multi-turn continuity
    explainable_matrix: Dict[str, str] = Field(default_factory=dict)


class ContextRetrievalPlanner(HealthBrainSubsystem):
    """
    Production planner that selects optimal, non-bloated subsystem context
    for all 28 clinical intent categories.
    """

    def __init__(self):
        super().__init__("context_retrieval_planner")

    async def initialize(self) -> None:
        logger.info("🗺️ Context Retrieval Planner (v2 — 28 intents) initialized")

    def create_retrieval_plan(self, intent_res: IntentAnalysisResult, state: PatientState) -> RetrievalPlan:
        intent = intent_res.primary_intent
        plan = RetrievalPlan()
        matrix: Dict[str, str] = {}

        # ── Always fetch: Summary + Risks + Conversation History ──────────────
        plan.retrieve_summary = True
        plan.retrieve_risks = True
        plan.retrieve_conversation_history = True
        matrix["Summary"] = "RETRIEVED: Required for core clinical snapshot"
        matrix["Risks"] = "RETRIEVED: Safety monitoring active"
        matrix["ConversationHistory"] = "RETRIEVED: Multi-turn context active"

        # ── Intent-specific context selection ─────────────────────────────────

        if intent == ClinicalIntent.NUTRITION:
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Drug-food interaction check"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: ADA/ACC nutritional guidelines"
            # Pull glucose trajectory if diabetic
            if any(c.condition_name.lower() in ["diabetes", "type 2 diabetes"] for c in state.current_conditions) \
               or any(l.loinc_code == "4548-4" for l in state.recent_labs):
                plan.retrieve_twin = True
                matrix["Twin"] = "RETRIEVED: Glucose trajectory for dietary context"

        elif intent in (ClinicalIntent.MEDICATION, ClinicalIntent.PRESCRIPTION):
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Active medication regimen query"
            plan.retrieve_graph = True
            matrix["Graph"] = "RETRIEVED: Drug-drug & drug-condition interaction graph"

        elif intent in (ClinicalIntent.LONGITUDINAL_COMPARISON, ClinicalIntent.TIMELINE):
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Time-series event history"
            plan.retrieve_trends = True
            matrix["Trends"] = "RETRIEVED: Vitals & lab value delta calculations"

        elif intent == ClinicalIntent.DIGITAL_TWIN:
            plan.retrieve_twin = True
            matrix["Twin"] = "RETRIEVED: BioGears physiological simulation"

        elif intent == ClinicalIntent.LAB_REPORT:
            plan.retrieve_ocr = True
            matrix["OCR"] = "RETRIEVED: Smart OCR lab values & reports"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: Clinical reference ranges"

        elif intent == ClinicalIntent.SYMPTOMS:
            # Symptoms need risks + timeline to spot patterns
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Symptom history and patterns"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: Clinical symptom guidelines"

        elif intent == ClinicalIntent.MENTAL_HEALTH:
            # Mental health: pull timeline (sleep/stress patterns) + recommendations
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Mood & sleep event history"
            plan.retrieve_recommendations = True
            matrix["Recommendations"] = "RETRIEVED: Mental health support resources"

        elif intent == ClinicalIntent.EXERCISE:
            # Exercise: pull twin (cardiac response prediction) + recommendations
            plan.retrieve_twin = True
            matrix["Twin"] = "RETRIEVED: Cardiac response to exercise simulation"
            plan.retrieve_recommendations = True
            matrix["Recommendations"] = "RETRIEVED: Safe exercise guidelines"

        elif intent in (
            ClinicalIntent.INJURY,
            ClinicalIntent.DERMATOLOGY,
            ClinicalIntent.DENTAL,
            ClinicalIntent.TRAVEL_HEALTH,
        ):
            # These are primarily LLM-driven — provide full snapshot + rag
            plan.retrieve_rag = True
            matrix["RAG"] = f"RETRIEVED: Clinical guidelines for {intent.value.lower().replace('_', ' ')}"

        elif intent in (ClinicalIntent.WOMENS_HEALTH, ClinicalIntent.PEDIATRIC):
            # Women's / pediatric: need medications (contraindication check) + rag
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Medication safety for special population"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: Specialty clinical guidelines"

        elif intent == ClinicalIntent.PREVENTIVE_CARE:
            # Preventive care: pull timeline (last screenings) + rag (guidelines)
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Vaccination & screening history"
            plan.retrieve_rag = True
            matrix["RAG"] = "RETRIEVED: USPSTF / CDC preventive care guidelines"

        elif intent == ClinicalIntent.DOCTOR_FOLLOWUP:
            # Doctor prep: everything the doctor would need
            plan.retrieve_medication = True
            matrix["Medication"] = "RETRIEVED: Active regimen for doctor review"
            plan.retrieve_timeline = True
            matrix["Timeline"] = "RETRIEVED: Recent event history for appointment"
            plan.retrieve_trends = True
            matrix["Trends"] = "RETRIEVED: Trend data for specialist discussion"

        elif intent == ClinicalIntent.HEALTH_SUMMARY:
            plan.retrieve_trends = True
            matrix["Trends"] = "RETRIEVED: Health trajectory overview"

        elif intent in (
            ClinicalIntent.GENERAL_CONVERSATION,
            ClinicalIntent.GENERAL_HEALTH,
            ClinicalIntent.GENERAL_HEALTH_EDUCATION,
            ClinicalIntent.REMINDER,
            ClinicalIntent.HEALTH_GOAL,
            ClinicalIntent.FAMILY,
        ):
            # For all open-domain and general queries: always give full patient context
            # so the LLM can personalize its response even for novel question types
            plan.retrieve_summary = True
            plan.retrieve_risks = True
            matrix["Summary"] = "RETRIEVED: Full snapshot for open-domain health query"

        # ── Document all skipped subsystems ───────────────────────────────────
        all_subsystems = ["Timeline", "Twin", "OCR", "Medication", "RAG", "Graph", "Trends", "Recommendations"]
        for sub in all_subsystems:
            if sub not in matrix:
                matrix[sub] = f"SKIPPED: Not required for intent [{intent.value}]"

        plan.explainable_matrix = matrix
        retrieved_count = sum(1 for v in matrix.values() if v.startswith("RETRIEVED"))
        logger.info(f"Retrieval Plan [{intent.value}]: {retrieved_count} subsystems selected")
        return plan
