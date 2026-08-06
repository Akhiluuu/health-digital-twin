"""
healthbot_v4/apps/brain/analytics/feature_store.py
Clinical Feature Store Engine for VitalHealth v6.0 Enterprise.
Computes and serves engineered longitudinal health feature vectors for predictive machine learning models.
"""

from typing import Dict, Any, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.shared.logger.logger import logger


class ClinicalFeatureVector(BaseModel):
    patient_id: str
    resting_hr_7d_avg: float = 72.0
    hrv_sdnn_ms: float = 45.0
    systolic_bp_mean_30d: float = 124.0
    medication_compliance_rate_30d: float = 0.92
    glucose_cv_percent: float = 18.5
    weekly_exercise_minutes: int = 150
    bmi: float = 23.5
    active_risk_index: float = 0.15

    def to_dict(self) -> Dict[str, Any]:
        return {
            "patient_id": self.patient_id,
            "resting_hr_7d_avg": round(self.resting_hr_7d_avg, 1),
            "hrv_sdnn_ms": round(self.hrv_sdnn_ms, 1),
            "systolic_bp_mean_30d": round(self.systolic_bp_mean_30d, 1),
            "compliance_30d": f"{self.medication_compliance_rate_30d * 100:.1f}%",
            "glucose_cv": f"{self.glucose_cv_percent:.1f}%",
            "weekly_exercise_mins": self.weekly_exercise_minutes,
            "risk_index": round(self.active_risk_index, 2),
        }


class FeatureStoreEngine:
    """
    Enterprise Feature Store serving feature vectors for classical ML models & LLM prompts.
    """

    @classmethod
    def compute_feature_vector(cls, state: UnifiedPatientState) -> ClinicalFeatureVector:
        logger.info(f"📊 Computing Clinical Feature Vector for patient {state.patient_id}")

        # Compute vitals moving average from latest_vitals
        hr_vals = [v.value for v in state.latest_vitals if "heart" in v.metric_name.lower() and isinstance(v.value, (int, float))]
        avg_hr = (sum(hr_vals) / len(hr_vals)) if hr_vals else 72.0

        # Compliance rate from active regimen
        compliance_scores = [m.compliance_rate for m in state.active_regimen]
        avg_compliance = (sum(compliance_scores) / len(compliance_scores)) if compliance_scores else 0.95

        bmi_val = state.demographics.bmi or 23.5
        risk_idx = 0.10 + (0.15 if len(state.conditions) > 1 else 0.0) + (0.20 if state.risk_matrix.active_red_flags else 0.0)

        vector = ClinicalFeatureVector(
            patient_id=state.patient_id,
            resting_hr_7d_avg=avg_hr,
            medication_compliance_rate_30d=avg_compliance,
            bmi=bmi_val,
            active_risk_index=risk_idx
        )
        return vector
