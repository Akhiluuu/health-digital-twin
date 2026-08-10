"""
healthbot_v4/tests/api/test_v6_api_endpoints.py
Automated Integration Tests for Enterprise Health OS v6.0 FastAPI Gateway Endpoints.
Verifies counterfactual scenario queries, consent checks, and HITL task queue endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from healthbot_v4.apps.api.server import app

client = TestClient(app)


def test_v6_counterfactual_query_endpoint():
    payload = {
        "patient_id": "PX_V6_TEST",
        "query": "What happens if I stop taking Metformin?"
    }
    response = client.post("/api/v6/brain/query/counterfactual", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "scenario" in data
    assert "BioGears 90-Day Metabolic Scenario" in data["scenario"]["scenario_title"]


def test_v6_consent_evaluation_endpoint():
    payload = {
        "patient_id": "PX_V6_TEST",
        "requester_id": "doc_99",
        "requester_role": "PATIENT",
        "target_category": "MEDICATION"
    }
    response = client.post("/api/v6/patient/consent/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is True


def test_v6_hitl_tasks_endpoint():
    response = client.get("/api/v6/brain/safety/hitl-tasks")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_v6_onboarding_medical_search_endpoint():
    # Test query for diabetes across taxonomy
    response = client.post("/api/v6/onboarding/medical-search", json={"query": "diabetes", "category": "All", "limit": 10})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["total"] > 0
    assert len(data["results"]) > 0
    assert any("diabetes" in r["condition"].lower() for r in data["results"])


def test_v6_onboarding_adaptive_questions_endpoint():
    payload = {
        "patient_id": "PX_V6_TEST",
        "primary_goal": "weight_loss",
        "age": 35,
        "sex": "female",
        "selected_conditions": ["Type 2 Diabetes"]
    }
    response = client.post("/api/v6/onboarding/adaptive-questions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "categorized_taxonomy" in data
    assert "Cardiovascular" in data["categorized_taxonomy"]


def test_v6_onboarding_intake_endpoint():
    payload = {
        "patient_id": "PX_V6_TEST",
        "first_name": "Test",
        "last_name": "User",
        "height_cm": 175,
        "weight_kg": 70,
        "resting_hr": 70,
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "body_fat_pct": 20,
        "chronic_conditions": ["Hypertension", "Type 2 Diabetes"],
        "medications": ["Metformin", "Amlodipine"]
    }
    response = client.post("/api/v6/onboarding/intake", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["twin_activation"]["is_calibrated"] is True

