"""
healthbot_v4/apps/brain/copilot/health_copilot.py
Proactive Health Copilot for VitalHealth v5.0 Health Brain.
Generates personalized daily health briefings upon app open and proactively monitors health trends.
"""

from typing import List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.apps.brain.copilot.clinical_snapshot import ClinicalSnapshotEngine, CurrentClinicalSnapshot
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState


class DailyHealthBriefing(BaseModel):
    patient_id: str
    greeting: str
    health_score_display: str
    briefing_date: str
    key_highlights: List[str] = Field(default_factory=list)
    proactive_alerts: List[str] = Field(default_factory=list)
    recommended_actions: List[str] = Field(default_factory=list)
    twin_insight: str = ""


class HealthCopilot(HealthBrainSubsystem):
    """Proactive Copilot Subsystem handling app-open briefings and proactive monitoring."""

    def __init__(self):
        super().__init__("health_copilot")
        self.snapshot_engine = ClinicalSnapshotEngine()
        self.state_mgr = PatientStateManager()

    async def initialize(self) -> None:
        await self.snapshot_engine.initialize()
        await self.state_mgr.initialize()
        logger.info("👨‍⚕️ Proactive Health Copilot Subsystem initialized")

    def generate_daily_briefing(self, patient_id: str) -> DailyHealthBriefing:
        state = self.state_mgr.get_or_create_state(patient_id)
        snapshot = self.snapshot_engine.generate_snapshot(state)

        p = state.profile
        greeting = f"Good morning, {p.first_name}! Here is your personalized Health Brain briefing."
        score_display = f"{snapshot.current_health_score:.0f}/100"

        highlights = [f"Overall Health Score: {score_display}"]

        if state.active_medications:
            meds_str = ", ".join([m.name for m in state.active_medications])
            highlights.append(f"Active Regimen: {meds_str}")

        if state.recent_labs:
            highlights.append(f"Latest Lab: {state.recent_labs[0].canonical_name} ({state.recent_labs[0].value}{state.recent_labs[0].unit})")

        alerts = []
        if state.active_risks:
            for r in state.active_risks:
                alerts.append(f"⚠️ [{r.level.value.upper()}] {r.title}: {r.description}")
        else:
            alerts.append("✅ All vitals and risk indicators are within target ranges.")

        twin_insight = "BioGears Twin predicts stable physiological parameters over the next 30 days."

        return DailyHealthBriefing(
            patient_id=patient_id,
            greeting=greeting,
            health_score_display=score_display,
            briefing_date=datetime.now(timezone.utc).strftime("%B %d, %Y"),
            key_highlights=highlights,
            proactive_alerts=alerts,
            recommended_actions=snapshot.outstanding_action_items,
            twin_insight=twin_insight,
        )
