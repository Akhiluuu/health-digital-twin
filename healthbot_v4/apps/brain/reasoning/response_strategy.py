"""
healthbot_v4/apps/brain/reasoning/response_strategy.py

Response Strategy Planner for Personal Health Operating System (PHOS).
Selects output mode (Assessment, Educational, Decision Support, Urgent Triage,
Comparison, Prediction) and tone based on intent, urgency, and confidence.
"""

from enum import Enum
from typing import Any, Dict
from pydantic import BaseModel
from healthbot_v4.shared.logger.logger import logger


class StrategyMode(str, Enum):
    ASSESSMENT       = "Assessment Mode"
    EDUCATIONAL      = "Educational Mode"
    DECISION_SUPPORT = "Decision Support Mode"
    URGENT_TRIAGE    = "Triage/Emergency Mode"
    COMPARISON       = "Comparison Mode"
    PREDICTION       = "Prediction Mode"


class ResponseStrategy(BaseModel):
    mode: StrategyMode
    tone: str               # Reassuring, Cautionary, Urgent, Educational
    requires_alert_banner: bool = False
    include_biogears_card: bool = True
    include_trend_chart: bool = False

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "mode": self.mode.value,
            "tone": self.tone,
            "requires_alert_banner": self.requires_alert_banner,
            "include_biogears_card": self.include_biogears_card,
            "include_trend_chart": self.include_trend_chart,
        }


class ResponseStrategyPlanner:
    """
    Determines response communication strategy and mode based on clinical intent.
    """

    def plan_strategy(self, intent: str, query: str, confidence_label: str) -> ResponseStrategy:
        i_upper = intent.upper()
        q_lower = query.lower()

        # Priority 1: Emergency Triage
        if i_upper == "EMERGENCY" or any(k in q_lower for k in ["chest pain", "shortness of breath", "stroke"]):
            return ResponseStrategy(
                mode=StrategyMode.URGENT_TRIAGE,
                tone="Urgent & Direct",
                requires_alert_banner=True,
                include_biogears_card=False,
                include_trend_chart=False,
            )

        # Priority 2: Longitudinal / Comparison
        if i_upper in ["LONGITUDINAL_COMPARISON", "TIMELINE"]:
            return ResponseStrategy(
                mode=StrategyMode.COMPARISON,
                tone="Analytical & Clear",
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=True,
            )

        # Priority 3: Digital Twin / Prediction
        if i_upper == "DIGITAL_TWIN":
            return ResponseStrategy(
                mode=StrategyMode.PREDICTION,
                tone="Scientific & Forward-looking",
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=True,
            )

        # Priority 4: Education / Labs
        if i_upper in ["GENERAL_HEALTH_EDUCATION", "LAB_REPORT"]:
            return ResponseStrategy(
                mode=StrategyMode.EDUCATIONAL,
                tone="Educational & Empathetic",
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=True if i_upper == "LAB_REPORT" else False,
            )

        # Priority 5: Decision Support
        if i_upper in ["MEDICATION", "PRESCRIPTION", "EXERCISE", "NUTRITION"]:
            return ResponseStrategy(
                mode=StrategyMode.DECISION_SUPPORT,
                tone="Actionable & Protective",
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=False,
            )

        # Default Assessment Mode
        logger.info(f"🎨 Planned Strategy: Assessment Mode for intent [{intent}]")
        return ResponseStrategy(
            mode=StrategyMode.ASSESSMENT,
            tone="Reassuring & Empathetic",
            requires_alert_banner=False,
            include_biogears_card=True,
            include_trend_chart=False,
        )
