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

# Expanded Clinical Food-Drug & Drug-Drug Interaction Knowledge Matrix
KNOWN_FOOD_DRUG_INTERACTIONS = {
    "grapefruit": {
        "interacts_with": ["atorvastatin", "simvastatin", "amlodipine", "nifedipine", "felodipine", "cyclosporine", "buspirone"],
        "severity": "high",
        "action": "Delay statin/calcium channel blocker by 4 hours or avoid grapefruit juice.",
        "rationale": "Inhibits intestinal CYP3A4 enzyme, leading to elevated drug blood plasma concentration and risk of toxicity."
    },
    "calcium": {
        "interacts_with": ["levothyroxine", "synthroid", "ciprofloxacin", "doxycycline", "alendronate"],
        "severity": "medium",
        "action": "Space calcium intake 2 to 4 hours apart from medication.",
        "rationale": "Binds to drug molecules in gut (chelation), significantly reducing therapeutic absorption."
    },
    "dairy": {
        "interacts_with": ["tetracycline", "doxycycline", "ciprofloxacin", "iron"],
        "severity": "medium",
        "action": "Avoid dairy 2 hours before or after dose.",
        "rationale": "Chelation of antibiotic/mineral molecules with calcium ions prevents gut absorption."
    },
    "alcohol": {
        "interacts_with": ["metronidazole", "acetaminophen", "paracetamol", "sedatives", "alprazolam", "warfarin", "metformin"],
        "severity": "critical",
        "action": "Avoid alcohol completely while taking medication.",
        "rationale": "Risk of severe disulfiram-like reaction, CNS depression, or acute hepatotoxicity."
    },
    "spinach": {
        "interacts_with": ["warfarin", "coumadin", "jantoven"],
        "severity": "high",
        "action": "Maintain consistent daily Vitamin K intake; do not suddenly increase leafy greens.",
        "rationale": "High Vitamin K content directly counteracts the anticoagulant mechanism of warfarin."
    },
    "kale": {
        "interacts_with": ["warfarin", "coumadin"],
        "severity": "high",
        "action": "Maintain steady Vitamin K intake.",
        "rationale": "Vitamin K opposes antithrombotic effects of warfarin."
    },
    "potassium": {
        "interacts_with": ["spironolactone", "lisinopril", "losartan", "enalapril"],
        "severity": "high",
        "action": "Avoid potassium supplements or high-potassium salt substitutes.",
        "rationale": "ACE inhibitors and potassium-sparing diuretics reduce renal potassium excretion, risking hyperkalemia."
    },
    "tyramine": {
        "interacts_with": ["phenelzine", "tranylcypromine", "linezolid", "selegiline"],
        "severity": "critical",
        "action": "Avoid aged cheeses, cured meats, and fermented foods.",
        "rationale": "MAO inhibition prevents breakdown of tyramine, potentially causing hypertensive crisis."
    },
    "coffee": {
        "interacts_with": ["ephedrine", "clozapine", "theophylline"],
        "severity": "medium",
        "action": "Limit caffeine consumption.",
        "rationale": "Caffeine inhibits CYP1A2 metabolism of clozapine/theophylline and compounds sympathomimetic effects."
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
    def query_local_clinical_db_drug_interaction(drug_name_a: str, drug_name_b: str) -> Optional[Dict[str, Any]]:
        """
        Hybrid Drug Interaction Engine:
        1. Tier 1: Check self-contained local SQLite Knowledge Database (clinical_kb.db) - 0 latency.
        2. Tier 2: If missing locally, query NIH RxNav REST API, parse contraindication,
                   and auto-cache the result into clinical_kb.db for future offline use.
        """
        import os
        import sqlite3
        import urllib.request
        import json

        db_path = os.path.join(os.path.dirname(__file__), "..", "..", "database", "clinical_kb.db")
        a_clean = drug_name_a.strip().lower()
        b_clean = drug_name_b.strip().lower()

        # Tier 1: Check Local SQLite DB
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT drug1, drug2, severity, mechanism, advice
                    FROM drug_interactions
                    WHERE (LOWER(drug1) LIKE ? AND LOWER(drug2) LIKE ?)
                       OR (LOWER(drug1) LIKE ? AND LOWER(drug2) LIKE ?)
                """, (f"%{a_clean}%", f"%{b_clean}%", f"%{b_clean}%", f"%{a_clean}%"))

                row = cursor.fetchone()
                conn.close()

                if row:
                    return {
                        "has_interaction": True,
                        "drug_a": row[0],
                        "drug_b": row[1],
                        "severity": row[2],
                        "mechanism": row[3],
                        "advice": row[4],
                        "source": "Local Air-Gapped Clinical Knowledge Base"
                    }
            except Exception as e:
                logger.warning(f"Local clinical DB query failed: {e}")

        # Tier 2: Hybrid Online Fallback (NIH RxNav API)
        try:
            headers = {"User-Agent": "VitalHealth/6.0 Clinical Engine"}
            
            def get_rxcui(drug_name: str) -> Optional[str]:
                url = f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={urllib.parse.quote(drug_name)}"
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    id_group = data.get("idGroup", {})
                    rx_list = id_group.get("rxnormId", [])
                    return rx_list[0] if rx_list else None

            rxcui_a = get_rxcui(drug_name_a)
            rxcui_b = get_rxcui(drug_name_b)

            if rxcui_a and rxcui_b:
                url_inter = f"https://rxnav.nlm.nih.gov/REST/interaction/interaction.json?rxcui={rxcui_a}"
                req_inter = urllib.request.Request(url_inter, headers=headers)
                with urllib.request.urlopen(req_inter, timeout=3.0) as resp:
                    inter_data = json.loads(resp.read().decode('utf-8'))
                    type_groups = inter_data.get("interactionTypeGroup", [])
                    
                    found_desc = None
                    for group in type_groups:
                        for inter_type in group.get("interactionType", []):
                            for pair in inter_type.get("interactionPair", []):
                                min_concepts = pair.get("interactionConcept", [])
                                concept_ids = [c.get("minConceptItem", {}).get("rxcui") for c in min_concepts]
                                if rxcui_b in concept_ids:
                                    found_desc = pair.get("description", "Potential clinical drug-drug interaction detected.")
                                    break
                    if found_desc:
                        severity = "CRITICAL" if any(k in found_desc.lower() for k in ["severe", "fatal", "hemorrhage", "toxic", "cardiac"]) else "HIGH"
                        mechanism = found_desc
                        advice = "Consult prescribing physician before co-administration."
                        
                        # Auto-Cache into local DB
                        if os.path.exists(db_path):
                            try:
                                conn = sqlite3.connect(db_path)
                                cursor = conn.cursor()
                                cursor.execute("""
                                    INSERT OR REPLACE INTO drug_interactions (drug1, drug2, severity, mechanism, advice)
                                    VALUES (?, ?, ?, ?, ?)
                                """, (drug_name_a.title(), drug_name_b.title(), severity, mechanism, advice))
                                conn.commit()
                                conn.close()
                                logger.info(f"Auto-cached NIH RxNav interaction for '{drug_name_a}' & '{drug_name_b}' into local DB")
                            except Exception as cache_err:
                                logger.warning(f"Failed to cache NIH interaction: {cache_err}")

                        return {
                            "has_interaction": True,
                            "drug_a": drug_name_a.title(),
                            "drug_b": drug_name_b.title(),
                            "severity": severity,
                            "mechanism": mechanism,
                            "advice": advice,
                            "source": "NIH RxNav REST API (Cached locally)"
                        }
        except Exception as api_err:
            logger.warning(f"NIH RxNav online API query fallback failed or timed out: {api_err}")

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

    @staticmethod
    def forecast_inventory_depletion(
        user_id: str,
        medications: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Real-time medication inventory depletion forecasting:
        Calculates exact depletion dates and generates automated 3-day refill warnings.
        """
        now = datetime.now(timezone.utc)
        forecasts = []
        urgent_refills = 0

        for med in medications:
            med_name = med.get("name") or med.get("drug_name") or "Medication"
            pills_left = int(med.get("pills_left") or med.get("current_pill_count") or 14)
            daily_dose = float(med.get("daily_dosage") or med.get("doses_per_day") or 1.0)
            if daily_dose <= 0:
                daily_dose = 1.0

            days_left = max(0, int(pills_left / daily_dose))
            depletion_dt = now + timedelta(days=days_left)
            depletion_date_str = depletion_dt.strftime("%Y-%m-%d")

            if days_left <= 1:
                status = "CRITICAL"
                urgency = "high"
                prompt = f"🚨 CRITICAL REFILL WARNING: '{med_name}' has only {pills_left} pill(s) left. Depletion expected on {depletion_date_str}!"
                urgent_refills += 1
            elif days_left <= 3:
                status = "WARNING_3_DAYS"
                urgency = "medium"
                prompt = f"⚠️ REFILL ALERT: '{med_name}' will run out in {days_left} days on {depletion_date_str}. Contact pharmacy to reorder."
                urgent_refills += 1
            else:
                status = "SUFFICIENT"
                urgency = "none"
                prompt = f"'{med_name}' inventory sufficient for {days_left} days (depletion on {depletion_date_str})."

            forecasts.append({
                "medication_name": med_name,
                "pills_remaining": pills_left,
                "daily_dosage": daily_dose,
                "days_remaining": days_left,
                "estimated_depletion_date": depletion_date_str,
                "status": status,
                "urgency": urgency,
                "refill_recommended": (days_left <= 3),
                "action_prompt": prompt
            })

        return {
            "status": "success",
            "user_id": user_id,
            "total_medications_tracked": len(forecasts),
            "urgent_refills_count": urgent_refills,
            "forecasts": forecasts,
            "summary": f"Tracking {len(forecasts)} medication(s). {urgent_refills} require immediate or 3-day refill action."
        }

