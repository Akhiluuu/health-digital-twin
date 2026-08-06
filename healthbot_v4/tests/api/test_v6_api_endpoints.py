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
