"""
healthbot_v4/apps/gateway/event_bus.py
Asynchronous Event Bus Engine for VitalHealth v6.0 Enterprise.
Enables event-driven reactive healthcare workflows (Redis Streams / In-Memory PubSub).
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Callable, Awaitable, Optional
from pydantic import BaseModel, Field
from healthbot_v4.shared.logger.logger import logger


class HealthEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    event_type: str  # e.g., "VITALS_HR_SPIKE", "LAB_REPORT_PARSED", "MEDICATION_MISSED"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: Dict[str, Any] = Field(default_factory=dict)
    source_service: str = "gateway"
    state_version: int = 1


EventHandler = Callable[[HealthEvent], Awaitable[None]]


class EventBus:
    """
    Enterprise Event Bus for VitalHealth Health OS.
    Supports in-memory asynchronous pub/sub dispatching with Redis Streams adapter readiness.
    """

    _instance: Optional["EventBus"] = None

    def __init__(self):
        self._subscribers: Dict[str, List[EventHandler]] = {}
        self._event_history: List[HealthEvent] = []

    @classmethod
    def get_instance(cls) -> "EventBus":
        if cls._instance is None:
            cls._instance = EventBus()
        return cls._instance

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        """Subscribe an async handler function to a specific health event type."""
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.info(f"📢 Subscribed handler '{handler.__name__}' to event '{event_type}'")

    async def publish(self, event: HealthEvent) -> None:
        """Publish a health event asynchronously to all registered subscribers."""
        logger.info(f"⚡ Publishing Health Event: [{event.event_type}] for patient {event.patient_id} (ID: {event.event_id})")
        self._event_history.append(event)
        
        # Keep rolling history buffer
        if len(self._event_history) > 1000:
            self._event_history = self._event_history[-1000:]

        handlers = self._subscribers.get(event_type := event.event_type, [])
        wildcard_handlers = self._subscribers.get("*", [])

        all_handlers = handlers + wildcard_handlers
        if not all_handlers:
            logger.debug(f"No active subscribers for event type '{event_type}'")
            return

        tasks = [asyncio.create_task(h(event)) for h in all_handlers]
        await asyncio.gather(*tasks, return_exceptions=True)

    def get_history(self, patient_id: str, limit: int = 50) -> List[HealthEvent]:
        """Retrieves recent event history for a patient."""
        filtered = [e for e in self._event_history if e.patient_id == patient_id]
        return filtered[-limit:]
