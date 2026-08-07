"""
healthbot_v4/apps/notification/behavioral_nudge_engine.py
===========================================================
Behavioral Habit Nudge & BioGears Digital Twin Trigger Engine.
Handles:
1. BJ Fogg Habit-Stacking Micro-Nudges (pairing daily habits with health tasks)
2. Circadian Hydration & Sedentary Posture Alerts
3. BioGears Dynamic Physiological Simulation Triggers (Glucose drift, SpO2, HRV)
"""

from __future__ import annotations
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class BehavioralNudgeEngine:
    """Engine for generating behavioral habit nudges and twin simulation alerts."""

    @staticmethod
    def evaluate_biogears_simulation_triggers(
        user_name: str,
        simulated_metrics: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Evaluates BioGears Digital Twin simulation results for vital drifts and generates proactive alerts.
        """
        alerts = []
        name = user_name or "there"

        # 1. Glucose Drift Prediction
        predicted_glucose_peak = simulated_metrics.get("predicted_glucose_peak")
        if predicted_glucose_peak and predicted_glucose_peak > 160:
            alerts.append({
                "id": str(uuid4()),
                "category": "digital_twin",
                "priority": "medium",
                "title": "BioGears Glucose Twin Alert 📈",
                "body": f"Hey {name}! Your glucose twin predicts a peak of {predicted_glucose_peak} mg/dL post-meal. A 10-minute walk right now will lower your predicted peak by 28 mg/dL! 🏃‍♂️",
                "emoji": "🤖",
                "deepLink": "/(tabs)/twin",
                "actionButtons": [
                    {"id": "walk", "title": "Log 10m Walk 👟", "action": "LOG_ACTIVITY"},
                    {"id": "twin", "title": "View Simulation 📊", "action": "OPEN_TWIN"}
                ],
                "aiRationale": "BioGears Physiological Trajectory Simulation"
            })

        # 2. Oxygen Saturation (SpO2) Drift
        predicted_spo2 = simulated_metrics.get("predicted_spo2")
        if predicted_spo2 and predicted_spo2 < 94:
            alerts.append({
                "id": str(uuid4()),
                "category": "vitals",
                "priority": "high",
                "title": "SpO₂ Trend Warning 🫁",
                "body": f"Notice: Oxygen saturation trend is projected at {predicted_spo2}%. Please sit upright, do 5 deep breaths, and log your current SpO₂.",
                "emoji": "🫁",
                "deepLink": "/(tabs)/twin",
                "actionButtons": [
                    {"id": "vitals", "title": "Log Vitals 🩺", "action": "LOG_VITALS"},
                    {"id": "ai", "title": "Ask AI Assistant 🤖", "action": "OPEN_AI_CHAT"}
                ],
                "aiRationale": "Hypoxia Trajectory Monitor"
            })

        # 3. Resting Heart Rate Elevation
        resting_hr_delta = simulated_metrics.get("resting_hr_delta")
        if resting_hr_delta and resting_hr_delta >= 6:
            alerts.append({
                "id": str(uuid4()),
                "category": "vitals",
                "priority": "medium",
                "title": "Heart Rate Shift Detected ❤️",
                "body": f"Hey {name}, your resting heart rate is {resting_hr_delta} bpm above your 7-day average. Take a 2-minute relaxation break.",
                "emoji": "❤️",
                "deepLink": "/(tabs)/index",
                "actionButtons": [
                    {"id": "scan", "title": "Take PPG Bio-Scan 🩺", "action": "OPEN_PPG_SCANNER"}
                ],
                "aiRationale": "Autonomic Nervous System Strain Detector"
            })

        return alerts

    @staticmethod
    def generate_habit_stacking_nudges(
        user_name: str,
        steps_today: int,
        hydration_today_ml: int,
        temperature_c: float = 28.0
    ) -> List[Dict[str, Any]]:
        """
        Generates micro-nudges using habit stacking and environmental anchors.
        """
        nudges = []
        name = user_name or "there"

        # 1. Hydration Weather + Movement Anchor
        target_hydration = 2500 if temperature_c > 30 else 2000
        if hydration_today_ml < (target_hydration * 0.4) and datetime.now().hour >= 14:
            nudges.append({
                "id": str(uuid4()),
                "category": "hydration",
                "priority": "medium",
                "title": f"Hydration Check ({hydration_today_ml}ml / {target_hydration}ml) 💧",
                "body": f"Hey {name}! High temp today ({temperature_c}°C). Grab a glass of water right now to keep your focus & digital twin hydrated! 🥤",
                "emoji": "💧",
                "deepLink": "/hydration",
                "actionButtons": [
                    {"id": "drink", "title": "+250ml Water 💧", "action": "LOG_HYDRATION_250"}
                ],
                "aiRationale": "Environmental & Circadian Hydration Engine"
            })

        # 2. Sedentary Posture Stretch Anchor
        if datetime.now().hour in [11, 15, 17]:
            nudges.append({
                "id": str(uuid4()),
                "category": "activity",
                "priority": "low",
                "title": "2-Minute Spine & Stretch Break! 🧘‍♂️",
                "body": f"You've been crushing work, {name}! Stand up, roll your shoulders, and stretch your spine for 120 seconds.",
                "emoji": "🧘‍♂️",
                "deepLink": "/(tabs)/index",
                "actionButtons": [
                    {"id": "stretched", "title": "Done! ⚡", "action": "DISMISS"}
                ],
                "aiRationale": "Posture & Ergo-Circadian Nudge"
            })

        return nudges
