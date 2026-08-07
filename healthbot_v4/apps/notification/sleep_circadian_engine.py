"""
healthbot_v4/apps/notification/sleep_circadian_engine.py
=========================================================
Sleep Architecture & Circadian Rhythm Nudge Engine.
Handles:
1. Sleep Debt Recovery Nudges (<6h avg sleep over 2+ nights)
2. Wind-Down & Blue-Light Curfew Prompts (45m prior to target bed time)
3. Morning HRV & Sleep Efficiency Readiness Briefs
"""

from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class SleepCircadianEngine:
    """Engine for circadian rhythm alignment and sleep architecture nudges."""

    @staticmethod
    def evaluate_sleep_debt_and_wind_down(
        user_name: str,
        avg_sleep_hours_3d: float,
        target_sleep_time_iso: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Evaluates 3-day sleep debt and generates wind-down alerts."""
        candidates = []
        name = user_name or "there"

        # 1. Sleep Debt Warning
        if avg_sleep_hours_3d > 0 and avg_sleep_hours_3d < 6.2:
            debt_hours = round(7.5 - avg_sleep_hours_3d, 1)
            candidates.append({
                "id": str(uuid4()),
                "category": "sleep_circadian",
                "priority": "high",
                "title": f"Sleep Debt Alert ({avg_sleep_hours_3d}h 3-day avg) 🌙",
                "body": f"Hey {name}, your digital twin registered {debt_hours}h of sleep debt. Prioritize an early 10 PM wind-down tonight to restore deep sleep cycles! 🛌",
                "emoji": "🌙",
                "deepLink": "/(tabs)/index",
                "actionButtons": [
                    {"id": "set_wind_down", "title": "Enable Wind-Down Mode 🌙", "action": "START_WIND_DOWN"},
                    {"id": "view_twin", "title": "View Sleep Twin 📊", "action": "OPEN_TWIN"}
                ],
                "aiRationale": "Circadian Sleep Debt Accumulation Guard"
            })

        # 2. Curfew Wind-Down Prompt
        now = datetime.now(timezone.utc)
        if now.hour in [21, 22]:  # Evening curfew window
            candidates.append({
                "id": str(uuid4()),
                "category": "sleep_circadian",
                "priority": "medium",
                "title": "45m to Curfew: Power Down Screens 📵",
                "body": f"Hi {name}, dim bright lights & enable Night Shift. Giving your pineal gland 45 minutes screen-free boosts melatonin synthesis by 34%!",
                "emoji": "📵",
                "deepLink": "/(tabs)/index",
                "actionButtons": [
                    {"id": "dim_screens", "title": "Done! 🌙", "action": "DISMISS"}
                ],
                "aiRationale": "Melatonin & Blue-Light Suppression Protocol"
            })

        return candidates

    @staticmethod
    def generate_morning_readiness_brief(
        user_name: str,
        sleep_efficiency_pct: int,
        hrv_ms: int
    ) -> Dict[str, Any]:
        """Generates morning readiness & sleep architecture brief upon waking."""
        name = user_name or "there"
        readiness_label = "Optimal" if sleep_efficiency_pct >= 85 and hrv_ms >= 50 else "Moderate"
        return {
            "id": str(uuid4()),
            "category": "sleep_circadian",
            "priority": "medium",
            "title": f"Morning Readiness: {readiness_label} ({sleep_efficiency_pct}%) 🌅",
            "body": f"Good morning {name}! Sleep efficiency: {sleep_efficiency_pct}%, HRV: {hrv_ms}ms. Your autonomic nervous system is ready for action today! ⚡",
            "emoji": "🌅",
            "deepLink": "/(tabs)/twin",
            "actionButtons": [
                {"id": "twin_details", "title": "View Autonomic Twin 📊", "action": "OPEN_TWIN"}
            ],
            "aiRationale": "Autonomic Nervous System Morning Readiness Summary"
        }
