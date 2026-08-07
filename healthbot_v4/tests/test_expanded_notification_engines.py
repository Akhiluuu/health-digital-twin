"""
healthbot_v4/tests/test_expanded_notification_engines.py
=========================================================
Unit tests for Expanded Sleep Circadian, Lab Biomarker, Mental Stress,
and Family Celebration Engines.
"""

import pytest
from healthbot_v4.apps.notification.sleep_circadian_engine import SleepCircadianEngine
from healthbot_v4.apps.notification.lab_biomarker_engine import LabBiomarkerEngine
from healthbot_v4.apps.notification.mental_wellness_engine import MentalWellnessEngine
from healthbot_v4.apps.notification.family_celebration_engine import FamilyCelebrationEngine


def test_sleep_debt_and_wind_down_eval():
    candidates = SleepCircadianEngine.evaluate_sleep_debt_and_wind_down(
        user_name="Akhil",
        avg_sleep_hours_3d=5.5
    )
    assert len(candidates) >= 1
    categories = [c["category"] for c in candidates]
    assert "sleep_circadian" in categories
    assert "Sleep Debt Alert" in candidates[0]["title"]


def test_morning_readiness_brief():
    brief = SleepCircadianEngine.generate_morning_readiness_brief(
        user_name="Akhil",
        sleep_efficiency_pct=88,
        hrv_ms=56
    )
    assert "Morning Readiness: Optimal" in brief["title"]
    assert "88%" in brief["body"]


def test_lab_fasting_countdown_alert():
    alert = LabBiomarkerEngine.generate_fasting_countdown_alert(
        user_name="Akhil",
        lab_test_name="Lipid Profile & Fasting Glucose",
        scheduled_test_time_iso="2026-08-10T08:00:00Z",
        required_fasting_hours=10
    )
    assert "Lipid Profile" in alert["title"]
    assert alert["priority"] == "high"


def test_biomarker_outlier_alert():
    alert = LabBiomarkerEngine.generate_biomarker_alert(
        user_name="Akhil",
        biomarker_name="HbA1c",
        value_with_unit="6.8%",
        status="high",
        clinical_advice="Schedule diet consultation to manage glycemic levels."
    )
    assert "HbA1c" in alert["title"]
    assert "HIGH" in alert["body"]


def test_stress_spike_trigger():
    res = MentalWellnessEngine.evaluate_stress_spike_trigger(
        user_name="Akhil",
        current_hrv_ms=30,
        baseline_hrv_ms=50,
        is_moving=False
    )
    assert res is not None
    assert "Autonomic Stress Spike Detected" in res["title"]
    assert res["priority"] == "high"


def test_family_milestone_broadcast():
    broadcast = FamilyCelebrationEngine.generate_family_milestone_broadcast(
        member_name="Mom",
        relationship="Mother",
        achievement_type="med_streak",
        streak_days=7
    )
    assert "Mom (Mother)" in broadcast["title"]
    assert "7-day perfect" in broadcast["body"]
