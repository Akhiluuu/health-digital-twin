"""
healthbot_v4/tests/test_dynamic_notifications.py
================================────────────────==
Unit tests for AI Dynamic Notification Engine & Medication Intelligence.
"""

import pytest
import asyncio
from healthbot_v4.apps.notification.dynamic_notification_generator import (
    DynamicNotificationGenerator, TONE_WITTY, TONE_CLINICAL, TONE_GENTLE, TONE_ADAPTIVE
)
from healthbot_v4.apps.notification.medication_intelligence_engine import (
    MedicationIntelligenceEngine
)
from healthbot_v4.apps.notification.behavioral_nudge_engine import (
    BehavioralNudgeEngine
)
from healthbot_v4.apps.notification.clinical_care_team_engine import (
    ClinicalCareTeamEngine
)


@pytest.mark.asyncio
async def test_dynamic_notification_generation_witty():
    res = await DynamicNotificationGenerator.generate(
        category="medication",
        user_name="Akhil",
        priority="medium",
        tone_preference=TONE_WITTY,
        context_data={"medicine_name": "Metformin", "dose": "500mg"}
    )
    assert res["status"] if "status" in res else True
    assert "Metformin" in res["body"] or "Metformin" in res["title"]
    assert res["tone"] == TONE_WITTY
    assert len(res["actionButtons"]) > 0


@pytest.mark.asyncio
async def test_dynamic_notification_generation_clinical():
    res = await DynamicNotificationGenerator.generate(
        category="medication",
        user_name="Akhil",
        priority="high",
        tone_preference=TONE_CLINICAL,
        context_data={"medicine_name": "Metformin", "dose": "500mg"}
    )
    assert res["tone"] == TONE_CLINICAL
    assert "Metformin" in res["body"] or "Metformin" in res["title"]


def test_food_drug_interaction():
    res = MedicationIntelligenceEngine.check_food_drug_interaction("Grapefruit juice", ["Atorvastatin 20mg"])
    assert res is not None
    assert res["has_interaction"] is True
    assert res["severity"] == "high"


def test_pill_refill_warning():
    res = MedicationIntelligenceEngine.calculate_refill_warning(current_pill_count=3, daily_dosage_count=1.0)
    assert res["should_warn"] is True
    assert res["days_left"] == 3


def test_biogears_simulation_triggers():
    alerts = BehavioralNudgeEngine.evaluate_biogears_simulation_triggers(
        user_name="Akhil",
        simulated_metrics={"predicted_glucose_peak": 185, "predicted_spo2": 92}
    )
    assert len(alerts) >= 2
    categories = [a["category"] for a in alerts]
    assert "digital_twin" in categories
    assert "vitals" in categories


def test_clinical_care_team_engine():
    alert = ClinicalCareTeamEngine.generate_appointment_prep_alert(
        user_name="Akhil",
        doctor_name="Smith",
        specialty="Cardiology",
        appointment_date_iso="2026-08-10T10:00:00Z"
    )
    assert "Dr. Smith" in alert["title"]
    assert alert["priority"] == "high"


@pytest.mark.asyncio
async def test_dynamic_notification_fallback_robustness():
    res = await DynamicNotificationGenerator.generate(
        category="unknown_category",
        user_name="Akhil",
        priority="low",
        tone_preference="custom_tone",
        context_data={}
    )
    assert res["title"] is not None
    assert res["body"] is not None

