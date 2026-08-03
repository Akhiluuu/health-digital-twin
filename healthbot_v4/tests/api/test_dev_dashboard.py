"""
healthbot_v4/tests/api/test_dev_dashboard.py
Unit and API integration tests for VitalHealth v5.0 Developer Verification Dashboard.
"""

import pytest
from fastapi.testclient import TestClient
from healthbot_v4.apps.api.server import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_dev_dashboard_html_endpoint(client):
    response = client.get("/dev/dashboard")
    assert response.status_code == 200
    assert "VitalHealth v5.0 Developer Verification Dashboard" in response.text
    assert "HEALTH BRAIN CORE ONLINE" in response.text


def test_dev_status_endpoint(client):
    response = client.get("/api/v5/dev/status")
    assert response.status_code == 200
    data = response.json()
    assert "services" in data
    assert data["services"]["Gateway"]["status"] == "ONLINE"
    assert "Health Brain Core" in data["services"]


def test_dev_metrics_endpoint(client):
    response = client.get("/api/v5/dev/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "total_latency_ms" in data
    assert "llm_inference_ms" in data


def test_dev_latest_prompt_endpoint(client):
    response = client.get("/api/v5/dev/latest-prompt")
    assert response.status_code == 200
    data = response.json()
    assert "patient_id" in data
    assert "total_token_estimate" in data


def test_dev_events_endpoint(client):
    response = client.get("/api/v5/dev/events")
    assert response.status_code == 200
    events = response.json()
    assert isinstance(events, list)
    assert len(events) > 0
