"""
healthbot_v4/apps/gateway/timeseries_ingest.py
High-Throughput Wearable Time-Series Ingestion Service for VitalHealth v6.0 Enterprise.
Ingests continuous vitals streams (HR, SpO2, CGM, BP) and emits reactive events to EventBus.
"""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from healthbot_v4.apps.gateway.event_bus import EventBus, HealthEvent
from healthbot_v4.shared.logger.logger import logger


class VitalsStreamPayload(BaseModel):
    patient_id: str
    device_id: str = "apple_watch_series9"
    metric_type: str  # HEART_RATE, SPO2, CGM_GLUCOSE, BP_SYSTOLIC
    value: float
    unit: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TimeSeriesIngestAdapter:
    """
    High-throughput time-series ingest adapter.
    Processes continuous sensor readings and triggers EventBus alerts.
    """

    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus or EventBus.get_instance()

    async def ingest_reading(self, payload: VitalsStreamPayload) -> Dict[str, Any]:
        logger.debug(f"📈 Ingesting Time-Series Vitals: [{payload.metric_type}] = {payload.value} {payload.unit} for {payload.patient_id}")

        alert_triggered = False

        # Threshold checks for reactive event emission
        if payload.metric_type == "HEART_RATE" and payload.value > 120.0:
            alert_triggered = True
            event = HealthEvent(
                patient_id=payload.patient_id,
                event_type="VITALS_HR_SPIKE",
                payload={"hr": payload.value, "unit": payload.unit, "device_id": payload.device_id},
                source_service="timeseries_ingest"
            )
            await self.event_bus.publish(event)

        elif payload.metric_type == "SPO2" and payload.value < 92.0:
            alert_triggered = True
            event = HealthEvent(
                patient_id=payload.patient_id,
                event_type="VITALS_SPO2_DROP",
                payload={"spo2": payload.value, "unit": payload.unit, "device_id": payload.device_id},
                source_service="timeseries_ingest"
            )
            await self.event_bus.publish(event)

        return {
            "status": "ACCEPTED",
            "patient_id": payload.patient_id,
            "metric": payload.metric_type,
            "value": payload.value,
            "alert_triggered": alert_triggered
        }
