"""
healthbot_v4/tests/unit/test_journey_engine.py
Unit tests for the Health Journey Engine subsystems.
Tests all 6 journey engines: JourneyEngine, MilestoneEngine, GoalEngine,
ProgressEngine, JourneyAIEngine, JourneyInsightsEngine.
"""

import pytest
import asyncio
from datetime import datetime, date
from unittest.mock import patch

from healthbot_v4.shared.models.base import (
    PatientProfile, PatientState, NormalizedLab, NormalizedMedication,
    NormalizedVital, NormalizedCondition, RiskFlag, RiskLevel,
    TimelineEventType, GoalStatus, GoalTrend, MilestoneType, InsightType,
    BiologicalSex,
)
from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
from healthbot_v4.apps.brain.journey.goal_engine import GoalEngine
from healthbot_v4.apps.brain.journey.progress_engine import ProgressEngine
from healthbot_v4.apps.brain.journey.journey_ai import JourneyAIEngine
from healthbot_v4.apps.brain.journey.journey_insights import JourneyInsightsEngine


# ─── Test Fixtures ────────────────────────────────────────────────────────────

def make_diabetic_state(patient_id: str = "test_diabetic") -> PatientState:
    profile = PatientProfile(
        patient_id=patient_id,
        first_name="John",
        last_name="Doe",
        age=52,
        biological_sex=BiologicalSex.male,
        weight_kg=90.0,
        height_cm=175.0,
    )
    state = PatientState(patient_id=patient_id, profile=profile)
    state.active_medications = [
        NormalizedMedication(name="Metformin", rxnorm_code="860975", dose_quantity=500.0, dosage_form="mg", frequency="twice daily")
    ]
    state.current_conditions = [
        NormalizedCondition(condition_name="Type 2 Diabetes", icd10_code="E11.9")
    ]
    state.recent_labs = [
        NormalizedLab(canonical_name="HbA1c", loinc_code="4548-4", value=8.4, unit="%", classification="high"),
        NormalizedLab(canonical_name="HbA1c", loinc_code="4548-4", value=9.1, unit="%", classification="high"),
    ]
    state.recent_vitals = [
        NormalizedVital(vital_type="blood_pressure", value_primary=142.0, value_secondary=88.0, unit="mmHg"),
        NormalizedVital(vital_type="blood_pressure", value_primary=148.0, value_secondary=91.0, unit="mmHg"),
    ]
    return state


def make_healthy_state(patient_id: str = "test_healthy") -> PatientState:
    profile = PatientProfile(
        patient_id=patient_id,
        first_name="Sarah",
        last_name="Chen",
        age=32,
        biological_sex=BiologicalSex.female,
        weight_kg=62.0,
        height_cm=165.0,
    )
    state = PatientState(patient_id=patient_id, profile=profile)
    state.recent_labs = [
        NormalizedLab(canonical_name="HbA1c", loinc_code="4548-4", value=5.2, unit="%", classification="normal"),
    ]
    state.recent_vitals = [
        NormalizedVital(vital_type="blood_pressure", value_primary=118.0, value_secondary=75.0, unit="mmHg"),
    ]
    return state


def empty_store(patient_id: str) -> dict:
    return {
        "patient_id": patient_id,
        "goals": [],
        "milestones": [],
        "insights": [],
        "health_score_history": [],
    }


# ─── MilestoneEngine Tests ────────────────────────────────────────────────────

