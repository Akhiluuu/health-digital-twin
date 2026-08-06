"""
healthbot_v4/apps/brain/learning/dpo_pipeline.py
Direct Preference Optimization (DPO) Continuous Learning Pipeline for VitalHealth v7.0 Enterprise.
Harvests practitioner-validated HITL review decisions to continuously fine-tune local models.
"""

from typing import Dict, Any, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.safety.hitl_escalation import EscalationTask
from healthbot_v4.shared.logger.logger import logger


class DPOPreferencePair(BaseModel):
    pair_id: str
    patient_id: str
    prompt: str
    chosen_response: str
    rejected_response: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DPOContinuousLearningPipeline:
    """
    Continuous Learning Pipeline converting HITL practitioner feedback into DPO training datasets.
    """

    def __init__(self):
        self._dataset: List[DPOPreferencePair] = []

    def harvest_hitl_task(self, task: EscalationTask) -> bool:
        """
        Extracts DPO preference pair from completed practitioner review task.
        """
        if task.status not in ["APPROVED", "MODIFIED"]:
            return False

        chosen = task.modified_response if task.status == "MODIFIED" and task.modified_response else task.proposed_response
        rejected = task.proposed_response if task.status == "MODIFIED" else "I cannot safely assist with this medical request without a doctor."

        pair = DPOPreferencePair(
            pair_id=f"dpo-{task.task_id}",
            patient_id=task.patient_id,
            prompt=task.user_query,
            chosen_response=chosen,
            rejected_response=rejected,
            metadata={
                "confidence_score": task.confidence_score,
                "reasons": task.escalation_reasons,
                "practitioner_notes": task.practitioner_notes
            }
        )
        self._dataset.append(pair)
        logger.info(f"🧠 DPO Pipeline harvested preference pair [{pair.pair_id}] for model fine-tuning.")
        return True

    def export_dataset_for_finetuning(self) -> List[Dict[str, Any]]:
        """Formats collected preferences into standard JSONL DPO dataset format."""
        return [
            {
                "prompt": p.prompt,
                "chosen": p.chosen_response,
                "rejected": p.rejected_response,
                "pair_id": p.pair_id
            }
            for p in self._dataset
        ]

    def get_dataset_size(self) -> int:
        return len(self._dataset)
