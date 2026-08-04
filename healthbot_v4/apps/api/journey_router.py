"""
healthbot_v4/apps/api/journey_router.py
Health Journey Engine REST API Router for VitalHealth v5.0.
Exposes 10 endpoints consumed by the React Native Journey Dashboard.
Mounts onto the main FastAPI application via server.py.
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.apps.brain.journey.journey_engine import JourneyEngine
from healthbot_v4.apps.brain.journey.goal_engine import GoalEngine
from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
from healthbot_v4.apps.brain.journey.progress_engine import ProgressEngine
from healthbot_v4.apps.brain.journey.journey_ai import JourneyAIEngine
from healthbot_v4.apps.brain.journey.journey_insights import JourneyInsightsEngine
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager

router = APIRouter(prefix="/api/v5/journey", tags=["Health Journey Engine"])

# Singleton instances — share state manager's shared dict
_journey_engine = JourneyEngine()
_goal_engine = GoalEngine()
_milestone_engine = MilestoneEngine()
_progress_engine = ProgressEngine()
_journey_ai = JourneyAIEngine()
_insights_engine = JourneyInsightsEngine()
_state_mgr = PatientStateManager()


class CreateGoalRequest(BaseModel):
    title: str
    description: str
    category: str
    metric_name: str
    target_value: float
    current_value: float
    unit: str
    recommendations: List[str] = []


# ─── Endpoint 1: Full Journey ─────────────────────────────────────────────────

@router.get("/{patient_id}", summary="Get Full Patient Journey")
async def get_full_journey(patient_id: str):
    """
    Returns the complete patient health journey: events, goals, milestones,
    insights, progress, longitudinal deltas, and health score history.
    """
    try:
        return _journey_engine.get_full_journey(patient_id)
    except Exception as e:
        logger.error(f"Journey API Error [{patient_id}]: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 2: Journey Snapshot (Dashboard) ────────────────────────────────

@router.get("/{patient_id}/snapshot", summary="Get Journey Dashboard Snapshot")
async def get_journey_snapshot(patient_id: str):
    """
    Compressed snapshot for the Journey Dashboard home screen.
    Answers: How am I doing? What changed? What should I do? What should I watch?
    """
    try:
        snapshot = _journey_engine.get_journey_snapshot(patient_id)
        return snapshot.model_dump(mode="json")
    except Exception as e:
        logger.error(f"Snapshot API Error [{patient_id}]: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 3: Timeline (filtered + searchable) ─────────────────────────────

@router.get("/{patient_id}/timeline", summary="Get Health Journey Timeline")
async def get_journey_timeline(
    patient_id: str,
    filter_type: Optional[str] = Query(
        None,
        description="Filter events: labs, medications, vitals, milestones, goals, risks, symptoms"
    ),
    search: Optional[str] = Query(None, description="Text search in event title/description"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    Returns the rich health timeline with optional filter and search.
    Supports: Patient mode (all events) and Doctor mode (clinical events only).
    """
    try:
        events = _journey_engine.get_filtered_timeline(
            patient_id,
            filter_type=filter_type,
            search_query=search,
            limit=limit,
        )
        return {"patient_id": patient_id, "events": events, "count": len(events)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 4: Milestones ───────────────────────────────────────────────────

@router.get("/{patient_id}/milestones", summary="Get Health Milestones")
async def get_milestones(patient_id: str):
    """Returns all detected health milestones for this patient."""
    try:
        state = _state_mgr.get_or_create_state(patient_id)

        from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
        store = _load_journey_store(patient_id)
        milestones = _milestone_engine.detect_milestones(state, store)
        return {
            "patient_id": patient_id,
            "milestones": [m.model_dump(mode="json") for m in milestones],
            "count": len(milestones),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 5: Goals (list) ─────────────────────────────────────────────────

@router.get("/{patient_id}/goals", summary="Get Active Health Goals")
async def get_goals(patient_id: str):
    """Returns all active and completed health goals."""
    try:
        state = _state_mgr.get_or_create_state(patient_id)
        from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
        store = _load_journey_store(patient_id)
        goals = _goal_engine.compute_goals(state, store)
        return {
            "patient_id": patient_id,
            "goals": [g.model_dump(mode="json") for g in goals],
            "active_count": sum(1 for g in goals if g.status.value == "active"),
            "completed_count": sum(1 for g in goals if g.status.value == "completed"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 6: Create Custom Goal ──────────────────────────────────────────

@router.post("/{patient_id}/goals", summary="Create Custom Health Goal")
async def create_goal(patient_id: str, req: CreateGoalRequest):
    """Creates a user-defined health goal."""
    try:
        goal = _goal_engine.create_custom_goal(
            patient_id=patient_id,
            title=req.title,
            description=req.description,
            category=req.category,
            metric_name=req.metric_name,
            target_value=req.target_value,
            current_value=req.current_value,
            unit=req.unit,
            recommendations=req.recommendations,
        )

        # Persist into store
        from healthbot_v4.apps.brain.journey.journey_engine import (
            _load_journey_store, _save_journey_store
        )
        store = _load_journey_store(patient_id)
        existing = store.get("goals", [])
        existing.append(goal.model_dump(mode="json"))
        store["goals"] = existing
        _save_journey_store(patient_id, store)

        return {"status": "CREATED", "goal": goal.model_dump(mode="json")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 7: Progress Report ─────────────────────────────────────────────

@router.get("/{patient_id}/progress", summary="Get Health Progress Report")
async def get_progress(patient_id: str):
    """Returns the full multi-dimensional health progress report."""
    try:
        state = _state_mgr.get_or_create_state(patient_id)
        from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
        store = _load_journey_store(patient_id)
        goals = _goal_engine.compute_goals(state, store)
        progress = _progress_engine.compute_progress(state, goals)
        return progress.model_dump(mode="json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 8: Daily Briefing v2 ───────────────────────────────────────────

@router.get("/{patient_id}/briefing", summary="Get AI Daily Health Briefing")
async def get_daily_briefing(patient_id: str):
    """
    Returns the full personalized daily health briefing (v2).
    Components: greeting, health score, status, priorities, risks,
    medication reminders, insights, goal progress, twin prediction,
    motivational coaching, and what's new.
    """
    try:
        state = _state_mgr.get_or_create_state(patient_id)
        from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
        store = _load_journey_store(patient_id)
        goals = _goal_engine.compute_goals(state, store)
        insights = _insights_engine.detect_insights(state, store)
        briefing = _journey_ai.generate_morning_briefing(patient_id, goals=goals, insights=insights)
        return briefing.model_dump(mode="json")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 9: Journey Insights ────────────────────────────────────────────

@router.get("/{patient_id}/insights", summary="Get Auto-Detected Health Insights")
async def get_insights(patient_id: str):
    """Returns all automatically detected health insights, sorted by severity."""
    try:
        state = _state_mgr.get_or_create_state(patient_id)
        from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
        store = _load_journey_store(patient_id)
        insights = _insights_engine.detect_insights(state, store)
        return {
            "patient_id": patient_id,
            "insights": [i.model_dump(mode="json") for i in insights],
            "count": len(insights),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Endpoint 10: Doctor View ─────────────────────────────────────────────────

@router.get("/{patient_id}/doctor-view", summary="Get Clinical Doctor View")
async def get_doctor_view(patient_id: str):
    """
    Returns a clinician-optimized journey view with SOAP summary,
    labs table, medication list, risk matrix, and longitudinal deltas.
    """
    try:
        return _journey_engine.get_doctor_view(patient_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
