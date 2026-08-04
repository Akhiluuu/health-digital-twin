"""
healthbot_v4/apps/brain/reasoning/clinical_intent.py
Intelligent Clinical Intent Engine for VitalHealth v5.0 Health Brain.
Classifies incoming patient queries into 18 discrete clinical intents with entity extraction.
"""

from enum import Enum
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class ClinicalIntent(str, Enum):
    MEDICATION = "MEDICATION"
    NUTRITION = "NUTRITION"
    EXERCISE = "EXERCISE"
    SYMPTOMS = "SYMPTOMS"
    LAB_REPORT = "LAB_REPORT"
    PRESCRIPTION = "PRESCRIPTION"
    RISK = "RISK"
    LIFESTYLE = "LIFESTYLE"
    HEALTH_SUMMARY = "HEALTH_SUMMARY"
    LONGITUDINAL_COMPARISON = "LONGITUDINAL_COMPARISON"
    DOCTOR_FOLLOWUP = "DOCTOR_FOLLOWUP"
    GENERAL_CONVERSATION = "GENERAL_CONVERSATION"
    EMERGENCY = "EMERGENCY"
    TIMELINE = "TIMELINE"
    DIGITAL_TWIN = "DIGITAL_TWIN"
    FAMILY = "FAMILY"
    REMINDER = "REMINDER"
    HEALTH_GOAL = "HEALTH_GOAL"


class IntentAnalysisResult(BaseModel):
    primary_intent: ClinicalIntent
    secondary_intents: List[ClinicalIntent] = Field(default_factory=list)
    confidence: float = 0.95
    extracted_entities: Dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""


class ClinicalIntentEngine(HealthBrainSubsystem):
    """Subsystem analyzing query semantics to determine patient intent."""

    def __init__(self):
        super().__init__("clinical_intent_engine")

    async def initialize(self) -> None:
        logger.info("🎯 Clinical Intent Classification Engine initialized")

    def classify_intent(self, query: str) -> IntentAnalysisResult:
        q = query.lower()

        # Emergency
        if any(kw in q for kw in ["emergency", "chest pain", "cannot breathe", "severe bleeding", "vaginal bleeding", "bleeding", "numbness", "unconscious", "stroke", "slurred speech", "facial drooping", "blue lips", "suicidal", "overdose", "thunderclap", "anaphylaxis", "crushing pain", "shortness of breath"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.EMERGENCY,
                confidence=1.0,
                reasoning="Triggered safety critical emergency symptom keywords.",
            )

        # Longitudinal comparison
        if any(kw in q for kw in ["compare", "trend", "changed", "getting worse", "getting better", "last month", "over time", "progress"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.LONGITUDINAL_COMPARISON,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.95,
                reasoning="Query requests historical trend comparison over time.",
            )

        # Nutrition
        if any(kw in q for kw in ["eat", "food", "mango", "diet", "meal", "fruit", "calories", "carbs", "sugar", "nutrition"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.NUTRITION,
                secondary_intents=[ClinicalIntent.LIFESTYLE, ClinicalIntent.RISK],
                confidence=0.95,
                reasoning="Query addresses dietary, food, or nutritional guidance.",
            )

        # Medication / Prescription
        if any(kw in q for kw in ["medication", "medicine", "pill", "prescription", "dose", "taking", "metformin", "lisinopril", "vault"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.MEDICATION,
                secondary_intents=[ClinicalIntent.PRESCRIPTION],
                confidence=0.95,
                reasoning="Query inquires about patient medication regimen.",
            )

        # Digital Twin & Extended Physiological Vitals
        if any(kw in q for kw in ["simulate", "twin", "predict", "future", "30 days", "biogears", "vitals", "cardiac output", "mean arterial pressure", "map", "stroke volume", "respiration", "tidal volume", "arterial ph", "organ score", "organ scores", "organ health", "organ system"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DIGITAL_TWIN,
                confidence=0.95,
                reasoning="Query requests physiological digital twin simulation or extended vitals.",
            )

        # Cognitive Assessment
        if any(kw in q for kw in ["cognitive", "cognition", "stresstest", "stress test", "brain score", "brain health", "stroop", "memory score"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DIGITAL_TWIN,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.95,
                reasoning="Query asks about cognitive stress testing and brain performance.",
            )

        # Body Measurements & Physique
        if any(kw in q for kw in ["body measurement", "body measurements", "my body", "physique", "bmi"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.HEALTH_SUMMARY,
                secondary_intents=[ClinicalIntent.DIGITAL_TWIN],
                confidence=0.95,
                reasoning="Query asks about body measurements, height, weight, or physique.",
            )

        # Lab Report
        if any(kw in q for kw in ["lab", "hba1c", "blood sugar", "creatinine", "test", "result", "report"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.LAB_REPORT,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.95,
                reasoning="Query references lab measurements or blood work.",
            )

        # Health Summary
        if any(kw in q for kw in ["health score", "how am i doing", "status", "summary", "overview"]):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.HEALTH_SUMMARY,
                confidence=0.95,
                reasoning="Query asks for general health overview or score.",
            )

        # Default fallback
        return IntentAnalysisResult(
            primary_intent=ClinicalIntent.GENERAL_CONVERSATION,
            secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
            confidence=0.85,
            reasoning="Default conversational intent.",
        )
