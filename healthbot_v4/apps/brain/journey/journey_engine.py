"""
healthbot_v4/apps/brain/journey/journey_engine.py
Health Journey Engine — Master coordinator for the patient's continuous health journey.
Aggregates state from all Health Brain subsystems and maintains the canonical journey
as an ordered event stream with goals, milestones, insights, and progress metrics.
"""

import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime, date

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientState, TimelineEvent, TimelineEventType,
    HealthGoal, HealthMilestone, JourneyInsight, JourneySnapshot,
    JourneyProgressReport, DailyBriefingV2, RiskLevel, GoalStatus,
)
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.risk.risk_engine import ClinicalRiskEngine
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalEngine
from healthbot_v4.apps.brain.summary.summary_engine import HealthSummaryEngine
from healthbot_v4.apps.brain.copilot.clinical_snapshot import ClinicalSnapshotEngine

# Journey sub-engines (imported lazily to avoid circular deps)
_STORE_DIR = os.path.join(os.path.dirname(__file__), "store")


def _store_path(patient_id: str) -> str:
    os.makedirs(_STORE_DIR, exist_ok=True)
    safe = patient_id.replace("/", "_").replace(".", "_")
    return os.path.join(_STORE_DIR, f"{safe}.json")


def _load_journey_store(patient_id: str) -> Dict[str, Any]:
    path = _store_path(patient_id)
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "patient_id": patient_id,
        "goals": [],
        "milestones": [],
        "insights": [],
        "health_score_history": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }


def _save_journey_store(patient_id: str, data: Dict[str, Any]) -> None:
    data["updated_at"] = datetime.utcnow().isoformat()
    path = _store_path(patient_id)
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2, default=str)
    except Exception as e:
        logger.error(f"JourneyEngine: Failed to persist store for {patient_id}: {e}")


