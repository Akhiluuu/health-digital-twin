"""
healthbot_v4/apps/brain/recommendations/recommendation_engine.py
Guideline-Based Clinical Recommendation Engine (ADA 2026, ACC/AHA).
"""

from typing import List
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState, RiskLevel


class ClinicalRecommendation(BaseModel):
    rec_id: str
    guideline_source: str
    title: str
    action_item: str
    priority: str = "medium"


class RecommendationEngine(HealthBrainSubsystem):
    """Subsystem generating guideline-backed clinical recommendations."""

    def __init__(self):
        super().__init__("recommendation_engine")

    async def initialize(self) -> None:
        logger.info("📋 Guideline Recommendation Engine initialized")

    def generate_recommendations(self, state: PatientState) -> List[ClinicalRecommendation]:
        recs = []

        for risk in state.active_risks:
            if risk.level in (RiskLevel.high, RiskLevel.critical):
                recs.append(
                    ClinicalRecommendation(
                        rec_id=f"rec_{risk.risk_id}",
                        guideline_source="ADA 2026 / ACC/AHA Guidelines",
                        title=f"Management for {risk.title}",
                        action_item=risk.recommended_action,
                        priority="high",
                    )
                )

        logger.info(f"Generated {len(recs)} structured recommendations for patient {state.patient_id}")
        return recs
