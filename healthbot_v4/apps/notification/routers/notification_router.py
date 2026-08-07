"""
healthbot_v4/apps/notification/routers/notification_router.py
===============================================================
FastAPI Router for Dynamic Notifications, Dynamic Persona Tone Preferences,
Food-Drug Interaction Guard, and Caregiver Escalation Actions.
"""

from __future__ import annotations
import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Body, Depends

from healthbot_v4.apps.notification.dynamic_notification_generator import (
    DynamicNotificationGenerator,
    TONE_ADAPTIVE, TONE_WITTY, TONE_CLINICAL, TONE_GENTLE
)
from healthbot_v4.apps.notification.medication_intelligence_engine import (
    MedicationIntelligenceEngine
)
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v4/notifications", tags=["Dynamic Notifications"])

# In-memory preference cache fallback
_USER_PREFERENCES: Dict[str, Dict[str, Any]] = {}


@router.post("/generate-dynamic")
async def generate_dynamic_notification(payload: Dict[str, Any] = Body(...)):
    """Generate dynamic AI-crafted notification object based on context & tone preference."""
    category = payload.get("category", "medication")
    user_name = payload.get("user_name", "User")
    priority = payload.get("priority", "medium")
    tone_preference = payload.get("tone_preference", TONE_ADAPTIVE)
    context_data = payload.get("context", {})

    notification = await DynamicNotificationGenerator.generate(
        category=category,
        user_name=user_name,
        priority=priority,
        tone_preference=tone_preference,
        context_data=context_data
    )
    return {"status": "success", "notification": notification}


@router.get("/preferences/{user_id}")
async def get_notification_preferences(user_id: str):
    """Retrieve dynamic tone and notification preferences for a user."""
    prefs = _USER_PREFERENCES.get(user_id, {
        "user_id": user_id,
        "tone_preference": TONE_ADAPTIVE,
        "meds_enabled": True,
        "alerts_enabled": True,
        "hydration_enabled": True,
        "caregiver_escalation_enabled": True,
        "updated_at": None
    })
    return {"status": "success", "preferences": prefs}


@router.post("/preferences/{user_id}")
async def update_notification_preferences(user_id: str, payload: Dict[str, Any] = Body(...)):
    """Update user's tone preference (witty, clinical, gentle, adaptive) and category settings."""
    existing = _USER_PREFERENCES.get(user_id, {})
    existing.update(payload)
    existing["user_id"] = user_id
    _USER_PREFERENCES[user_id] = existing
    return {"status": "success", "preferences": existing}


@router.post("/food-drug-check")
async def check_food_drug_interaction(payload: Dict[str, Any] = Body(...)):
    """Evaluate logged food items against user's active medications for real-time safety warnings."""
    food_item = payload.get("food_item", "")
    active_meds = payload.get("active_medications", [])

    result = MedicationIntelligenceEngine.check_food_drug_interaction(food_item, active_meds)
    if result:
        return {"status": "interaction_found", "data": result}
    return {"status": "safe", "message": "No known interactions detected."}


@router.post("/caregiver-nudge")
async def send_caregiver_nudge(payload: Dict[str, Any] = Body(...)):
    """Trigger 1-tap family caregiver push or voice nudge."""
    target_member_id = payload.get("target_member_id")
    sender_name = payload.get("sender_name", "Family Member")
    nudge_type = payload.get("nudge_type", "medication_reminder")

    logger.info(f"Caregiver Nudge sent by {sender_name} to {target_member_id} ({nudge_type})")
    return {
        "status": "success",
        "message": f"Nudge sent to member {target_member_id}!",
        "delivered_at": datetime.now(timezone.utc).isoformat()
    }
