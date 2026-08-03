"""
healthbot_v4/apps/brain/summary/summary_engine.py
Health Summary Engine constructing canonical Master Patient Summaries.
"""

from typing import Dict
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState


class HealthSummaryEngine(HealthBrainSubsystem):
    """Subsystem generating human-readable and LLM-ready Master Summaries."""

    _shared_summaries: Dict[str, str] = {}

    def __init__(self):
        super().__init__("health_summary_engine")
        self._summaries = HealthSummaryEngine._shared_summaries

    async def initialize(self) -> None:
        logger.info("📝 Health Summary Engine initialized")

    def build_master_summary(self, state: PatientState) -> str:
        lines = [
            f"=== MASTER HEALTH SUMMARY: {state.patient_id} ===",
            f"Profile: {state.profile.first_name} {state.profile.last_name}, Age {state.profile.age}, {state.profile.biological_sex.value.title()}",
            f"Health Score: {state.current_health_score}/100 | Confidence: {state.overall_confidence}",
        ]

        if state.active_medications:
            meds_str = ", ".join([f"{m.name} ({m.dose_quantity}{m.dosage_form} {m.frequency})" for m in state.active_medications])
            lines.append(f"Active Regimen: {meds_str}")
        else:
            lines.append("Active Regimen: No active medications logged.")

        if state.recent_labs:
            labs_str = ", ".join([f"{l.canonical_name}: {l.value}{l.unit} ({l.classification})" for l in state.recent_labs[:3]])
            lines.append(f"Recent Labs: {labs_str}")

        if state.recent_vitals:
            vitals_str = ", ".join([f"{v.vital_type.replace('_', ' ').title()}: {v.value_primary}{v.unit}" for v in state.recent_vitals[:3]])
            lines.append(f"Recent Vitals: {vitals_str}")

        summary_text = "\n".join(lines)
        self._summaries[state.patient_id] = summary_text
        logger.info(f"Master Summary Rebuilt for Patient {state.patient_id}")
        return summary_text
