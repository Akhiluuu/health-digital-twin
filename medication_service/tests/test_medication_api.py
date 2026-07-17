"""
medication_service/tests/test_medication_api.py
Integration tests for the Medication Vault API using pytest + httpx.AsyncClient.
Run with: pytest medication_service/tests/ -v
"""
from __future__ import annotations
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from medication_service.api.app import app

# Dev auth header — requires ALLOW_DEV_AUTH=true in test env
TEST_USER = "test_user_001"
HEADERS = {"X-Dev-User-Id": TEST_USER}

BASE = "/api/v1/medication"


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ── Health ────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_health(client):
    r = await client.get(f"{BASE}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Medicine CRUD ─────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_create_medicine(client):
    payload = {
        "name": "Metformin",
        "generic_name": "metformin hcl",
        "strength": "500mg",
        "dosage_form": "tablet",
        "dose_quantity": "1",
        "dose_unit": "tablet",
        "frequency": "twice_daily",
        "meal_relation": "after",
        "start_date": "2026-01-01",
        "priority": "critical",
        "biogears_linked": False,
        "reminder_enabled": True,
        "inventory_count": 60,
    }
    r = await client.post(f"{BASE}/medicine", json=payload, headers=HEADERS)
    assert r.status_code == 201
    data = r.json()
    assert data["success"] is True
    assert data["data"]["name"] == "Metformin"
    return data["data"]["id"]


@pytest.mark.anyio
async def test_list_medicines(client):
    r = await client.get(f"{BASE}/medicine", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert isinstance(data["data"], list)


@pytest.mark.anyio
async def test_compliance_empty(client):
    r = await client.get(f"{BASE}/compliance?days=7", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_analytics_weekly(client):
    r = await client.get(f"{BASE}/analytics/weekly", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_analytics_monthly(client):
    r = await client.get(f"{BASE}/analytics/monthly", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_cost_analysis(client):
    r = await client.get(f"{BASE}/analytics/cost", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_today_schedule(client):
    r = await client.get(f"{BASE}/schedule/today", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_upcoming_schedule(client):
    r = await client.get(f"{BASE}/schedule/upcoming?hours=24", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_list_inventory(client):
    r = await client.get(f"{BASE}/inventory", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_get_history(client):
    r = await client.get(f"{BASE}/history", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_list_prescriptions(client):
    r = await client.get(f"{BASE}/prescription", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_pending_reminders(client):
    r = await client.get(f"{BASE}/reminders/pending", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_get_settings(client):
    r = await client.get(f"{BASE}/settings", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_update_settings(client):
    r = await client.put(
        f"{BASE}/settings",
        json={"reminder_advance_minutes": 10, "low_stock_threshold": 7},
        headers=HEADERS,
    )
    assert r.status_code == 200


@pytest.mark.anyio
async def test_list_caregivers(client):
    r = await client.get(f"{BASE}/family/caregivers", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_audit_trail(client):
    r = await client.get(f"{BASE}/audit", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_achievements(client):
    r = await client.get(f"{BASE}/achievements", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_ai_chat(client):
    r = await client.post(
        f"{BASE}/ai/chat",
        json={"message": "What should I do if I missed my Metformin dose?"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert "reply" in data["data"]


@pytest.mark.anyio
async def test_barcode_lookup_not_found(client):
    r = await client.get(f"{BASE}/barcode?barcode=NOTEXIST", headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.anyio
async def test_interaction_check_invalid_ids(client):
    """Single medicine ID should fail validation (min 2 required)."""
    r = await client.post(
        f"{BASE}/interaction/check",
        json={"medicine_ids": ["00000000-0000-0000-0000-000000000001"]},
        headers=HEADERS,
    )
    assert r.status_code == 422


@pytest.mark.anyio
async def test_emergency_profile_not_found(client):
    r = await client.get(f"{BASE}/emergency/invalid_token_xyz", headers=HEADERS)
    assert r.status_code == 404
