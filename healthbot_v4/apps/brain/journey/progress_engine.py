"""
healthbot_v4/apps/brain/journey/progress_engine.py
Continuous Progress Calculation Engine.
Computes multi-dimensional health progress metrics from PatientState and active goals.
Entirely deterministic — no AI calls.
"""

from typing import List, Optional
from datetime import datetime

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientState, HealthGoal, JourneyProgressReport, MetricProgress,
    GoalStatus, GoalTrend,
)


class ProgressEngine(HealthBrainSubsystem):
    """
    Continuously calculates patient health progress across 8 dimensions.
    Integrates with active goals from GoalEngine.
    """

    def __init__(self):
        super().__init__("progress_engine")

    async def initialize(self) -> None:
        logger.info("📊 Progress Calculation Engine initialized")

    def compute_progress(
        self,
        state: PatientState,
        goals: List[HealthGoal],
    ) -> JourneyProgressReport:
        """Returns a full JourneyProgressReport for the current patient state."""

        # ── Medication Adherence ──────────────────────────────────────────
        # Proxy: check if active medications exist + any taken today
        med_adherence = self._compute_medication_adherence(state, goals)

        # ── Lifestyle Adherence Score (composite) ─────────────────────────
        lifestyle_score = self._compute_lifestyle_score(state)

        # ── Exercise Progress ─────────────────────────────────────────────
        exercise_progress = self._compute_exercise_progress(state, goals)

        # ── Weight Trend ──────────────────────────────────────────────────
        weight_trend = self._compute_weight_trend(state)

        # ── Blood Pressure Trend ──────────────────────────────────────────
        bp_trend = self._compute_bp_trend(state)

        # ── Glucose / HbA1c Trend ────────────────────────────────────────
        glucose_trend = self._compute_glucose_trend(state)

        # ── Goal Completion ───────────────────────────────────────────────
        active_goals = [g for g in goals if g.status == GoalStatus.active]
        completed_goals = [g for g in goals if g.status == GoalStatus.completed]
        total = len(goals)
        completion_pct = (len(completed_goals) / total * 100.0) if total > 0 else 0.0

        report = JourneyProgressReport(
            patient_id=state.patient_id,
            medication_adherence_rate=med_adherence,
            lifestyle_adherence_score=lifestyle_score,
            exercise_progress=exercise_progress,
            weight_trend=weight_trend,
            bp_trend=bp_trend,
            glucose_trend=glucose_trend,
            overall_goal_completion_pct=round(completion_pct, 1),
            active_goals_count=len(active_goals),
            completed_goals_count=len(completed_goals),
        )

        logger.info(
            f"Progress computed for {state.patient_id}: "
            f"adherence={med_adherence:.0f}%, goals={completion_pct:.0f}%"
        )
        return report

    # ─── Dimension Calculators ────────────────────────────────────────────────

    def _compute_medication_adherence(
        self, state: PatientState, goals: List[HealthGoal]
    ) -> float:
        """Returns adherence rate 0-100."""
        # Look for adherence goal with calculated value
        for goal in goals:
            if goal.category == "medications":
                return min(100.0, goal.current_value)

        # Fallback: if medications are active, assume baseline adherence
        if state.active_medications:
            return 75.0  # conservative baseline
        return 0.0

    def _compute_lifestyle_score(self, state: PatientState) -> float:
        """
        Composite lifestyle score 0-100.
        Components: weight stable (25), vitals logged (25), no critical risk (25), meds active (25)
        """
        score = 0.0

        # Weight not dangerously high
        if state.profile.weight_kg < 100:
            score += 25.0
        elif state.profile.weight_kg < 120:
            score += 15.0

        # Recent vitals logged
        if state.recent_vitals:
            score += 25.0
        elif state.recent_labs:
            score += 15.0

        # No critical risks
        from healthbot_v4.shared.models.base import RiskLevel
        if not state.active_risks:
            score += 25.0
        elif all(r.level not in (RiskLevel.high, RiskLevel.critical) for r in state.active_risks):
            score += 15.0

        # Active medications being managed
        if state.active_medications:
            score += 25.0

        return min(100.0, round(score, 1))

    def _compute_exercise_progress(
        self, state: PatientState, goals: List[HealthGoal]
    ) -> MetricProgress:
        """Steps progress toward goal."""
        target = 8000.0
        current = 0.0

        # Check goal
        for goal in goals:
            if goal.metric_name == "Daily Steps":
                target = goal.target_value
                current = goal.current_value

        progress_pct = min(100.0, (current / target * 100.0)) if target > 0 else 0.0
        trend = GoalTrend.improving if progress_pct > 50 else GoalTrend.stable

        return MetricProgress(
            metric_name="Daily Steps",
            current_value=current,
            target_value=target,
            unit="steps",
            progress_pct=round(progress_pct, 1),
            trend=trend,
            period_label="today",
        )

    def _compute_weight_trend(
        self, state: PatientState
    ) -> Optional[MetricProgress]:
        weight_vitals = [v for v in state.recent_vitals if v.vital_type == "weight"]
        if not weight_vitals:
            return None

        current = weight_vitals[0].value_primary
        baseline = state.profile.weight_kg
        target = round(baseline * 0.95, 1)

        if len(weight_vitals) >= 2:
            prev = weight_vitals[1].value_primary
            trend = GoalTrend.improving if current < prev else (GoalTrend.declining if current > prev else GoalTrend.stable)
        else:
            trend = GoalTrend.unknown

        progress = max(0.0, min(100.0, ((baseline - current) / max(baseline - target, 0.1)) * 100.0))

        return MetricProgress(
            metric_name="Body Weight",
            current_value=current,
            target_value=target,
            unit="kg",
            progress_pct=round(progress, 1),
            trend=trend,
            period_label="vs baseline",
        )

    def _compute_bp_trend(
        self, state: PatientState
    ) -> Optional[MetricProgress]:
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        if not bp_vitals:
            return None

        current = bp_vitals[0].value_primary
        target = 130.0

        if len(bp_vitals) >= 2:
            prev = bp_vitals[1].value_primary
            trend = GoalTrend.improving if current < prev else (GoalTrend.declining if current > prev else GoalTrend.stable)
        else:
            trend = GoalTrend.unknown

        # Progress: 0 = at 180+ mmHg, 100 = at target
        progress = max(0.0, min(100.0, ((180.0 - current) / (180.0 - target)) * 100.0))

        return MetricProgress(
            metric_name="Systolic Blood Pressure",
            current_value=current,
            target_value=target,
            unit="mmHg",
            progress_pct=round(progress, 1),
            trend=trend,
            period_label="latest vs previous",
        )

    def _compute_glucose_trend(
        self, state: PatientState
    ) -> Optional[MetricProgress]:
        hba1c_labs = [l for l in state.recent_labs if l.loinc_code == "4548-4"]
        if not hba1c_labs:
            return None

        current = hba1c_labs[0].value
        target = 7.0

        if len(hba1c_labs) >= 2:
            prev = hba1c_labs[1].value
            trend = GoalTrend.improving if current < prev else (GoalTrend.declining if current > prev else GoalTrend.stable)
        else:
            trend = GoalTrend.unknown

        # Progress toward <7.0 from whatever the baseline was
        baseline = max(current, 10.0)  # cap at 10 for scaling
        progress = max(0.0, min(100.0, ((baseline - current) / (baseline - target)) * 100.0)) if baseline != target else 100.0

        return MetricProgress(
            metric_name="HbA1c",
            current_value=current,
            target_value=target,
            unit="%",
            progress_pct=round(progress, 1),
            trend=trend,
            period_label="latest vs previous",
        )
