"""
healthbot_v4/apps/brain/journey/action_engine.py
Proactive Health Journey Action Engine for VitalHealth v5.0 Health Brain.
Extracts actionable clinical recommendations from AI assistant responses
and automatically schedules mobile reminders, vitals log tasks, and appointment items.
"""

import time
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class ProactiveHealthAction(BaseModel):
    action_id: str
    patient_id: str
    category: str  # "VITALS_LOG", "MEDICATION_ADHERENCE", "DOCTOR_APPOINTMENT", "LIFESTYLE_HABIT"
    title: str
    description: str
    priority: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    suggested_time: str = "Today"
    is_completed: bool = False


class ProactiveActionEngine(HealthBrainSubsystem):
    """
    Proactive Health Journey Action Engine.
    Converts AI response recommendations into actionable health journey tasks.
    """

    def __init__(self):
        super().__init__("proactive_action_engine")
        self.actions_generated_count: int = 0

    async def initialize(self) -> None:
        logger.info("📋 Proactive Health Journey Action Engine initialized")

    def extract_proactive_actions(
        self,
        patient_id: str,
        response_text: str,
        query: str
    ) -> List[ProactiveHealthAction]:
        """
        Parses assistant output to identify clinical recommendations.
        Returns list of structured ProactiveHealthAction objects.
        """
        start = time.time()
        actions: List[ProactiveHealthAction] = []

        text_low = response_text.lower()
        q_low = query.lower()

        # 1. Vitals Log Task Extraction
        if any(w in text_low or w in q_low for w in ["glucose", "blood pressure", "bp", "vitals", "heart rate", "hba1c"]):
            if "log" in text_low or "check" in text_low or "track" in text_low or "measure" in text_low:
                action_id = f"act_vitals_{int(time.time()*1000)}"
                actions.append(
                    ProactiveHealthAction(
                        action_id=action_id,
                        patient_id=patient_id,
                        category="VITALS_LOG",
                        title="Log Current Vitals",
                        description="Log your current blood pressure, heart rate, or blood glucose levels in VitalHealth.",
                        priority="HIGH",
                        suggested_time="Within 2 hours"
                    )
                )

        # 2. Medication Adherence Task
        if any(w in text_low for w in ["medication", "pill", "dose", "metformin", "lisinopril", "prescribed"]):
            if "take" in text_low or "adherence" in text_low or "schedule" in text_low:
                action_id = f"act_med_{int(time.time()*1000)}"
                actions.append(
                    ProactiveHealthAction(
                        action_id=action_id,
                        patient_id=patient_id,
                        category="MEDICATION_ADHERENCE",
                        title="Verify Medication Schedule",
                        description="Ensure your active medications are taken as prescribed by your physician.",
                        priority="HIGH",
                        suggested_time="Daily"
                    )
                )

        # 3. Doctor Appointment Task
        if any(w in text_low for w in ["consult your doctor", "physician", "appointment", "schedule", "primary care"]):
            action_id = f"act_appt_{int(time.time()*1000)}"
            actions.append(
                ProactiveHealthAction(
                    action_id=action_id,
                    patient_id=patient_id,
                    category="DOCTOR_APPOINTMENT",
                    title="Schedule Doctor Follow-up",
                    description="Consult your healthcare provider for clinical evaluation of discussed symptoms.",
                    priority="MEDIUM",
                    suggested_time="This week"
                )
            )

        # 4. Lifestyle / Hydration Task
        if any(w in text_low for w in ["hydrate", "water", "exercise", "walk", "diet", "sleep"]):
            action_id = f"act_life_{int(time.time()*1000)}"
            actions.append(
                ProactiveHealthAction(
                    action_id=action_id,
                    patient_id=patient_id,
                    category="LIFESTYLE_HABIT",
                    title="Maintain Healthy Daily Habits",
                    description="Stay hydrated with 2.0-2.5L water daily and engage in moderate physical activity.",
                    priority="LOW",
                    suggested_time="Daily"
                )
            )

        self.actions_generated_count += len(actions)
        elapsed_ms = (time.time() - start) * 1000.0

        if actions:
            logger.info(f"📋 Generated {len(actions)} Proactive Health Action(s) for patient {patient_id} in {elapsed_ms:.2f}ms")

        return actions

    def get_stats(self) -> Dict[str, Any]:
        """Returns action engine telemetry."""
        return {
            "actions_generated_count": self.actions_generated_count,
            "status": "ACTIVE_ACTION_ENGINE"
        }
