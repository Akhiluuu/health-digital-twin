"""
healthbot_v4/apps/notification/lab_micronutrient_correlator.py
===================================================================
Lab & Micronutrient Correlation Engine for VitalHealth Enterprise v6.0.
Cross-references patient lab report findings (e.g., Ferritin, Hemoglobin,
Potassium, Vitamin D, Sodium, Calcium) with logged food micronutrient intake
to deliver clinical food recommendations and micronutrient absorption warnings.
"""

from __future__ import annotations
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Micronutrient Reference Ranges & Food Mapping
MICRONUTRIENT_LAB_MAP = {
    "ferritin": {
        "target_nutrient": "iron",
        "unit": "ng/mL",
        "low_threshold": 30.0,
        "high_threshold": 300.0,
        "clinical_condition": "Iron Deficiency / Potential Anemia Risk",
        "recommended_foods": [
            {"name": "Spinach", "content": "2.7 mg iron / 100g", "glycemic_index": 15},
            {"name": "Lentils", "content": "3.3 mg iron / 100g", "glycemic_index": 30},
            {"name": "Pumpkin Seeds", "content": "8.8 mg iron / 100g", "glycemic_index": 25},
            {"name": "Lean Red Meat", "content": "2.6 mg heme-iron / 100g", "glycemic_index": 0},
            {"name": "Dark Chocolate (70%+)", "content": "11.9 mg iron / 100g", "glycemic_index": 23}
        ],
        "booster_nutrient": "Vitamin C (Oranges, Bell Peppers) increases non-heme iron absorption by up to 300%.",
        "blockers": [
            {
                "nutrient": "calcium",
                "food_sources": ["milk", "cheese", "yogurt", "calcium supplement", "dairy"],
                "warning": "Calcium & Dairy Co-Ingestion Blockage",
                "mechanism": "Calcium ions bind to iron in the digestive tract, inhibiting non-heme iron absorption by 50-60%.",
                "recommendation": "Space milk, dairy, and calcium supplements at least 2 hours apart from iron-dense meals or iron supplements."
            },
            {
                "nutrient": "tannins",
                "food_sources": ["coffee", "black tea", "green tea"],
                "warning": "Tannin & Polyphenol Inhibition",
                "mechanism": "Polyphenols and tannins in tea and coffee bind to non-heme iron, reducing absorption.",
                "recommendation": "Avoid drinking coffee or tea within 1 hour after iron-rich meals."
            }
        ]
    },
    "hemoglobin": {
        "target_nutrient": "iron",
        "unit": "g/dL",
        "low_threshold": 12.0,
        "high_threshold": 17.5,
        "clinical_condition": "Low Hemoglobin / Anemia Risk",
        "recommended_foods": [
            {"name": "Spinach", "content": "Rich in iron & folate", "glycemic_index": 15},
            {"name": "Fortified Cereals", "content": "High iron availability", "glycemic_index": 50},
            {"name": "Beetroot", "content": "Rich in iron & nitrates", "glycemic_index": 64}
        ],
        "booster_nutrient": "Folate (Vitamin B9) and Vitamin B12 assist red blood cell maturation.",
        "blockers": []
    },
    "potassium": {
        "target_nutrient": "potassium",
        "unit": "mEq/L",
        "low_threshold": 3.5,
        "high_threshold": 5.1,
        "clinical_condition": "Hypokalemia (Low Serum Potassium)",
        "recommended_foods": [
            {"name": "Avocado", "content": "485 mg potassium / 100g", "glycemic_index": 15},
            {"name": "Banana", "content": "358 mg potassium / 100g", "glycemic_index": 51},
            {"name": "Sweet Potato", "content": "337 mg potassium / 100g", "glycemic_index": 63},
            {"name": "Coconut Water", "content": "250 mg potassium / 100ml", "glycemic_index": 45}
        ],
        "booster_nutrient": "Magnesium is necessary to maintain cellular potassium uptake.",
        "blockers": []
    },
    "vitamin d": {
        "target_nutrient": "vitamin_d",
        "unit": "ng/mL",
        "low_threshold": 30.0,
        "high_threshold": 100.0,
        "clinical_condition": "Vitamin D Insufficiency / Reduced Bone Mineral Density Risk",
        "recommended_foods": [
            {"name": "Salmon (Wild)", "content": "526 IU Vitamin D / 100g", "glycemic_index": 0},
            {"name": "Egg Yolks", "content": "37 IU Vitamin D / yolk", "glycemic_index": 0},
            {"name": "Fortified Milk / Almond Milk", "content": "120 IU / cup", "glycemic_index": 30}
        ],
        "booster_nutrient": "Pair Vitamin D with dietary fats (avocado, olive oil) for optimal fat-soluble absorption.",
        "blockers": []
    },
    "calcium": {
        "target_nutrient": "calcium",
        "unit": "mg/dL",
        "low_threshold": 8.5,
        "high_threshold": 10.5,
        "clinical_condition": "Hypocalcemia Risk",
        "recommended_foods": [
            {"name": "Greek Yogurt", "content": "200 mg calcium / 100g", "glycemic_index": 20},
            {"name": "Chia Seeds", "content": "631 mg calcium / 100g", "glycemic_index": 1},
            {"name": "Almonds", "content": "269 mg calcium / 100g", "glycemic_index": 15}
        ],
        "booster_nutrient": "Requires adequate Vitamin D levels for active intestinal calcium transport.",
        "blockers": []
    }
}


