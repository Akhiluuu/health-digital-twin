"""
healthbot_v4/apps/notification/family_celebration_engine.py
============================================================
Family Social Milestone & Inter-Member Engagement Engine.
Handles:
1. Inter-Family Streak & Goal Achievement Broadcasts
2. 1-Tap Family Reactions (High-Five 👏, Encouragement Nudge)
"""

from __future__ import annotations
import logging
from typing import Dict, Any, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class FamilyCelebrationEngine:
    """Engine for family member milestone celebrations and engagement loops."""

    @staticmethod
    def generate_family_milestone_broadcast(
        member_name: str,
        relationship: str,
        achievement_type: str,  # 'med_streak', 'step_goal', 'twin_score'
        streak_days: int
    ) -> Dict[str, Any]:
        """Generates family milestone celebration broadcast notification."""
        rel_label = f"({relationship})" if relationship else ""

        if achievement_type == "med_streak":
            title = f"Family Milestone: {member_name} {rel_label} 👏"
            body = f"Awesome news! {member_name} achieved a {streak_days}-day perfect 100% medication adherence streak! Tap to send a High-Five!"
            emoji = "🎉"
        elif achievement_type == "step_goal":
            title = f"Step Goal Crushed: {member_name} {rel_label} 👟"
            body = f"{member_name} just smashed their daily 10,000 steps goal! Send some motivation!"
            emoji = "👟"
        else:
            title = f"Health Milestone: {member_name} {rel_label} 🌟"
            body = f"{member_name} completed their health check-in! Keep the momentum going."
            emoji = "🌟"

        return {
            "id": str(uuid4()),
            "category": "family_milestone",
            "priority": "medium",
            "title": title,
            "body": body,
            "emoji": emoji,
            "deepLink": "/(tabs)/index",
            "actionButtons": [
                {"id": "high_five", "title": "Send High-Five 👏", "action": "SEND_HIGH_FIVE"},
                {"id": "cheer", "title": "Send Cheer ❤️", "action": "SEND_CHEER"}
            ],
            "aiRationale": "Family Engagement & Behavioral Social Reinforcement"
        }
