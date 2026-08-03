"""
healthbot_v4/apps/brain/decision/decision_engine.py
Health Brain Decision Engine & Triage Gatekeeper for VitalHealth v5.0.
"""

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState, RiskLevel


class ActionType(str, Enum):
    generate_response = "generate_response"
    query_rag = "query_rag"
    run_twin_simulation = "run_twin_simulation"
    emergency_redirect = "emergency_redirect"
    ask_clarification = "ask_clarification"


class DecisionResult(BaseModel):
    actions: List[ActionType] = Field(default_factory=list)
    emergency_level: Optional[RiskLevel] = None
    reasoning: str = ""


class HealthBrainDecisionEngine(HealthBrainSubsystem):
    """Gatekeeper determining system actions based on clinical intent & risk level."""

    def __init__(self):
        super().__init__("decision_engine")

    async def initialize(self) -> None:
        logger.info("🛡️ Decision Engine & Safety Gatekeeper initialized")

    def decide_query_action(self, state: PatientState, query: str) -> DecisionResult:
        query_lower = query.lower()

        # Emergency Guardrail Triage
        emergency_keywords = ["chest pain", "cannot breathe", "arm numbness", "severe bleeding", "unconscious"]
        if any(kw in query_lower for kw in emergency_keywords):
            logger.warning(f"EMERGENCY TRIGGERED for patient {state.patient_id}: {query}")
            return DecisionResult(
                actions=[ActionType.emergency_redirect],
                emergency_level=RiskLevel.critical,
                reasoning="Safety guardrail triggered emergency triage redirect.",
            )

        actions = [ActionType.generate_response]

        if any(kw in query_lower for kw in ["lab", "report", "hba1c", "blood", "guideline"]):
            actions.append(ActionType.query_rag)

        if any(kw in query_lower for kw in ["simulate", "future", "twin", "predict"]):
            actions.append(ActionType.run_twin_simulation)

        logger.info(f"Decision for {state.patient_id}: Actions={[a.value for a in actions]}")
        return DecisionResult(actions=actions, reasoning="Standard query routing plan.")
