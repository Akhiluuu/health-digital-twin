"""
healthbot_v4/apps/notification/lab_biomarker_engine.py
======================================================
Lab Test Fasting & Biomarker Intelligence Engine.
Handles:
1. Fasting Window Countdown Timers (10h water-only fast for Lipid/Fasting Glucose)
2. Out-of-Range Biomarker Alerts & Clinical Action Guidance
"""

from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class LabBiomarkerEngine:
    """Engine for clinical lab test preparation and biomarker tracking."""

    @staticmethod
    def generate_fasting_countdown_alert(
        user_name: str,
        lab_test_name: str,
        scheduled_test_time_iso: str,
        required_fasting_hours: int = 10
    ) -> Dict[str, Any]:
        """Generates exact fasting start countdown alert prior to lab work."""
        name = user_name or "there"
        try:
            test_dt = datetime.fromisoformat(scheduled_test_time_iso)
            fast_start_dt = test_dt - timedelta(hours=required_fasting_hours)
            fast_start_str = fast_start_dt.strftime("%I:%M %p")
        except Exception:
            fast_start_str = "10 PM tonight"

        return {
            "id": str(uuid4()),
            "category": "lab_fasting",
            "priority": "high",
            "title": f"Fasting Required: {lab_test_name} 🩸",
            "body": f"Hey {name}, your {lab_test_name} is scheduled for tomorrow. Water-only fasting must start by {fast_start_str} ({required_fasting_hours}-hour fast).",
            "emoji": "🩸",
            "deepLink": "/(tabs)/vault",
            "actionButtons": [
                {"id": "ack_fast", "title": "Fasting Started 💧", "action": "START_FASTING_TIMER"},
                {"id": "view_prep", "title": "View Lab Prep Guide 📋", "action": "OPEN_VAULT"}
            ],
            "aiRationale": "Clinical Pre-Analytical Lab Preparation Protocol"
        }

    @staticmethod
    def generate_biomarker_alert(
        user_name: str,
        biomarker_name: str,
        value_with_unit: str,
        status: str,  # 'low', 'high', 'critical'
        clinical_advice: str
    ) -> Dict[str, Any]:
        """Generates clinical alert for newly logged biomarker result."""
        name = user_name or "there"
        priority = "high" if status in ["critical", "high"] else "medium"

        return {
            "id": str(uuid4()),
            "category": "lab_fasting",
            "priority": priority,
            "title": f"New Lab Result: {biomarker_name} ({value_with_unit}) 🧪",
            "body": f"Hi {name}, your {biomarker_name} result is marked as {status.upper()} ({value_with_unit}). {clinical_advice}",
            "emoji": "🧪",
            "deepLink": "/(tabs)/vault",
            "actionButtons": [
                {"id": "vault", "title": "View Vault Report 📄", "action": "OPEN_VAULT"},
                {"id": "ai_explain", "title": "Ask AI Doctor 🤖", "action": "OPEN_AI_CHAT"}
            ],
            "aiRationale": "Biomarker Reference Range Outlier Alert"
        }
