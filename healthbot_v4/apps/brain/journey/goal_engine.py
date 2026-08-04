"""
healthbot_v4/apps/brain/journey/goal_engine.py
Dynamic Health Goal Engine — generates and tracks patient-specific health goals
based on active conditions, risk flags, and longitudinal trends.
All calculations are deterministic. Goals auto-create based on clinical context.
"""

import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientState, HealthGoal, GoalStatus, GoalTrend, RiskLevel,
    TimelineEventType,
)
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine

# ─── Goal Templates ──────────────────────────────────────────────────────────
# Each template defines how a goal is created and measured.

_GOAL_TEMPLATES = {
    "reduce_hba1c": {
        "title": "Reduce HbA1c",
        "description": "Lower HbA1c toward target range (< 7.0%)",
        "category": "labs",
        "metric_name": "HbA1c",
        "unit": "%",
        "target_value": 7.0,
        "recommendations": [
            "Follow prescribed Metformin regimen strictly",
            "Reduce refined carbohydrate intake",
            "Walk 30 minutes after each meal",
            "Schedule HbA1c recheck in 3 months",
        ],
        "trigger_loinc": "4548-4",
        "trigger_above": 7.0,
    },
    "reduce_bp": {
        "title": "Reduce Blood Pressure",
        "description": "Achieve systolic BP < 130 mmHg consistently",
        "category": "vitals",
        "metric_name": "Systolic BP",
        "unit": "mmHg",
        "target_value": 130.0,
        "recommendations": [
            "Take antihypertensives at the same time daily",
            "Limit sodium to < 2300 mg/day",
            "Log blood pressure readings twice daily",
            "Reduce caffeine and alcohol intake",
        ],
        "trigger_vital": "blood_pressure",
        "trigger_above": 130.0,
    },
    "lose_weight": {
        "title": "Achieve Healthy Weight",
        "description": "Reduce body weight by 5% from baseline",
        "category": "weight",
        "metric_name": "Body Weight",
        "unit": "kg",
        "trigger_conditions": ["obesity", "type 2 diabetes", "hypertension"],
        "recommendations": [
            "Target 500 kcal daily deficit",
            "Log meals and portions daily",
            "Aim for 10,000 steps per day",
            "Avoid sugary beverages",
        ],
    },
    "medication_adherence": {
        "title": "Maintain Medication Adherence",
        "description": "Take all prescribed medications as scheduled — 90%+ adherence",
        "category": "medications",
        "metric_name": "Adherence Rate",
        "unit": "%",
        "target_value": 90.0,
        "recommendations": [
            "Enable medication reminders in VitalHealth",
            "Prepare weekly pill organizer",
            "Never skip doses — consult doctor before stopping",
        ],
    },
    "increase_steps": {
        "title": "Increase Daily Steps",
        "description": "Reach 8,000+ steps per day consistently",
        "category": "lifestyle",
        "metric_name": "Daily Steps",
        "unit": "steps",
        "target_value": 8000.0,
        "recommendations": [
            "Take 10-minute walks after each meal",
            "Use stairs instead of elevator",
            "Track progress with step counter",
        ],
    },
    "hydration": {
        "title": "Daily Hydration Goal",
        "description": "Drink 2,000 ml of water per day",
        "category": "lifestyle",
        "metric_name": "Daily Water Intake",
        "unit": "ml",
        "target_value": 2000.0,
        "recommendations": [
            "Carry a 500 ml water bottle",
            "Set hourly hydration reminders",
            "Drink a glass of water before each meal",
        ],
    },
    "improve_sleep": {
        "title": "Improve Sleep Quality",
        "description": "Achieve 7-8 hours of quality sleep per night",
        "category": "lifestyle",
        "metric_name": "Sleep Duration",
        "unit": "hours",
        "target_value": 7.5,
        "recommendations": [
            "Maintain a consistent sleep schedule",
            "Avoid screens 1 hour before bedtime",
            "Keep bedroom temperature cool and dark",
        ],
    },
    "reduce_cholesterol": {
        "title": "Reduce LDL Cholesterol",
        "description": "Lower LDL to < 100 mg/dL",
        "category": "labs",
        "metric_name": "LDL Cholesterol",
        "unit": "mg/dL",
        "target_value": 100.0,
        "recommendations": [
            "Take statin medication as prescribed",
            "Reduce saturated fat intake",
            "Increase soluble fiber (oats, beans)",
            "Exercise 150 min/week",
        ],
        "trigger_loinc": "2089-1",
        "trigger_above": 100.0,
    },
}


