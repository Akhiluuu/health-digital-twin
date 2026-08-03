"""
healthbot_v4/apps/brain/timeline/event_stream.py
Immutable chronological event stream logger for patient medical events.
"""

from typing import List, Dict, Any
from datetime import datetime
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import TimelineEvent, TimelineEventType


class MedicalTimelineEngine(HealthBrainSubsystem):
    """Subsystem managing immutable chronological patient timelines."""

    _shared_timeline: Dict[str, List[TimelineEvent]] = {}

    def __init__(self):
        super().__init__("medical_timeline")
        self._timeline = MedicalTimelineEngine._shared_timeline

    async def initialize(self) -> None:
        logger.info("📅 Medical Timeline Engine initialized")

    def record_event(
        self, patient_id: str, event_type: TimelineEventType, title: str, description: str, payload: Dict[str, Any] = None
    ) -> TimelineEvent:
        if patient_id not in self._timeline:
            self._timeline[patient_id] = []

        event = TimelineEvent(
            event_id=f"evt_{int(datetime.utcnow().timestamp())}",
            patient_id=patient_id,
            event_type=event_type,
            title=title,
            description=description,
            payload=payload or {},
        )

        self._timeline[patient_id].insert(0, event)
        logger.info(f"Timeline Recorded: [{event_type.value}] for {patient_id}: {title}")
        return event

    def get_timeline(self, patient_id: str, limit: int = 20) -> List[TimelineEvent]:
        return self._timeline.get(patient_id, [])[:limit]
