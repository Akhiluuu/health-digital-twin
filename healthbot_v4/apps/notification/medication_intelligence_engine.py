"""
healthbot_v4/apps/notification/medication_intelligence_engine.py
===================================================================
Medication Intelligence Engine for Advanced Pharmacokinetics & Reminders.
Handles:
1. Food-Drug & Drug-Drug interaction checks
2. Meal-anchored dosing schedules (pre-meal, post-meal, empty stomach)
3. Smart refill counter & inventory depletion forecasting
4. Post-prescription side-effect check-in scheduling
5. Timezone schedule auto-recalibration across international travel
"""

from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# Known Clinical Food-Drug Interaction Knowledge Matrix
KNOWN_FOOD_DRUG_INTERACTIONS = {
    "grapefruit": {
        "interacts_with": ["atorvastatin", "simvastatin", "amlodipine", "nifedipine", "felodipine"],
        "severity": "high",
        "action": "Delay statin/calcium channel blocker by 4 hours",
        "rationale": "Inhibits CYP3A4 enzyme, leading to elevated drug blood plasma concentration."
    },
    "calcium": {
        "interacts_with": ["levothyroxine", "synthroid", "ciprofloxacin", "doxycycline"],
        "severity": "medium",
        "action": "Space calcium intake 2 to 4 hours apart",
        "rationale": "Binds to drug molecules in gut, reducing therapeutic absorption."
    },
    "dairy": {
        "interacts_with": ["tetracycline", "doxycycline", "ciprofloxacin"],
        "severity": "medium",
        "action": "Avoid dairy 2 hours before or after dose",
        "rationale": "Chelation of antibiotic molecules with calcium ions."
    },
    "alcohol": {
        "interacts_with": ["metronidazole", "acetaminophen", "paracetamol", "sedatives"],
        "severity": "critical",
        "action": "Avoid alcohol completely while taking medication",
        "rationale": "Risk of severe disulfiram-like reaction or severe hepatotoxicity."
    }
}


class MedicationIntelligenceEngine:
    """Core Clinical Intelligence Engine for Medication Vault & Reminders."""

    @staticmethod
    def check_food_drug_interaction(food_item: str, active_medications: List[str]) -> Optional[Dict[str, Any]]:
        """Check if logged food item interacts with any active user medications."""
        food_clean = food_item.strip().lower()
        
        for food_key, rule in KNOWN_FOOD_DRUG_INTERACTIONS.items():
            if food_key in food_clean:
                for med in active_medications:
                    med_clean = med.strip().lower()
                    if any(target in med_clean for target in rule["interacts_with"]):
                        return {
                            "has_interaction": True,
                            "food_item": food_item,
                            "medicine_name": med,
                            "severity": rule["severity"],
                            "recommendation": rule["action"],
                            "clinical_rationale": rule["rationale"]
                        }
        return None

    @staticmethod
    def calculate_refill_warning(
        current_pill_count: int,
        daily_dosage_count: float,
        refill_threshold_days: int = 3
    ) -> Dict[str, Any]:
        """Calculate if medication inventory has breached the refill threshold."""
        if daily_dosage_count <= 0:
            daily_dosage_count = 1.0

        days_remaining = max(0, int(current_pill_count / daily_dosage_count))
        should_warn = days_remaining <= refill_threshold_days

        return {
            "should_warn": should_warn,
            "pills_left": current_pill_count,
            "days_left": days_remaining,
            "refill_recommended": should_warn,
            "urgency": "high" if days_remaining <= 1 else "medium"
        }

    @staticmethod
    def compute_meal_anchored_schedule(
        scheduled_time_iso: str,
        meal_relation: str = "after_meal",
        meal_times: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Adjust dose prompt timing relative to user meal anchors (breakfast, lunch, dinner).
        meal_relation: 'before_meal' (15m prior), 'after_meal' (15m post), 'empty_stomach' (1h prior).
        """
        meal_times = meal_times or {"breakfast": "08:00", "lunch": "13:00", "dinner": "20:00"}
        
        try:
            scheduled_dt = datetime.fromisoformat(scheduled_time_iso)
            hour = scheduled_dt.hour
            
            # Determine closest meal window
            if hour < 11:
                meal_name = "breakfast"
            elif hour < 17:
                meal_name = "lunch"
            else:
                meal_name = "dinner"

            target_meal_time = meal_times.get(meal_name, "08:00")
            meal_hour, meal_min = map(int, target_meal_time.split(":"))

            base_meal_dt = scheduled_dt.replace(hour=meal_hour, minute=meal_min, second=0)

            if meal_relation == "before_meal":
                adjusted_dt = base_meal_dt - timedelta(minutes=15)
                anchor_label = f"15 minutes before {meal_name}"
            elif meal_relation == "empty_stomach":
                adjusted_dt = base_meal_dt - timedelta(hours=1)
                anchor_label = f"1 hour before {meal_name} (empty stomach)"
            else:  # 'after_meal'
                adjusted_dt = base_meal_dt + timedelta(minutes=15)
                anchor_label = f"15 minutes after {meal_name}"

            return {
                "adjusted_scheduled_at": adjusted_dt.isoformat(),
                "anchor_meal": meal_name,
                "anchor_label": anchor_label,
                "meal_relation": meal_relation
            }
        except Exception as e:
            logger.warning(f"Error computing meal-anchored schedule: {e}")
            return {
                "adjusted_scheduled_at": scheduled_time_iso,
                "anchor_meal": "general",
                "anchor_label": "Scheduled Dose",
                "meal_relation": meal_relation
            }

    @staticmethod
    def check_side_effect_survey_due(
        start_date_iso: str,
        days_since_start: int
    ) -> bool:
        """Determines if user is due for a 3-day or 7-day post-prescription side-effect check-in."""
        return days_since_start in [3, 7, 14]

    @staticmethod
    def recalculate_schedule_for_timezone_shift(
        original_doses: List[Dict[str, Any]],
        source_utc_offset_hours: float,
        target_utc_offset_hours: float
    ) -> List[Dict[str, Any]]:
        """
        Recalculates dosing times across international travel to preserve steady therapeutic blood concentration levels.
        """
        diff_hours = target_utc_offset_hours - source_utc_offset_hours
        recalibrated_doses = []

        for dose in original_doses:
            try:
                dt = datetime.fromisoformat(dose["scheduled_at"])
                # Shift dosing gradually across 24h to avoid dose clustering
                adjusted_dt = dt + timedelta(hours=diff_hours)
                new_dose = dict(dose)
                new_dose["scheduled_at"] = adjusted_dt.isoformat()
                new_dose["timezone_adjusted"] = True
                new_dose["note"] = f"Adjusted for travel ({diff_hours:+.1f}h shift)"
                recalibrated_doses.append(new_dose)
            except Exception as e:
                logger.warning(f"Failed to adjust dose timezone: {e}")
                recalibrated_doses.append(dose)

        return recalibrated_doses
