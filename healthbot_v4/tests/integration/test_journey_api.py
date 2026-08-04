"""
healthbot_v4/tests/integration/test_journey_api.py
Integration test suite for the Health Journey Engine REST API endpoints.
Tests all 10 journey endpoints via FastAPI TestClient.
"""

import pytest
from fastapi.testclient import TestClient
from healthbot_v4.apps.api.server import app

client = TestClient(app)
PATIENT_ID = "usr_diabetic_john"


def test_get_full_journey_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}")
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == PATIENT_ID
    assert "health_score" in data
    assert "goals" in data
    assert "milestones" in data
    assert "insights" in data
    assert "progress" in data


def test_get_journey_snapshot_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/snapshot")
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == PATIENT_ID
    assert "health_score" in data
    assert "whats_changed_today" in data
    assert "todays_top_priority" in data
    assert "twin_insight" in data
    assert "status_color" in data


def test_get_journey_timeline_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/timeline?limit=50")
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert "count" in data


def test_get_journey_timeline_filtered():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/timeline?filter_type=milestones")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["events"], list)


def test_get_milestones_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/milestones")
    assert response.status_code == 200
    data = response.json()
    assert "milestones" in data
    assert isinstance(data["milestones"], list)


def test_get_goals_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/goals")
    assert response.status_code == 200
    data = response.json()
    assert "goals" in data
    assert "active_count" in data


def test_create_custom_goal_endpoint():
    payload = {
        "title": "Drink 2L Water",
        "description": "Daily hydration goal",
        "category": "lifestyle",
        "metric_name": "Water Intake",
        "target_value": 2000.0,
        "current_value": 1000.0,
        "unit": "ml",
        "recommendations": ["Carry water bottle"],
    }
    response = client.post(f"/api/v5/journey/{PATIENT_ID}/goals", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CREATED"
    assert data["goal"]["title"] == "Drink 2L Water"


def test_get_progress_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/progress")
    assert response.status_code == 200
    data = response.json()
    assert "medication_adherence_rate" in data
    assert "lifestyle_adherence_score" in data


def test_get_briefing_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/briefing")
    assert response.status_code == 200
    data = response.json()
    assert "greeting" in data
    assert "health_score" in data
    assert "todays_priorities" in data
    assert "motivational_message" in data


def test_get_insights_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/insights")
    assert response.status_code == 200
    data = response.json()
    assert "insights" in data
    assert isinstance(data["insights"], list)


def test_get_doctor_view_endpoint():
    response = client.get(f"/api/v5/journey/{PATIENT_ID}/doctor-view")
    assert response.status_code == 200
    data = response.json()
    assert "soap" in data
    assert "subjective" in data["soap"]
    assert "active_medications" in data
