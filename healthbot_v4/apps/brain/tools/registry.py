"""
healthbot_v4/apps/brain/tools/registry.py
Tool Calling Layer & Registry for VitalHealth v6.0 Enterprise Multi-Agent System.
Provides executable micro-tools for Specialist Agents to run calculations, RAG, simulations, and safety checks.
"""

import math
from typing import Dict, Any, List, Callable, Optional
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.shared.logger.logger import logger


class ToolResult:
    def __init__(self, tool_name: str, success: bool, result_data: Dict[str, Any], message: str = ""):
        self.tool_name = tool_name
        self.success = success
        self.result_data = result_data
        self.message = message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "success": self.success,
            "data": self.result_data,
            "message": self.message,
        }


class VitalHealthToolRegistry:
    """
    Central Tool Registry for agentic function calling.
    Prevents LLM hallucination by executing deterministic tools for facts & calculations.
    """

    @staticmethod
    def check_drug_interactions(state: UnifiedPatientState, proposed_drug: str) -> ToolResult:
        """
        Tool: Checks proposed drug against active regimen and patient allergies.
        """
        logger.info(f"🛠️ Executing Tool: check_drug_interactions for '{proposed_drug}'")
        proposed_low = proposed_drug.lower()
        interactions = []

        # 1. Allergy check
        for allergy in state.allergies:
            if allergy.substance.lower() in proposed_low or proposed_low in allergy.substance.lower():
                interactions.append({
                    "severity": "CRITICAL_ALLERGY",
                    "description": f"PATIENT ALLERGIC to {allergy.substance} ({allergy.reaction}, Severity: {allergy.severity})"
                })

        # 2. Known drug-drug interaction matrix
        active_meds = [m.name.lower() for m in state.active_regimen if m.status == "active"]
        
        # NSAID + CKD / Anticoagulant rule
        if any(nsaid in proposed_low for nsaid in ["ibuprofen", "advil", "naproxen", "aleve", "aspirin"]):
            if state.has_condition("chronic kidney disease") or state.has_condition("ckd"):
                interactions.append({
                    "severity": "HIGH_CONTRAINDICATION",
                    "description": "NSAIDs inhibit renal prostaglandins, reducing eGFR and worsening Chronic Kidney Disease."
                })
            if any(anti in m for m in active_meds for anti in ["apixaban", "eliquis", "warfarin", "rivaroxaban"]):
                interactions.append({
                    "severity": "HIGH_BLEEDING_RISK",
                    "description": "Combining NSAIDs with Anticoagulants (Apixaban) exponentially increases major GI bleeding risk."
                })

        # Metformin + Contrast Dye rule
        if "metformin" in active_meds and any(c in proposed_low for c in ["contrast", "ct scan dye", "iodinated"]):
            interactions.append({
                "severity": "WARNING",
                "description": "Metformin should be temporarily held prior to iodinated contrast dye procedures due to lactic acidosis risk."
            })

        return ToolResult(
            tool_name="check_drug_interactions",
            success=True,
            result_data={
                "proposed_drug": proposed_drug,
                "has_interactions": len(interactions) > 0,
                "interactions": interactions,
            },
            message=f"Found {len(interactions)} potential interactions" if interactions else "No contraindications detected"
        )

    @staticmethod
    def calculate_ascvd_risk(state: UnifiedPatientState) -> ToolResult:
        """
        Tool: Calculates 10-year ASCVD (Atherosclerotic Cardiovascular Disease) risk score.
        """
        logger.info(f"🛠️ Executing Tool: calculate_ascvd_risk")
        age = state.demographics.age
        has_htn = state.has_condition("hypertension")
        has_db = state.has_condition("diabetes")
        
        # Simplistic 10-year score approximation for baseline demonstration
        base_score = 1.5
        if age > 50: base_score += (age - 50) * 0.3
        if has_htn: base_score += 3.5
        if has_db: base_score += 4.2

        tier = "LOW"
        if base_score >= 20.0: tier = "HIGH"
        elif base_score >= 7.5: tier = "INTERMEDIATE"
        elif base_score >= 5.0: tier = "BORDERLINE"

        return ToolResult(
            tool_name="calculate_ascvd_risk",
            success=True,
            result_data={
                "ascvd_10yr_risk_percent": round(base_score, 1),
                "risk_tier": tier,
                "factors_included": ["age", "hypertension", "diabetes"],
            },
            message=f"10-year ASCVD Risk: {base_score:.1f}% ({tier})"
        )

    @staticmethod
    def analyze_lab_trends(state: UnifiedPatientState, biomarker_name: str) -> ToolResult:
        """
        Tool: Evaluates longitudinal biomarker trend across lab observations.
        """
        logger.info(f"🛠️ Executing Tool: analyze_lab_trends for '{biomarker_name}'")
        matched = [l for l in state.lab_trends if biomarker_name.lower() in l.biomarker_name.lower()]
        if not matched:
            return ToolResult("analyze_lab_trends", False, {}, f"No lab data found for '{biomarker_name}'")

        latest = matched[0]
        return ToolResult(
            tool_name="analyze_lab_trends",
            success=True,
            result_data={
                "biomarker": latest.biomarker_name,
                "latest_value": latest.value,
                "unit": latest.unit,
                "reference_range": latest.reference_range,
                "status": latest.status,
                "trend": latest.trend,
            },
            message=f"{latest.biomarker_name}: {latest.value} {latest.unit} ({latest.trend})"
        )
