"""
healthbot_v4/apps/brain/safety/hitl_escalation.py
Human-in-the-Loop (HITL) Clinical Escalation Protocol for VitalHealth v6.0 Enterprise.
Holds low-confidence or high-risk AI recommendations in a Practitioner Queue for clinician review prior to user dispatch.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from healthbot_v4.shared.logger.logger import logger


class EscalationTask(BaseModel):
    task_id: str = Field(default_factory=lambda: f"hitl-{uuid.uuid4().hex[:8]}")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    patient_id: str
    user_query: str
    proposed_response: str
    confidence_score: float
    escalation_reasons: List[str]
    status: str = "PENDING_REVIEW"  # PENDING_REVIEW, APPROVED, REJECTED, MODIFIED
    practitioner_notes: Optional[str] = None
    modified_response: Optional[str] = None


class HITLEscalationManager:
    """
    Manages Practitioner Human-in-the-Loop (HITL) review workflow for high-risk AI recommendations.
    """

    def __init__(self):
        # In-memory store for practitioner review queue
        self._queue: Dict[str, EscalationTask] = {}

    def should_escalate(
        self,
        confidence_score: float,
        policy_passed: bool,
        has_critical_interaction: bool = False,
        is_counterfactual_sim: bool = False
    ) -> tuple[bool, List[str]]:
        reasons = []

        if confidence_score < 0.65:
            reasons.append(f"Low composite confidence score ({confidence_score:.2f} < 0.65)")

        if not policy_passed:
            reasons.append("Clinical safety policy violation detected")

        if has_critical_interaction:
            reasons.append("Critical drug-drug contraindication or allergy detected")

        if is_counterfactual_sim:
            reasons.append("Counterfactual medication cessation prediction requires practitioner signoff")

        requires_hitl = len(reasons) > 0
        return requires_hitl, reasons

    def create_escalation_task(
        self,
        patient_id: str,
        user_query: str,
        proposed_response: str,
        confidence_score: float,
        reasons: List[str]
    ) -> EscalationTask:
        task = EscalationTask(
            patient_id=patient_id,
            user_query=user_query,
            proposed_response=proposed_response,
            confidence_score=confidence_score,
            escalation_reasons=reasons
        )
        self._queue[task.task_id] = task
        logger.warning(f"🧑‍⚕️ Created HITL Escalation Task [{task.task_id}] for patient {patient_id} (Reasons: {reasons})")
        return task

    def get_pending_tasks(self) -> List[EscalationTask]:
        return [t for t in self._queue.values() if t.status == "PENDING_REVIEW"]

    def review_task(self, task_id: str, action: str, notes: str = "", modified_text: Optional[str] = None) -> Optional[EscalationTask]:
        if task_id not in self._queue:
            return None

        task = self._queue[task_id]
        if action.upper() in ["APPROVE", "APPROVED"]:
            task.status = "APPROVED"
        elif action.upper() in ["REJECT", "REJECTED"]:
            task.status = "REJECTED"
        elif action.upper() in ["MODIFY", "MODIFIED"]:
            task.status = "MODIFIED"
            task.modified_response = modified_text

        task.practitioner_notes = notes
        logger.info(f"✅ Practitioner completed review for task [{task_id}]: Status={task.status}")
        return task
