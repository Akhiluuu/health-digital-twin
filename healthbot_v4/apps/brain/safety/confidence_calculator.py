"""
healthbot_v4/apps/brain/safety/confidence_calculator.py
Multi-Factor Clinical Confidence Engine for VitalHealth v6.0 Enterprise.
Computes a composite confidence score based on 9 weighted clinical, physiological, and statistical indicators.
"""

from typing import Dict, Any, List
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.shared.logger.logger import logger


class ConfidenceBreakdown:
    def __init__(
        self,
        composite_score: float,
        tier: str,
        context_relevance: float,
        rag_evidence: float,
        sim_stability: float,
        sensor_reliability: float,
        ontology_agreement: float,
        absence_of_contradiction: float,
        completeness_ratio: float,
        model_certainty: float,
        safety_margin: float
    ):
        self.composite_score = composite_score
        self.tier = tier
        self.context_relevance = context_relevance
        self.rag_evidence = rag_evidence
        self.sim_stability = sim_stability
        self.sensor_reliability = sensor_reliability
        self.ontology_agreement = ontology_agreement
        self.absence_of_contradiction = absence_of_contradiction
        self.completeness_ratio = completeness_ratio
        self.model_certainty = model_certainty
        self.safety_margin = safety_margin

    def to_dict(self) -> Dict[str, Any]:
        return {
            "composite_confidence_score": round(self.composite_score, 3),
            "confidence_tier": self.tier,
            "indicators": {
                "S1_context_relevance": round(self.context_relevance, 2),
                "S2_rag_evidence": round(self.rag_evidence, 2),
                "S3_sim_stability": round(self.sim_stability, 2),
                "S4_sensor_reliability": round(self.sensor_reliability, 2),
                "S5_ontology_agreement": round(self.ontology_agreement, 2),
                "S6_absence_of_contradiction": round(self.absence_of_contradiction, 2),
                "S7_completeness_ratio": round(self.completeness_ratio, 2),
                "S8_model_certainty": round(self.model_certainty, 2),
                "S9_safety_margin": round(self.safety_margin, 2),
            }
        }


class ConfidenceCalculator:
    """
    Computes a 9-factor weighted composite clinical confidence score.
    """

    # Indicator Weights summing to 1.00
    WEIGHTS = {
        "S1_context": 0.15,
        "S2_rag": 0.15,
        "S3_sim": 0.15,
        "S4_sensor": 0.10,
        "S5_ontology": 0.10,
        "S6_contradiction": 0.10,
        "S7_completeness": 0.10,
        "S8_model": 0.10,
        "S9_safety": 0.05,
    }

    @classmethod
    def calculate(
        cls,
        state: UnifiedPatientState,
        has_rag_evidence: bool = True,
        has_sim_data: bool = True,
        tool_results_passed: bool = True,
        llm_raw_confidence: float = 0.95
    ) -> ConfidenceBreakdown:
        
        # 1. Context Relevance
        s1 = 0.95 if state.demographics and state.conditions else 0.70

        # 2. RAG Evidence Alignment
        s2 = 0.95 if has_rag_evidence else 0.75

        # 3. Simulation Stability
        s3 = 0.90 if has_sim_data else 0.80

        # 4. Sensor Reliability Index
        s4 = 0.98 if state.latest_vitals else 0.85

        # 5. Medical Ontology Agreement
        s5 = 0.95 if tool_results_passed else 0.60

        # 6. Absence of Contradiction
        s6 = 0.95 if not state.risk_matrix.active_red_flags else 0.70

        # 7. Data Completeness Ratio
        required_fields = [state.conditions, state.active_regimen, state.latest_vitals, state.lab_trends]
        present = sum(1 for f in required_fields if len(f) > 0)
        s7 = round(0.50 + (present / len(required_fields)) * 0.50, 2)

        # 8. Model Certainty
        s8 = min(1.0, max(0.50, llm_raw_confidence))

        # 9. Safety Margin Distance
        s9 = 0.95 if not state.risk_matrix.active_red_flags else 0.50

        # Weighted Sum Calculation
        composite = (
            cls.WEIGHTS["S1_context"] * s1 +
            cls.WEIGHTS["S2_rag"] * s2 +
            cls.WEIGHTS["S3_sim"] * s3 +
            cls.WEIGHTS["S4_sensor"] * s4 +
            cls.WEIGHTS["S5_ontology"] * s5 +
            cls.WEIGHTS["S6_contradiction"] * s6 +
            cls.WEIGHTS["S7_completeness"] * s7 +
            cls.WEIGHTS["S8_model"] * s8 +
            cls.WEIGHTS["S9_safety"] * s9
        )

        tier = "HIGH" if composite >= 0.85 else ("MODERATE" if composite >= 0.60 else "LOW")
        logger.info(f"📊 Calculated Composite Confidence Score: {composite:.3f} (Tier: {tier})")

        return ConfidenceBreakdown(
            composite_score=composite,
            tier=tier,
            context_relevance=s1,
            rag_evidence=s2,
            sim_stability=s3,
            sensor_reliability=s4,
            ontology_agreement=s5,
            absence_of_contradiction=s6,
            completeness_ratio=s7,
            model_certainty=s8,
            safety_margin=s9,
        )