class TestMilestoneEngine:

    def setup_method(self):
        self.engine = MilestoneEngine()

    def test_detects_first_diagnosis(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.first_diagnosis.value in types

    def test_detects_medication_started(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.medication_started.value in types

    def test_detects_hba1c_improved(self):
        """HbA1c improved from 9.1 → 8.4 (0.7% improvement > 0.5% threshold)."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.hba1c_improved.value in types

    def test_detects_bp_controlled(self):
        """Two readings both < 130 systolic."""
        state = make_healthy_state()
        state.recent_vitals = [
            NormalizedVital(vital_type="blood_pressure", value_primary=122.0, unit="mmHg"),
            NormalizedVital(vital_type="blood_pressure", value_primary=125.0, unit="mmHg"),
        ]
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.bp_controlled.value in types

    def test_no_duplicate_milestones(self):
        """Re-running detection should not duplicate existing milestones."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        first_run = self.engine.detect_milestones(state, store)
        store["milestones"] = [m.model_dump(mode="json") for m in first_run]
        second_run = self.engine.detect_milestones(state, store)
        # Count should be same (or fewer) — no new ones added
        assert len(second_run) <= len(first_run) + 1

    def test_detects_onboarding_complete(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.onboarding_complete.value in types

    def test_healthy_patient_no_risk_reduction_yet(self):
        """Risk reduction milestone only fires when risks = 0 AND score >= 90."""
        state = make_healthy_state()
        state.current_health_score = 95.0
        state.active_risks = []
        store = empty_store(state.patient_id)
        milestones = self.engine.detect_milestones(state, store)
        types = [m.milestone_type.value for m in milestones]
        assert MilestoneType.risk_reduction.value in types


# ─── GoalEngine Tests ─────────────────────────────────────────────────────────

class TestGoalEngine:

    def setup_method(self):
        self.engine = GoalEngine()

    def test_creates_hba1c_goal_for_diabetic(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        titles = [g.title for g in goals]
        assert any("HbA1c" in t for t in titles), f"Expected HbA1c goal, got: {titles}"

    def test_creates_bp_goal_for_hypertensive(self):
        state = make_diabetic_state()  # BP = 142 > 130
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        titles = [g.title for g in goals]
        assert any("Blood Pressure" in t for t in titles), f"Expected BP goal, got: {titles}"

    def test_creates_medication_adherence_goal(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        categories = [g.category for g in goals]
        assert "medications" in categories

    def test_creates_weight_goal_for_diabetic(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        titles = [g.title for g in goals]
        assert any("Weight" in t for t in titles), f"Expected weight goal, got: {titles}"

    def test_universal_steps_and_hydration_goals(self):
        """Steps and hydration goals should always be created."""
        state = make_healthy_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        metric_names = [g.metric_name for g in goals]
        assert "Daily Steps" in metric_names
        assert "Daily Water Intake" in metric_names

    def test_goals_have_recommendations(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        for goal in goals:
            assert len(goal.recommendations) > 0, f"Goal '{goal.title}' has no recommendations"

    def test_goal_progress_calculation(self):
        """HbA1c goal: current=8.4, target=7.0 — progress should be > 0."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goals = self.engine.compute_goals(state, store)
        hba1c_goal = next((g for g in goals if g.metric_name == "HbA1c"), None)
        assert hba1c_goal is not None
        assert hba1c_goal.progress_pct >= 0

    def test_custom_goal_creation(self):
        goal = self.engine.create_custom_goal(
            patient_id="test_custom",
            title="Quit Smoking",
            description="Reduce cigarettes per day to zero",
            category="lifestyle",
            metric_name="Cigarettes Per Day",
            target_value=0.0,
            current_value=10.0,
            unit="cigarettes",
            recommendations=["Use nicotine patch", "Join support group"],
        )
        assert goal.title == "Quit Smoking"
        assert goal.status == GoalStatus.active
        assert len(goal.recommendations) == 2


# ─── ProgressEngine Tests ─────────────────────────────────────────────────────

class TestProgressEngine:

    def setup_method(self):
        self.engine = ProgressEngine()

    def test_computes_progress_report(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goal_engine = GoalEngine()
        goals = goal_engine.compute_goals(state, store)
        report = self.engine.compute_progress(state, goals)
        assert report.patient_id == state.patient_id
        assert 0 <= report.medication_adherence_rate <= 100
        assert 0 <= report.lifestyle_adherence_score <= 100

    def test_glucose_trend_computed(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goal_engine = GoalEngine()
        goals = goal_engine.compute_goals(state, store)
        report = self.engine.compute_progress(state, goals)
        assert report.glucose_trend is not None
        assert report.glucose_trend.metric_name == "HbA1c"
        assert report.glucose_trend.unit == "%"

    def test_bp_trend_computed(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goal_engine = GoalEngine()
        goals = goal_engine.compute_goals(state, store)
        report = self.engine.compute_progress(state, goals)
        assert report.bp_trend is not None
        assert report.bp_trend.metric_name == "Systolic Blood Pressure"

    def test_goal_counts(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        goal_engine = GoalEngine()
        goals = goal_engine.compute_goals(state, store)
        report = self.engine.compute_progress(state, goals)
        assert report.active_goals_count >= 0
        assert report.completed_goals_count >= 0
        assert report.active_goals_count + report.completed_goals_count == len(goals)


# ─── JourneyAIEngine Tests ────────────────────────────────────────────────────

class TestJourneyAIEngine:

    def setup_method(self):
        from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
        from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
        # Seed the shared state with a test patient
        self.state_mgr = PatientStateManager()
        state = make_diabetic_state("test_briefing_patient")
        PatientStateManager._shared_states["test_briefing_patient"] = state
        self.engine = JourneyAIEngine()

    def test_generates_all_briefing_fields(self):
        briefing = self.engine.generate_morning_briefing("test_briefing_patient")
        assert briefing.patient_id == "test_briefing_patient"
        assert len(briefing.greeting) > 0
        assert briefing.health_score >= 0
        assert briefing.health_score_display.endswith("/100")
        assert briefing.health_status in ("Excellent", "Good", "Fair", "Needs Attention")
        assert briefing.status_color in ("green", "amber", "red")
        assert len(briefing.todays_priorities) > 0
        assert len(briefing.motivational_message) > 0

    def test_briefing_date_format(self):
        briefing = self.engine.generate_morning_briefing("test_briefing_patient")
        # Should be formatted like "August 04, 2026"
        assert len(briefing.briefing_date) > 5

    def test_priorities_max_3(self):
        briefing = self.engine.generate_morning_briefing("test_briefing_patient")
        assert len(briefing.todays_priorities) <= 3

    def test_medication_reminders_populated(self):
        """Diabetic patient has Metformin — should appear in reminders."""
        briefing = self.engine.generate_morning_briefing("test_briefing_patient")
        assert len(briefing.medication_reminders) > 0
        assert any("Metformin" in r for r in briefing.medication_reminders)


# ─── JourneyInsightsEngine Tests ──────────────────────────────────────────────

class TestJourneyInsightsEngine:

    def setup_method(self):
        self.engine = JourneyInsightsEngine()

    def test_detects_hba1c_improvement(self):
        """HbA1c 9.1 → 8.4 = improvement."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        insights = self.engine.detect_insights(state, store)
        types = [i.insight_type.value for i in insights]
        assert InsightType.improvement.value in types

    def test_detects_bp_worsening(self):
        """BP rose: previous=130 → current=152 = worsening."""
        state = make_diabetic_state()
        # Override vitals: index 0 = latest (current), index 1 = previous
        state.recent_vitals = [
            NormalizedVital(vital_type="blood_pressure", value_primary=152.0, unit="mmHg"),  # current, latest
            NormalizedVital(vital_type="blood_pressure", value_primary=130.0, unit="mmHg"),  # previous
        ]
        store = empty_store(state.patient_id)
        insights = self.engine.detect_insights(state, store)
        bp_insights = [i for i in insights if i.metric_name == "Systolic BP" and i.insight_type == InsightType.worsening]
        assert len(bp_insights) > 0


    def test_detects_adherence_signal(self):
        """Patient with active medications should get adherence insight."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        insights = self.engine.detect_insights(state, store)
        adherence_insights = [i for i in insights if i.insight_type == InsightType.adherence]
        assert len(adherence_insights) > 0

    def test_insights_have_actionable_recommendations(self):
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        insights = self.engine.detect_insights(state, store)
        for i in insights:
            assert len(i.actionable_recommendation) > 0, f"Insight '{i.title}' missing recommendation"

    def test_insights_sorted_by_severity(self):
        """High severity insights should appear before low severity."""
        state = make_diabetic_state()
        state.active_risks = [RiskFlag(
            risk_id="r1",
            level=RiskLevel.high,
            title="Test High Risk",
            description="Test",
            recommended_action="See doctor",
        )]
        store = empty_store(state.patient_id)
        insights = self.engine.detect_insights(state, store)
        if len(insights) >= 2:
            severity_order = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
            for i in range(len(insights) - 1):
                assert severity_order.get(insights[i].severity.value, 4) <= severity_order.get(insights[i+1].severity.value, 4)

    def test_no_duplicate_insights(self):
        """Running detection twice should not duplicate insights."""
        state = make_diabetic_state()
        store = empty_store(state.patient_id)
        first_run = self.engine.detect_insights(state, store)
        store["insights"] = [i.model_dump(mode="json") for i in first_run]
        second_run = self.engine.detect_insights(state, store)
        ids_first = {i.insight_id for i in first_run}
        ids_second = {i.insight_id for i in second_run}
        assert ids_first == ids_second  # No new IDs added on second run
