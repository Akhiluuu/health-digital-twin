"""
healthbot_v4/apps/brain/reasoning/longitudinal_engine.py
Longitudinal Clinical Reasoning Engine for VitalHealth v5.0 Health Brain.
Computes time-series deltas, rate-of-change, and historical trajectory comparisons across patient records.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientState, NormalizedLab, NormalizedVital


class LongitudinalDelta(BaseModel):
    metric_name: str
    previous_value: float
    current_value: float
    unit: str
    absolute_change: float
    percentage_change: float
    trend_direction: str  # "IMPROVING", "DETERIORATING", "STABLE"
    clinical_interpretation: str


class LongitudinalAnalysisResult(BaseModel):
    patient_id: str
    lab_deltas: List[LongitudinalDelta] = Field(default_factory=list)
    vital_deltas: List[LongitudinalDelta] = Field(default_factory=list)
    overall_trajectory_summary: str = ""


class LongitudinalEngine(HealthBrainSubsystem):
    """Subsystem analyzing longitudinal trends across time."""

    def __init__(self):
        super().__init__("longitudinal_engine")

    async def initialize(self) -> None:
        logger.info("📈 Longitudinal Clinical Reasoning Engine initialized")

    def analyze_patient_trajectory(self, state: PatientState) -> LongitudinalAnalysisResult:
        lab_deltas = []
        vital_deltas = []

        # Analyze HbA1c trajectory if multiple labs present
        hba1c_labs = [l for l in state.recent_labs if l.loinc_code == "4548-4"]
        if len(hba1c_labs) >= 2:
            latest = hba1c_labs[0]
            prev = hba1c_labs[1]
            diff = round(latest.value - prev.value, 2)
            pct = round((diff / prev.value) * 100.0, 1)
            direction = "DETERIORATING" if diff > 0 else ("IMPROVING" if diff < 0 else "STABLE")

            lab_deltas.append(
                LongitudinalDelta(
                    metric_name="HbA1c (Glycated Hemoglobin)",
                    previous_value=prev.value,
                    current_value=latest.value,
                    unit="%",
                    absolute_change=diff,
                    percentage_change=pct,
                    trend_direction=direction,
                    clinical_interpretation=f"HbA1c changed by {diff:+} percentage points ({pct:+}%) over recent interval.",
                )
            )

        # Analyze Blood Pressure trajectory if vitals present
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        if len(bp_vitals) >= 2:
            latest_bp = bp_vitals[0]
            prev_bp = bp_vitals[1]
            diff_sys = round(latest_bp.value_primary - prev_bp.value_primary, 1)
            direction_sys = "DETERIORATING" if diff_sys > 0 else ("IMPROVING" if diff_sys < 0 else "STABLE")

            vital_deltas.append(
                LongitudinalDelta(
                    metric_name="Systolic Blood Pressure",
                    previous_value=prev_bp.value_primary,
                    current_value=latest_bp.value_primary,
                    unit="mmHg",
                    absolute_change=diff_sys,
                    percentage_change=round((diff_sys / prev_bp.value_primary) * 100.0, 1),
                    trend_direction=direction_sys,
                    clinical_interpretation=f"Systolic Blood Pressure changed by {diff_sys:+} mmHg over recent interval.",
                )
            )

        summary = (
            f"Longitudinal analysis for {state.patient_id}: Calculated {len(lab_deltas)} lab deltas and {len(vital_deltas)} vital deltas."
        )

        return LongitudinalAnalysisResult(
            patient_id=state.patient_id,
            lab_deltas=lab_deltas,
            vital_deltas=vital_deltas,
            overall_trajectory_summary=summary,
        )
