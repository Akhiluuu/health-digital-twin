"""
healthbot_v4/apps/brain/risk/risk_engine.py
Safety-Critical Deterministic Clinical Risk Engine for VitalHealth v5.0.
"""

from typing import List
from datetime import datetime, timezone
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState, RiskFlag, RiskLevel


class ClinicalRiskEngine(HealthBrainSubsystem):
    """Deterministic Clinical Risk Matrix Engine."""

    def __init__(self):
        super().__init__("clinical_risk")

    async def initialize(self) -> None:
        logger.info("🚨 Safety-Critical Clinical Risk Engine initialized")

    def evaluate_patient_risks(self, state: PatientState) -> List[RiskFlag]:
        risks = []

        # HbA1c Risk Rule
        for lab in state.recent_labs:
            if lab.loinc_code == "4548-4" and lab.value >= 8.0:
                risks.append(
                    RiskFlag(
                        risk_id=f"risk_hba1c_{int(datetime.now(timezone.utc).timestamp())}",
                        level=RiskLevel.high,
                        title="Uncontrolled Glycemic Risk (HbA1c >= 8.0%)",
                        description=f"Latest HbA1c level measured at {lab.value}% indicates persistent hyperglycemia.",
                        recommended_action="Schedule endocrinology review and optimize medication regimen.",
                    )
                )

        # Stage 2 Hypertension Rule
        for vital in state.recent_vitals:
            if vital.vital_type == "blood_pressure" and vital.value_primary >= 140.0:
                risks.append(
                    RiskFlag(
                        risk_id=f"risk_bp_{int(datetime.now(timezone.utc).timestamp())}",
                        level=RiskLevel.high,
                        title="Stage 2 Hypertension Alert",
                        description=f"Systolic Blood Pressure of {vital.value_primary} mmHg exceeds normal threshold.",
                        recommended_action="Review antihypertensive adherence and salt intake.",
                    )
                )

        logger.info(f"Evaluated state for patient {state.patient_id}: Triggered {len(risks)} deterministic risk flags")
        return risks