class GoalEngine(HealthBrainSubsystem):
    """
    Dynamic Health Goal Engine.
    Auto-generates goals based on patient conditions, risk flags, and lab values.
    Merges with existing goals stored in the journey JSON store.
    """

    def __init__(self):
        super().__init__("goal_engine")
        self.timeline_engine = MedicalTimelineEngine()

    async def initialize(self) -> None:
        logger.info("🎯 Dynamic Goal Engine initialized")

    # ─── Public API ──────────────────────────────────────────────────────────

    def compute_goals(
        self,
        state: PatientState,
        store: Dict[str, Any],
    ) -> List[HealthGoal]:
        """
        Returns the full goal list for this patient.
        Auto-generates new goals when clinical triggers are met.
        Updates progress on existing goals.
        """
        existing_goals: Dict[str, Dict] = {
            g["goal_id"]: g for g in store.get("goals", [])
        }
        existing_template_ids = {
            g.get("template_id") for g in store.get("goals", [])
        }

        new_goals: List[HealthGoal] = []

        # ── Trigger: HbA1c above target ────────────────────────────────────
        hba1c_labs = [l for l in state.recent_labs if l.loinc_code == "4548-4"]
        if hba1c_labs and hba1c_labs[0].value > 7.0 and "reduce_hba1c" not in existing_template_ids:
            current = hba1c_labs[0].value
            goal = self._build_goal(state.patient_id, "reduce_hba1c", current)
            goal.expected_completion_date = (datetime.utcnow() + timedelta(days=90)).date()
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── Trigger: High BP ───────────────────────────────────────────────
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        if bp_vitals and bp_vitals[0].value_primary >= 130.0 and "reduce_bp" not in existing_template_ids:
            current = bp_vitals[0].value_primary
            goal = self._build_goal(state.patient_id, "reduce_bp", current)
            goal.expected_completion_date = (datetime.utcnow() + timedelta(days=60)).date()
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── Trigger: Active medications → adherence goal ───────────────────
        if state.active_medications and "medication_adherence" not in existing_template_ids:
            goal = self._build_goal(state.patient_id, "medication_adherence", 75.0)
            goal.expected_completion_date = (datetime.utcnow() + timedelta(days=30)).date()
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── Trigger: Obesity/Diabetes/HTN → weight goal ───────────────────
        condition_names_lower = [c.condition_name.lower() for c in state.current_conditions]
        weight_triggers = ["obesity", "type 2 diabetes", "hypertension"]
        if (
            any(trigger in " ".join(condition_names_lower) for trigger in weight_triggers)
            and "lose_weight" not in existing_template_ids
        ):
            current_weight = state.profile.weight_kg
            goal = self._build_goal(state.patient_id, "lose_weight", current_weight)
            goal.target_value = round(current_weight * 0.95, 1)  # 5% reduction
            goal.expected_completion_date = (datetime.utcnow() + timedelta(days=180)).date()
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── Always: Steps and Hydration goals (universal) ─────────────────
        if "increase_steps" not in existing_template_ids:
            goal = self._build_goal(state.patient_id, "increase_steps", 4000.0)
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        if "hydration" not in existing_template_ids:
            goal = self._build_goal(state.patient_id, "hydration", 1200.0)
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── LDL trigger ────────────────────────────────────────────────────
        ldl_labs = [l for l in state.recent_labs if l.loinc_code == "2089-1"]
        if ldl_labs and ldl_labs[0].value > 100.0 and "reduce_cholesterol" not in existing_template_ids:
            goal = self._build_goal(state.patient_id, "reduce_cholesterol", ldl_labs[0].value)
            goal.expected_completion_date = (datetime.utcnow() + timedelta(days=90)).date()
            new_goals.append(goal)
            self._record_goal_event(state.patient_id, goal, "created")

        # ── Update progress on existing goals ─────────────────────────────
        updated_existing: List[HealthGoal] = []
        for gdata in store.get("goals", []):
            goal = HealthGoal(**gdata)
            updated = self._update_goal_progress(goal, state)
            updated_existing.append(updated)
            if updated.status == GoalStatus.completed and gdata.get("status") != GoalStatus.completed:
                self._record_goal_event(state.patient_id, updated, "completed")

        all_goals = updated_existing + new_goals
        all_goals.sort(key=lambda g: (g.status == GoalStatus.completed, g.created_at))
        return all_goals

    def create_custom_goal(
        self,
        patient_id: str,
        title: str,
        description: str,
        category: str,
        metric_name: str,
        target_value: float,
        current_value: float,
        unit: str,
        recommendations: List[str],
    ) -> HealthGoal:
        """Creates a user-defined custom goal."""
        goal = HealthGoal(
            goal_id=str(uuid.uuid4()),
            patient_id=patient_id,
            title=title,
            description=description,
            category=category,
            metric_name=metric_name,
            target_value=target_value,
            current_value=current_value,
            unit=unit,
            recommendations=recommendations,
            progress_pct=self._calc_progress(current_value, target_value, current_value),
        )
        self._record_goal_event(patient_id, goal, "created")
        return goal

    # ─── Internal Helpers ────────────────────────────────────────────────────

    def _build_goal(
        self,
        patient_id: str,
        template_id: str,
        current_value: float,
    ) -> HealthGoal:
        t = _GOAL_TEMPLATES[template_id]
        target = t.get("target_value", current_value * 0.9)
        progress = self._calc_progress(current_value, target, current_value)
        return HealthGoal(
            goal_id=f"goal_{template_id}_{patient_id[:8]}",
            patient_id=patient_id,
            title=t["title"],
            description=t["description"],
            category=t["category"],
            metric_name=t["metric_name"],
            target_value=target,
            current_value=current_value,
            unit=t["unit"],
            progress_pct=progress,
            trend=GoalTrend.unknown,
            status=GoalStatus.active,
            recommendations=t.get("recommendations", []),
        )

    def _calc_progress(
        self, current: float, target: float, baseline: float
    ) -> float:
        """Progress toward target: 0 = at baseline, 100 = target reached."""
        if baseline == target:
            return 100.0
        # Handle both "reduce" and "increase" goals
        if target < baseline:
            # Reduce goal (e.g., HbA1c, BP, weight)
            total_distance = baseline - target
            covered = baseline - current
        else:
            # Increase goal (e.g., steps, hydration)
            total_distance = target - baseline
            covered = current - baseline

        if total_distance <= 0:
            return 100.0
        pct = (covered / total_distance) * 100.0
        return max(0.0, min(100.0, round(pct, 1)))

    def _update_goal_progress(
        self, goal: HealthGoal, state: PatientState
    ) -> HealthGoal:
        """Re-calculates current value and progress for existing goals."""
        prev_value = goal.current_value

        # Pull latest metric value
        if goal.category == "labs":
            loinc_map = {"HbA1c": "4548-4", "LDL Cholesterol": "2089-1"}
            loinc = loinc_map.get(goal.metric_name)
            if loinc:
                labs = [l for l in state.recent_labs if l.loinc_code == loinc]
                if labs:
                    goal.current_value = labs[0].value

        elif goal.category == "vitals" and goal.metric_name == "Systolic BP":
            bp = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
            if bp:
                goal.current_value = bp[0].value_primary

        elif goal.category == "weight":
            w = [v for v in state.recent_vitals if v.vital_type == "weight"]
            if w:
                goal.current_value = w[0].value_primary

        elif goal.category == "medications":
            # Adherence: proxy by checking active meds
            goal.current_value = 80.0 if state.active_medications else 0.0

        # Recalculate progress using baseline from original target
        # For "reduce" goals, baseline ≈ first current value
        baseline_proxy = goal.current_value + (goal.current_value - goal.target_value) * 0.5
        goal.progress_pct = self._calc_progress(goal.current_value, goal.target_value, baseline_proxy)

        # Trend
        if goal.current_value < prev_value and goal.target_value < goal.current_value:
            goal.trend = GoalTrend.improving
        elif goal.current_value > prev_value and goal.target_value < prev_value:
            goal.trend = GoalTrend.declining
        else:
            goal.trend = GoalTrend.stable

        # Status
        if goal.category in ("labs", "vitals", "weight"):
            if goal.target_value >= goal.current_value:  # reduce goals
                goal.status = GoalStatus.completed
        elif goal.progress_pct >= 90.0:
            goal.status = GoalStatus.completed

        goal.updated_at = datetime.utcnow()
        return goal

    def _record_goal_event(
        self, patient_id: str, goal: HealthGoal, action: str
    ) -> None:
        event_type_map = {
            "created": TimelineEventType.goal_created,
            "completed": TimelineEventType.goal_completed,
            "updated": TimelineEventType.goal_updated,
        }
        self.timeline_engine.record_event(
            patient_id,
            event_type_map.get(action, TimelineEventType.goal_updated),
            f"Goal {action.title()}: {goal.title}",
            goal.description,
            payload={"goal_id": goal.goal_id, "progress_pct": goal.progress_pct},
        )