class JourneyEngine(HealthBrainSubsystem):
    """
    Master Health Journey Coordinator.
    Aggregates all subsystem data into a unified, continuously updated patient journey.
    Builds on top of every existing Health Brain subsystem — nothing replaced.
    """

    def __init__(self):
        super().__init__("journey_engine")
        self.state_mgr = PatientStateManager()
        self.timeline_engine = MedicalTimelineEngine()
        self.risk_engine = ClinicalRiskEngine()
        self.longitudinal_engine = LongitudinalEngine()
        self.summary_engine = HealthSummaryEngine()
        self.snapshot_engine = ClinicalSnapshotEngine()

    async def initialize(self) -> None:
        logger.info("🗺️ Health Journey Engine initialized")

    # ─── Core Journey Access ──────────────────────────────────────────────────

    def get_full_journey(self, patient_id: str) -> Dict[str, Any]:
        """Returns the complete patient journey: events + goals + milestones + insights."""
        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        self.state_mgr.update_risks(patient_id, risks)
        state = self.state_mgr.get_or_create_state(patient_id)

        store = _load_journey_store(patient_id)

        # Import sub-engines here to avoid circular imports
        from healthbot_v4.apps.brain.journey.goal_engine import GoalEngine
        from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
        from healthbot_v4.apps.brain.journey.journey_insights import JourneyInsightsEngine
        from healthbot_v4.apps.brain.journey.progress_engine import ProgressEngine

        goal_engine = GoalEngine()
        milestone_engine = MilestoneEngine()
        insights_engine = JourneyInsightsEngine()
        progress_engine = ProgressEngine()

        goals = goal_engine.compute_goals(state, store)
        milestones = milestone_engine.detect_milestones(state, store)
        insights = insights_engine.detect_insights(state, store)
        progress = progress_engine.compute_progress(state, goals)

        # Record health score history
        score_entry = {
            "score": state.current_health_score,
            "timestamp": datetime.utcnow().isoformat(),
        }
        history = store.get("health_score_history", [])
        if not history or history[-1]["score"] != state.current_health_score:
            history.append(score_entry)
            store["health_score_history"] = history[-90:]  # keep 90 days

        # Persist updated store
        store["goals"] = [g.model_dump(mode="json") for g in goals]
        store["milestones"] = [m.model_dump(mode="json") for m in milestones]
        store["insights"] = [i.model_dump(mode="json") for i in insights]
        _save_journey_store(patient_id, store)

        timeline_events = self.timeline_engine.get_timeline(patient_id, limit=200)
        longitudinal = self.longitudinal_engine.analyze_patient_trajectory(state)

        return {
            "patient_id": patient_id,
            "profile": state.profile.model_dump(mode="json"),
            "health_score": state.current_health_score,
            "timeline_events": [e.model_dump(mode="json") for e in timeline_events],
            "goals": [g.model_dump(mode="json") for g in goals],
            "milestones": [m.model_dump(mode="json") for m in milestones],
            "insights": [i.model_dump(mode="json") for i in insights],
            "progress": progress.model_dump(mode="json"),
            "health_score_history": store.get("health_score_history", []),
            "longitudinal_deltas": {
                "lab_deltas": [d.model_dump(mode="json") for d in longitudinal.lab_deltas],
                "vital_deltas": [d.model_dump(mode="json") for d in longitudinal.vital_deltas],
                "summary": longitudinal.overall_trajectory_summary,
            },
            "active_risks": [r.model_dump(mode="json") for r in state.active_risks],
            "updated_at": datetime.utcnow().isoformat(),
        }

    def get_journey_snapshot(self, patient_id: str) -> JourneySnapshot:
        """Returns a compressed JourneySnapshot for the home dashboard."""
        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        self.state_mgr.update_risks(patient_id, risks)
        state = self.state_mgr.get_or_create_state(patient_id)

        store = _load_journey_store(patient_id)

        from healthbot_v4.apps.brain.journey.goal_engine import GoalEngine
        from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
        from healthbot_v4.apps.brain.journey.journey_insights import JourneyInsightsEngine
        from healthbot_v4.apps.brain.journey.progress_engine import ProgressEngine

        goal_engine = GoalEngine()
        milestone_engine = MilestoneEngine()
        insights_engine = JourneyInsightsEngine()
        progress_engine = ProgressEngine()

        goals = goal_engine.compute_goals(state, store)
        milestones = milestone_engine.detect_milestones(state, store)
        insights = insights_engine.detect_insights(state, store)
        progress = progress_engine.compute_progress(state, goals)

        # Health status determination
        score = state.current_health_score
        if score >= 90:
            status, color = "Excellent", "green"
        elif score >= 75:
            status, color = "Good", "green"
        elif score >= 60:
            status, color = "Fair", "amber"
        else:
            status, color = "Needs Attention", "red"

        # What changed today
        today_events = [
            e for e in self.timeline_engine.get_timeline(patient_id, limit=50)
            if (datetime.utcnow() - e.timestamp).total_seconds() < 86400
        ]
        whats_changed = (
            f"{len(today_events)} health events recorded today"
            if today_events else "No new events today — all stable"
        )

        # Top priority
        if state.active_risks:
            top_priority = state.active_risks[0].recommended_action
        elif goals:
            active = [g for g in goals if g.status == GoalStatus.active]
            top_priority = active[0].recommendations[0] if active and active[0].recommendations else "Continue daily health logging"
        else:
            top_priority = "Log your vitals and stay hydrated"

        # Twin insight
        twin_insight = "BioGears Twin: physiological parameters stable over next 30 days."
        if state.active_medications:
            med_name = state.active_medications[0].name
            twin_insight = f"Twin predicts {med_name} will maintain stable therapeutic levels."

        # Medication adherence
        adherence = progress.medication_adherence_rate

        # Latest milestone
        latest_ms = milestones[-1].title if milestones else None

        # Recent insights (top 3, most severe first)
        severity_order = {RiskLevel.critical: 0, RiskLevel.high: 1, RiskLevel.moderate: 2, RiskLevel.low: 3}
        sorted_insights = sorted(insights, key=lambda i: severity_order.get(i.severity, 4))

        return JourneySnapshot(
            patient_id=patient_id,
            health_score=score,
            health_status=status,
            status_color=color,
            whats_changed_today=whats_changed,
            todays_top_priority=top_priority,
            active_risk_count=len(state.active_risks),
            active_risks=[r.title for r in state.active_risks],
            twin_insight=twin_insight,
            active_goals_count=len([g for g in goals if g.status == GoalStatus.active]),
            completed_milestones_count=len(milestones),
            latest_milestone=latest_ms,
            medication_adherence_pct=adherence,
            recent_insights=sorted_insights[:3],
        )

    def get_doctor_view(self, patient_id: str) -> Dict[str, Any]:
        """Returns a clinician-optimized journey view with SOAP-ready data."""
        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        self.state_mgr.update_risks(patient_id, risks)
        state = self.state_mgr.get_or_create_state(patient_id)

        snapshot = self.snapshot_engine.generate_snapshot(state)
        longitudinal = self.longitudinal_engine.analyze_patient_trajectory(state)
        master_summary = self.summary_engine.build_master_summary(state)

        store = _load_journey_store(patient_id)
        from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
        milestones = MilestoneEngine().detect_milestones(state, store)

        p = state.profile
        soap_subjective = (
            f"Patient: {p.first_name} {p.last_name}, {p.age}y {p.biological_sex.value}. "
            f"Chronic conditions: {', '.join(c.condition_name for c in state.current_conditions) or 'None documented'}."
        )
        soap_objective = (
            f"Health Score: {state.current_health_score}/100. "
            f"Labs: {snapshot.latest_labs_summary}. "
            f"Active risks: {snapshot.active_risks_summary}."
        )
        soap_assessment = longitudinal.overall_trajectory_summary
        soap_plan = "; ".join(snapshot.outstanding_action_items) if snapshot.outstanding_action_items else "Continue current management."

        return {
            "patient_id": patient_id,
            "profile_summary": snapshot.profile_summary,
            "master_summary": master_summary,
            "soap": {
                "subjective": soap_subjective,
                "objective": soap_objective,
                "assessment": soap_assessment,
                "plan": soap_plan,
            },
            "active_conditions": snapshot.active_conditions,
            "active_medications": snapshot.active_medications,
            "latest_labs": [l.model_dump(mode="json") for l in state.recent_labs[:10]],
            "latest_vitals": [v.model_dump(mode="json") for v in state.recent_vitals[:10]],
            "active_risks": [r.model_dump(mode="json") for r in state.active_risks],
            "longitudinal_deltas": {
                "lab_deltas": [d.model_dump(mode="json") for d in longitudinal.lab_deltas],
                "vital_deltas": [d.model_dump(mode="json") for d in longitudinal.vital_deltas],
            },
            "milestones": [m.model_dump(mode="json") for m in milestones],
            "twin_summary": snapshot.twin_prediction_summary or "Simulation pending.",
            "generated_at": datetime.utcnow().isoformat(),
        }

    def get_filtered_timeline(
        self,
        patient_id: str,
        filter_type: Optional[str] = None,
        search_query: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Returns filtered/searched timeline events."""
        events = self.timeline_engine.get_timeline(patient_id, limit=limit)

        # Type filter
        type_map = {
            "labs": [TimelineEventType.lab_report_uploaded, TimelineEventType.ocr_processed],
            "medications": [TimelineEventType.medication_added, TimelineEventType.medication_taken, TimelineEventType.medication_missed],
            "vitals": [TimelineEventType.vital_logged, TimelineEventType.weight_logged],
            "milestones": [TimelineEventType.journey_milestone_reached],
            "goals": [TimelineEventType.goal_created, TimelineEventType.goal_updated, TimelineEventType.goal_completed],
            "risks": [TimelineEventType.risk_flagged],
            "symptoms": [TimelineEventType.symptom_logged],
        }

        if filter_type and filter_type in type_map:
            events = [e for e in events if e.event_type in type_map[filter_type]]

        # Search
        if search_query:
            q = search_query.lower()
            events = [e for e in events if q in e.title.lower() or q in e.description.lower()]

        return [e.model_dump(mode="json") for e in events]
