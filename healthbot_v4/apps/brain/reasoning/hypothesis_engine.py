"""
healthbot_v4/apps/brain/reasoning/hypothesis_engine.py

Hypothesis Generation & Validation Engine for Personal Health Operating System (PHOS).
Formulates potential explanations/diagnoses (differential diagnosis) and evaluates
supporting vs contradicting evidence for candidate hypotheses.
"""

from typing import Any, Dict, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.evidence.evidence_bundle import EvidenceBundle
from healthbot_v4.shared.logger.logger import logger


class HypothesisItem(BaseModel):
    hypothesis: str
    supportingEvidence: List[str] = Field(default_factory=list)
    contradictingEvidence: List[str] = Field(default_factory=list)
    score: float = Field(default=0.5, ge=0.0, le=1.0)

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "hypothesis": self.hypothesis,
            "supportingEvidence": self.supportingEvidence,
            "contradictingEvidence": self.contradictingEvidence,
            "score": round(self.score, 2),
        }


class HypothesisEngine:
    """
    Hypothesis Generation & Validation Engine.
    Emulates clinical differential diagnosis reasoning over PHKG and EvidenceBundle.
    """

    def generate_and_validate(
        self,
        intent: str,
        query: str,
        bundle: EvidenceBundle,
    ) -> List[HypothesisItem]:
        q_lower = query.lower()
        findings = bundle.findings
        hypotheses: List[HypothesisItem] = []

        # 1. Cardiovascular / Chest Pain Hypothesis evaluation
        if "heart" in intent.lower() or "chest" in q_lower or "cardio" in intent.lower():
            h_angina = HypothesisItem(hypothesis="Angina Pectoris / Ischemic Heart Strain")
            h_gerd = HypothesisItem(hypothesis="Gastroesophageal Reflux / Non-cardiac Chest Pain")
            h_normal = HypothesisItem(hypothesis="Normal Cardiovascular Function & Stable Workload")

            # Evaluate Angina
            for f in findings:
                if f.is_abnormal and any(k in f.label.lower() for k in ["blood pressure", "heart rate", "cholesterol"]):
                    h_angina.supportingEvidence.append(f"{f.source_name}: {f.label} ({f.value})")
                elif not f.is_abnormal and "ecg" in f.label.lower():
                    h_angina.contradictingEvidence.append(f"Normal ECG reading ({f.value})")

            # Score angina
            sup_c = len(h_angina.supportingEvidence)
            con_c = len(h_angina.contradictingEvidence)
            h_angina.score = max(0.1, min(0.95, 0.4 + (sup_c * 0.2) - (con_c * 0.25)))
            hypotheses.append(h_angina)

            # Evaluate Normal
            for f in findings:
                if not f.is_abnormal:
                    h_normal.supportingEvidence.append(f"{f.label}: {f.value}")
                else:
                    h_normal.contradictingEvidence.append(f"Abnormal finding: {f.label} ({f.value})")

            h_normal.score = max(0.1, min(0.95, 0.6 + (len(h_normal.supportingEvidence) * 0.05) - (len(h_normal.contradictingEvidence) * 0.2)))
            hypotheses.append(h_normal)

        # 2. Headache / Dehydration / Tension evaluation
        elif "headache" in q_lower or "head" in q_lower or "symptom" in intent.lower():
            h_dehydration = HypothesisItem(hypothesis="Tension Headache secondary to Dehydration / Fatigue")
            h_hypertension = HypothesisItem(hypothesis="Hypertension-mediated Vascular Headache")

            for f in findings:
                if "hydration" in f.label.lower() or "water" in f.label.lower() or "sleep" in f.label.lower():
                    h_dehydration.supportingEvidence.append(f"{f.label}: {f.value}")
                if "blood pressure" in f.label.lower() and f.is_abnormal:
                    h_hypertension.supportingEvidence.append(f"Elevated BP: {f.value}")

            h_dehydration.score = 0.75 if h_dehydration.supportingEvidence else 0.50
            h_hypertension.score = 0.70 if h_hypertension.supportingEvidence else 0.30
            hypotheses.extend([h_dehydration, h_hypertension])

        # 3. Default Assessment Hypothesis
        else:
            h_gen = HypothesisItem(
                hypothesis="Stable Physiological Baseline",
                supportingEvidence=[f"{f.label}: {f.value}" for f in findings if not f.is_abnormal][:3],
                contradictingEvidence=[f"Abnormal {f.label}" for f in findings if f.is_abnormal][:2],
                score=0.85 if bundle.overall_confidence >= 0.7 else 0.60
            )
            hypotheses.append(h_gen)

        logger.info(f"💡 Generated {len(hypotheses)} hypotheses for intent [{intent}]")
        return sorted(hypotheses, key=lambda x: x.score, reverse=True)
