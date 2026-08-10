"""
healthbot_v4/apps/notification/biometric_calorie_recalibrator.py
===================================================================
Live Biometric Calorie Target Recalibration Engine.
Dynamically adjusts patient calorie targets and macro allowances (Protein, Carbs, Fat)
in real time based on step counts and PPG heart rate telemetry.
"""

from __future__ import annotations
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class BiometricCalorieRecalibrator:
    """Calculates active burn and recalibrates daily nutrition targets."""

    @staticmethod
    def recalibrate_targets(
        user_id: str,
        profile: Optional[Dict[str, Any]] = None,
        steps: int = 0,
        heart_rate: Optional[float] = None,
        resting_hr: float = 70.0
    ) -> Dict[str, Any]:
        """
        Recalculates daily calories and macro allowances from live telemetry.
        """
        profile = profile or {}
        weight_kg = float(profile.get("weight_kg") or 70.0)
        height_cm = float(profile.get("height_cm") or 175.0)
        age = float(profile.get("age") or 30.0)
        sex = str(profile.get("sex") or "male").lower()

        # Step 1: Calculate Mifflin-St Jeor Basal Metabolic Rate (BMR)
        if sex == "female":
            bmr = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age) - 161.0
        else:
            bmr = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age) + 5.0

        base_maintenance = round(bmr * 1.2, 1)

        # Base macro distribution (50% Carbs, 25% Protein, 25% Fat)
        base_carbs_g = round((base_maintenance * 0.50) / 4.0, 1)
        base_protein_g = round((base_maintenance * 0.25) / 4.0, 1)
        base_fat_g = round((base_maintenance * 0.25) / 9.0, 1)

        # Step 2: Step Counter Active Burn (0.04 kcal per step average)
        step_calories = round(max(0, steps) * 0.04, 1)

        # Step 3: PPG Heart Rate Telemetry Elevation Burn
        hr_calories = 0.0
        hr_status = "resting"
        if heart_rate and heart_rate > resting_hr:
            elevation = heart_rate - resting_hr
            # Scaled active metabolic equivalent based on HR elevation
            hr_calories = round(elevation * 2.2, 1)
            if elevation > 30:
                hr_status = "vigorous_exercise"
            elif elevation > 15:
                hr_status = "moderate_exercise"
            else:
                hr_status = "light_activity"

        total_active_burn = round(step_calories + hr_calories, 1)
        recalibrated_total_calories = round(base_maintenance + total_active_burn, 1)

        # Dynamic Macro Allowances (Active calories replenish 55% Carbs, 25% Protein, 20% Fat)
        extra_carbs_g = round((total_active_burn * 0.55) / 4.0, 1)
        extra_protein_g = round((total_active_burn * 0.25) / 4.0, 1)
        extra_fat_g = round((total_active_burn * 0.20) / 9.0, 1)

        recalibrated_carbs_g = round(base_carbs_g + extra_carbs_g, 1)
        recalibrated_protein_g = round(base_protein_g + extra_protein_g, 1)
        recalibrated_fat_g = round(base_fat_g + extra_fat_g, 1)

        return {
            "status": "success",
            "user_id": user_id,
            "telemetry_inputs": {
                "steps": steps,
                "heart_rate_bpm": heart_rate,
                "resting_hr_bpm": resting_hr,
                "hr_activity_status": hr_status
            },
            "base_metabolic_profile": {
                "bmr_kcal": round(bmr, 1),
                "base_maintenance_kcal": base_maintenance,
                "base_carbs_g": base_carbs_g,
                "base_protein_g": base_protein_g,
                "base_fat_g": base_fat_g
            },
            "active_burn_breakdown": {
                "step_burn_kcal": step_calories,
                "ppg_heart_rate_burn_kcal": hr_calories,
                "total_active_burn_kcal": total_active_burn
            },
            "recalibrated_daily_targets": {
                "total_calories_kcal": recalibrated_total_calories,
                "carbs_g": recalibrated_carbs_g,
                "protein_g": recalibrated_protein_g,
                "fat_g": recalibrated_fat_g,
                "extra_carbs_allowance_g": extra_carbs_g,
                "extra_protein_allowance_g": extra_protein_g,
                "extra_fat_allowance_g": extra_fat_g
            }
        }
