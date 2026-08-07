"""
healthbot_v4/apps/notification/mental_wellness_engine.py
==========================================================
Autonomic Stress & Box-Breathing Micro-Session Engine.
Handles:
1. Acute HRV Stress Spike Detection & 60-Second Box Breathing Micro-Nudge
2. Mindful Evening Reflection & Emotional Well-Being Check-in
"""

from __future__ import annotations
import logging
from typing import Dict, Any, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class MentalWellnessEngine:
    """Engine for autonomic nervous system stress resets and mindfulness."""

    @staticmethod
    def evaluate_stress_spike_trigger(
        user_name: str,
        current_hrv_ms: int,
        baseline_hrv_ms: int,
        is_moving: bool = False
    ) -> Optional[Dict[str, Any]]:
        """Detects acute stress spikes (HRV drop without physical movement) & offers box breathing."""
        if is_moving or baseline_hrv_ms <= 0:
            return None

        drop_pct = int(((baseline_hrv_ms - current_hrv_ms) / baseline_hrv_ms) * 100)
        if drop_pct >= 25:  # Significant acute autonomic stress
            name = user_name or "there"
            return {
                "id": str(uuid4()),
                "category": "stress_reset",
                "priority": "high",
                "title": f"Autonomic Stress Spike Detected (-{drop_pct}%) 🫁",
                "body": f"Hey {name}, your digital twin registered a sudden HRV stress drop. Take 60 seconds for Box Breathing (4s Inhale, 4s Hold, 4s Exhale, 4s Hold) to reset vagal tone! 🧘‍♂️",
                "emoji": "🧘‍♂️",
                "deepLink": "/(tabs)/index",
                "actionButtons": [
                    {"id": "start_breathing", "title": "Start 60s Breathing 🫁", "action": "START_BOX_BREATHING"},
                    {"id": "dismiss", "title": "I'm OK 👍", "action": "DISMISS"}
                ],
                "aiRationale": "Real-Time Autonomic Nervous System Stress Sensor"
            }
        return None

    @staticmethod
    def generate_evening_mindfulness_prompt(user_name: str) -> Dict[str, Any]:
        """Generates evening emotional well-being check-in."""
        name = user_name or "there"
        return {
            "id": str(uuid4()),
            "category": "stress_reset",
            "priority": "low",
            "title": "Evening Wellness Check-In 🌿",
            "body": f"Hi {name}, how are you feeling mentally and physically after today? Log 1 emotion tag to help your AI twin track mood patterns.",
            "emoji": "🌿",
            "deepLink": "/(tabs)/index",
            "actionButtons": [
                {"id": "log_mood", "title": "Log Mood 📝", "action": "LOG_MOOD"}
            ],
            "aiRationale": "Mindful Emotional Well-Being Loop"
        }
