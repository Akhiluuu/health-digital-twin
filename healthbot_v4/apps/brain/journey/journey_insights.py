"""
healthbot_v4/apps/brain/journey/journey_insights.py
Automatic Journey Insight Detection Engine.
Detects meaningful health changes, patterns, and alerts from longitudinal patient data.
All detection is deterministic and clinically grounded.
"""

import uuid
from typing import List, Dict, Any
from datetime import datetime, timezone

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientState, JourneyInsight, InsightType, RiskLevel,
    TimelineEventType,
)
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalEngine


class JourneyInsightsEngine(HealthBrainSubsystem):
    """
    Detects meaningful health insights automatically.
    Runs on each journey update cycle and returns a deduplicated
    insight list sorted by clinical significance.
    """

    def __init__(self):
        super().__init__("journey_insights_engine")
        self.timeline_engine = MedicalTimelineEngine()
        self.longitudinal_engine = LongitudinalEngine()

    async def initialize(self) -> None:
        logger.info("💡 Journey Insights Detection Engine initialized")

    def detect_insights(
        self,
        state: PatientState,
        store: Dict[str, Any],
    ) -> List[JourneyInsight]:
        """
        Returns the full deduplicated insight list for this patient.
        Merges stored insights with newly detected ones.
        """
        existing_ids = {i["insight_id"] for i in store.get("insights", [])}
        newly_detected: List[JourneyInsight] = []

        newly_detected.extend(self._detect_lab_improvements(state, existing_ids))
        newly_detected.extend(self._detect_lab_worsening(state, existing_ids))
        newly_detected.extend(self._detect_bp_improvement(state, existing_ids))
        newly_detected.extend(self._detect_bp_worsening(state, existing_ids))
        newly_detected.extend(self._detect_weight_change(state, existing_ids))
        newly_detected.extend(self._detect_risk_reduction(state, store))
        newly_detected.extend(self._detect_risk_escalation(state, store))
        newly_detected.extend(self._detect_adherence_signal(state, existing_ids))

        # Record new insights in timeline
        for insight in newly_detected:
            self.timeline_engine.record_event(
                state.patient_id,
                TimelineEventType.insight_detected,
                f"💡 Insight: {insight.title}",
                insight.body,
                payload={
                    "insight_id": insight.insight_id,
                    "type": insight.insight_type.value,
                    "severity": insight.severity.value,
                },
            )
            logger.info(f"Insight detected for {state.patient_id}: {insight.title}")

        # Merge with stored
        stored_insights = [
            JourneyInsight(**i) for i in store.get("insights", [])
            if i["insight_id"] not in {ni.insight_id for ni in newly_detected}
        ]

        # Deduplicate by type
        seen_types = set()
        all_insights = []
        for i in (newly_detected + stored_insights):
            key = f"{i.insight_type.value}_{i.metric_name or ''}"
            if key not in seen_types:
                all_insights.append(i)
                seen_types.add(key)

        # Sort by severity
        severity_order = {
            RiskLevel.critical: 0,
            RiskLevel.high: 1,
            RiskLevel.moderate: 2,
            RiskLevel.low: 3,
        }
        all_insights.sort(key=lambda i: severity_order.get(i.severity, 4))
        return all_insights

    # ─── Individual Insight Detectors ────────────────────────────────────────

    def _detect_lab_improvements(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        insights = []
        longitudinal = self.longitudinal_engine.analyze_patient_trajectory(state)
        for delta in longitudinal.lab_deltas:
            if delta.trend_direction == "IMPROVING":
                iid = f"lab_improve_{delta.metric_name.replace(' ', '_').lower()}"
                if iid not in existing_ids:
                    insights.append(JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.improvement,
                        title=f"{delta.metric_name} Improving",
                        body=delta.clinical_interpretation,
                        severity=RiskLevel.low,
                        metric_name=delta.metric_name,
                        old_value=delta.previous_value,
                        new_value=delta.current_value,
                        unit=delta.unit,
                        actionable_recommendation="Continue current management — trajectory is positive.",
                    ))
        return insights

    def _detect_lab_worsening(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        insights = []
        longitudinal = self.longitudinal_engine.analyze_patient_trajectory(state)
        for delta in longitudinal.lab_deltas:
            if delta.trend_direction == "DETERIORATING":
                iid = f"lab_worsen_{delta.metric_name.replace(' ', '_').lower()}"
                if iid not in existing_ids:
                    insights.append(JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.worsening,
                        title=f"{delta.metric_name} Worsening",
                        body=delta.clinical_interpretation,
                        severity=RiskLevel.high,
                        metric_name=delta.metric_name,
                        old_value=delta.previous_value,
                        new_value=delta.current_value,
                        unit=delta.unit,
                        actionable_recommendation=f"Review treatment plan for {delta.metric_name}. Schedule follow-up.",
                    ))
        return insights

    def _detect_bp_improvement(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        if len(bp_vitals) >= 2:
            current, prev = bp_vitals[0].value_primary, bp_vitals[1].value_primary
            if current < prev and current < 130:
                iid = "bp_improved_target"
                if iid not in existing_ids:
                    return [JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.improvement,
                        title="Blood Pressure Reached Target",
                        body=f"Systolic BP improved from {prev:.0f} to {current:.0f} mmHg — now within target range.",
                        severity=RiskLevel.low,
                        metric_name="Systolic BP",
                        old_value=prev,
                        new_value=current,
                        unit="mmHg",
                        actionable_recommendation="Maintain current antihypertensive regimen and low-sodium diet.",
                    )]
        return []

    def _detect_bp_worsening(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        if len(bp_vitals) >= 2:
            current, prev = bp_vitals[0].value_primary, bp_vitals[1].value_primary
            if current > prev and current >= 140:
                iid = "bp_stage2_alert"
                if iid not in existing_ids:
                    return [JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.worsening,
                        title="Blood Pressure Elevated",
                        body=f"Systolic BP rose from {prev:.0f} to {current:.0f} mmHg — Stage 2 Hypertension range.",
                        severity=RiskLevel.high,
                        metric_name="Systolic BP",
                        old_value=prev,
                        new_value=current,
                        unit="mmHg",
                        actionable_recommendation="Review antihypertensive adherence and consult physician.",
                    )]
        return []

    def _detect_weight_change(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        weight_vitals = [v for v in state.recent_vitals if v.vital_type == "weight"]
        if len(weight_vitals) >= 2:
            current, prev = weight_vitals[0].value_primary, weight_vitals[1].value_primary
            delta = current - prev
            if abs(delta) >= 1.0:
                direction = "Decreased" if delta < 0 else "Increased"
                iid = f"weight_{direction.lower()}_{abs(delta):.0f}kg"
                if iid not in existing_ids:
                    return [JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.weight_change,
                        title=f"Weight {direction} by {abs(delta):.1f} kg",
                        body=f"Body weight changed from {prev:.1f} kg to {current:.1f} kg.",
                        severity=RiskLevel.low if delta < 0 else RiskLevel.moderate,
                        metric_name="Body Weight",
                        old_value=prev,
                        new_value=current,
                        unit="kg",
                        actionable_recommendation=(
                            "Keep up the great work — weight trend is positive."
                            if delta < 0 else
                            "Review diet and activity. Discuss with physician if trend continues."
                        ),
                    )]
        return []

    def _detect_risk_reduction(
        self, state: PatientState, store: Dict[str, Any]
    ) -> List[JourneyInsight]:
        prev_risk_count = store.get("prev_risk_count", len(state.active_risks))
        current_risk_count = len(state.active_risks)
        existing_ids = {i["insight_id"] for i in store.get("insights", [])}

        if current_risk_count < prev_risk_count and current_risk_count == 0:
            iid = f"risk_cleared_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            if iid not in existing_ids:
                return [JourneyInsight(
                    insight_id=iid,
                    patient_id=state.patient_id,
                    insight_type=InsightType.risk_change,
                    title="All Clinical Risks Cleared",
                    body="No active risk flags detected — health parameters are within normal ranges.",
                    severity=RiskLevel.low,
                    actionable_recommendation="Maintain current health management to sustain this improvement.",
                )]
        return []

    def _detect_risk_escalation(
        self, state: PatientState, store: Dict[str, Any]
    ) -> List[JourneyInsight]:
        existing_ids = {i["insight_id"] for i in store.get("insights", [])}
        insights = []
        for risk in state.active_risks:
            if risk.level in (RiskLevel.high, RiskLevel.critical):
                iid = f"risk_escalated_{risk.risk_id}"
                if iid not in existing_ids:
                    insights.append(JourneyInsight(
                        insight_id=iid,
                        patient_id=state.patient_id,
                        insight_type=InsightType.risk_change,
                        title=f"Risk Alert: {risk.title}",
                        body=risk.description,
                        severity=risk.level,
                        actionable_recommendation=risk.recommended_action,
                    ))
        return insights

    def _detect_adherence_signal(
        self, state: PatientState, existing_ids: set
    ) -> List[JourneyInsight]:
        if state.active_medications:
            iid = "adherence_active"
            if iid not in existing_ids:
                med_count = len(state.active_medications)
                return [JourneyInsight(
                    insight_id=iid,
                    patient_id=state.patient_id,
                    insight_type=InsightType.adherence,
                    title=f"Active Medication Regimen: {med_count} Drug{'s' if med_count > 1 else ''}",
                    body=f"You have {med_count} active medication(s). Consistent adherence is critical for clinical outcomes.",
                    severity=RiskLevel.low,
                    actionable_recommendation="Log each dose in VitalHealth to track your adherence streak.",
                )]
        return []
