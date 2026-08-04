"""
healthbot_v4/apps/brain/copilot/clinical_snapshot.py
Current Clinical Snapshot Generator for VitalHealth v5.0 Health Brain.
Synthesizes multi-dimensional patient state into a concise clinical foundation.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState


class CurrentClinicalSnapshot(BaseModel):
    patient_id: str
    profile_summary: str
    current_health_score: float
    active_conditions: List[str] = Field(default_factory=list)
    active_medications: List[str] = Field(default_factory=list)
    latest_labs_summary: str
    active_risks_summary: str
    medication_adherence_rate: float = 0.95
    lifestyle_summary: str = "Non-smoker, moderate daily activity."
    twin_prediction_summary: Optional[str] = None
    outstanding_action_items: List[str] = Field(default_factory=list)
    snapshot_timestamp: datetime = Field(default_factory=datetime.utcnow)


class ClinicalSnapshotEngine(HealthBrainSubsystem):
    """Subsystem generating unified clinical snapshots."""

    def __init__(self):
        super().__init__("clinical_snapshot_engine")

    async def initialize(self) -> None:
        logger.info("📸 Clinical Snapshot Generator Subsystem initialized")

    def generate_snapshot(self, state: PatientState, twin_summary: Optional[str] = None) -> CurrentClinicalSnapshot:
        p = state.profile
        profile_str = f"{p.first_name} {p.last_name}, Age {p.age}, {p.biological_sex.value.title()} ({p.height_cm}cm, {p.weight_kg}kg)"

        conditions = [c.condition_name for c in state.current_conditions] if state.current_conditions else ["No documented chronic conditions"]
        meds = [f"{m.name} {m.dosage_form} [{m.frequency}]" if m.dosage_form else f"{m.name} [{m.frequency}]" for m in state.active_medications] if state.active_medications else ["No active medications"]

        labs_str = ", ".join([f"{l.canonical_name}: {l.value}{l.unit} ({l.classification})" for l in state.recent_labs[:3]]) if state.recent_labs else "No recent labs"

        if state.active_risks:
            risks_str = "; ".join([f"[{r.level.value.upper()}] {r.title}" for r in state.active_risks])
            action_items = [r.recommended_action for r in state.active_risks]
        else:
            risks_str = "No active clinical risks flagged"
            action_items = ["Maintain daily vitals logging and routine exercise."]

        return CurrentClinicalSnapshot(
            patient_id=state.patient_id,
            profile_summary=profile_str,
            current_health_score=state.current_health_score,
            active_conditions=conditions,
            active_medications=meds,
            latest_labs_summary=labs_str,
            active_risks_summary=risks_str,
            twin_prediction_summary=twin_summary,
            outstanding_action_items=action_items,
        )