class LabMicronutrientCorrelator:
    """Core Engine for Lab-to-Food Micronutrient Correlation & Absorption Warnings."""

    @staticmethod
    def evaluate_correlations(
        user_id: str,
        recent_labs: List[Dict[str, Any]],
        logged_foods: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Cross-references lab values against nutrient rules and logged food items.
        Returns:
        - Identified lab deficiencies
        - Targeted food recommendations
        - Absorption blockage warnings (e.g. Iron vs Calcium/Dairy co-ingestion)
        """
        deficiencies = []
        recommended_foods = []
        absorption_warnings = []
        food_names_logged = [f.get("name", "").strip().lower() for f in logged_foods if f.get("name")]

        for lab in recent_labs:
            canonical_name = (lab.get("canonical_name") or lab.get("name") or "").strip().lower()
            val = lab.get("value") or lab.get("value_primary")
            
            if val is None:
                continue

            try:
                val_float = float(val)
            except (ValueError, TypeError):
                continue

            # Match against known micronutrient lab targets
            for lab_key, rule in MICRONUTRIENT_LAB_MAP.items():
                if lab_key in canonical_name:
                    if val_float < rule["low_threshold"]:
                        deficiency_entry = {
                            "lab_name": lab.get("canonical_name") or lab_key.title(),
                            "user_value": val_float,
                            "unit": rule["unit"],
                            "threshold": rule["low_threshold"],
                            "status": "LOW",
                            "clinical_condition": rule["clinical_condition"],
                            "target_nutrient": rule["target_nutrient"],
                            "booster_advice": rule["booster_nutrient"]
                        }
                        deficiencies.append(deficiency_entry)

                        # Add targeted food recommendations
                        rec_foods = rule.get("recommended_foods")
                        if isinstance(rec_foods, list):
                            for food in rec_foods:
                                if isinstance(food, dict):
                                    recommended_foods.append({
                                        "food_name": food.get("name", ""),
                                        "content": food.get("content", ""),
                                        "glycemic_index": food.get("glycemic_index", 30),
                                        "for_deficiency": str(rule.get("target_nutrient", "")).title()
                                    })

                        # Check for absorption blockers in logged foods
                        blockers = rule.get("blockers")
                        if isinstance(blockers, list):
                            for blocker in blockers:
                                if not isinstance(blocker, dict):
                                    continue
                                food_sources = blocker.get("food_sources", [])
                                if not isinstance(food_sources, list):
                                    continue
                                conflicting_logged = [
                                    fname for fname in food_names_logged
                                    if any(src in fname for src in food_sources)
                                ]
                                
                                # Trigger absorption warning if blocker is logged or as proactive advice
                                is_co_ingested = len(conflicting_logged) > 0
                                absorption_warnings.append({
                                    "target_nutrient": str(rule.get("target_nutrient", "")).title(),
                                    "blocking_agent": str(blocker.get("nutrient", "")).title(),
                                    "warning_title": str(blocker.get("warning", "")),
                                    "co_ingested_foods": conflicting_logged if is_co_ingested else [],
                                    "is_active_co_ingestion": is_co_ingested,
                                    "mechanism": str(blocker.get("mechanism", "")),
                                    "clinical_recommendation": str(blocker.get("recommendation", ""))
                                })

        # Deduplicate recommended foods
        unique_foods = []
        seen_names = set()
        for food in recommended_foods:
            if food["food_name"] not in seen_names:
                unique_foods.append(food)
                seen_names.add(food["food_name"])

        return {
            "status": "success",
            "user_id": user_id,
            "deficiencies_count": len(deficiencies),
            "deficiencies": deficiencies,
            "recommended_foods": unique_foods,
            "absorption_warnings": absorption_warnings,
            "summary": (
                f"Identified {len(deficiencies)} micronutrient deficiency risk(s). "
                f"Generated {len(unique_foods)} targeted dietary recommendation(s) "
                f"and {len(absorption_warnings)} absorption conflict warning(s)."
            )
        }
