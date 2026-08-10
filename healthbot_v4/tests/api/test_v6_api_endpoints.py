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


def test_v6_offline_drug_interaction_endpoint():
    response = client.get("/api/v6/clinical/drug-interaction?drug_a=Warfarin&drug_b=Ibuprofen")
    assert response.status_code == 200
    data = response.json()
    assert data["has_interaction"] is True
    assert data["severity"] == "CRITICAL"
    assert "bleeding" in data["mechanism"].lower() or "bleeding" in data["advice"].lower()


def test_v6_offline_food_search_endpoint():
    response = client.get("/api/v6/nutrition/food-search?query=oats")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] > 0
    assert any("oat" in item["name"].lower() for item in data["items"])


def test_v6_hybrid_food_search_enrichment():
    response = client.get("/api/v6/nutrition/food-search?query=granola")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    if data["items"]:
        first_item = data["items"][0]
        assert "calories" in first_item
        assert "protein_g" in first_item
        assert "source" in first_item


def test_v6_hybrid_drug_interaction_query():
    response = client.get("/api/v6/clinical/drug-interaction?drug_a=Metformin&drug_b=Contrast")
    assert response.status_code == 200
    data = response.json()
    assert "has_interaction" in data
    assert "drug_a" in data


def test_v6_lab_micronutrient_correlation_endpoint():
    from datetime import datetime, timezone
    from healthbot_v4.apps.api.server import state_mgr
    from healthbot_v4.shared.models.base import NormalizedLab

    uid = "user_micronutrient_test"
    # Seed a low ferritin (iron deficiency) lab finding
    state_mgr.add_lab(uid, NormalizedLab(
        canonical_name="Ferritin",
        value=14.0,
        unit="ng/mL",
        reference_range="30-300",
        timestamp=datetime.now(timezone.utc)
    ))

    response = client.get(f"/api/v6/clinical/lab-micronutrient-correlation/{uid}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["deficiencies_count"] >= 1
    assert any(d["target_nutrient"] == "iron" for d in data["deficiencies"])
    assert len(data["recommended_foods"]) > 0
    assert any(f["food_name"] == "Spinach" for f in data["recommended_foods"])
    assert len(data["absorption_warnings"]) > 0
    assert any("Calcium" in w["warning_title"] for w in data["absorption_warnings"])


def test_v6_biometric_calorie_recalibration():
    uid = "user_telemetry_cal_test"
    response = client.get(f"/api/v6/telemetry/dynamic-calorie-targets/{uid}?steps=8500&heart_rate=88")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["telemetry_inputs"]["steps"] == 8500
    assert data["active_burn_breakdown"]["total_active_burn_kcal"] > 300
    assert data["recalibrated_daily_targets"]["total_calories_kcal"] > data["base_metabolic_profile"]["base_maintenance_kcal"]


def test_v6_medication_inventory_depletion_forecast():
    from healthbot_v4.apps.api.server import state_mgr
    from healthbot_v4.shared.models.base import NormalizedMedication

    uid = "user_depletion_test"
    # Seed a medication with only 4 pills remaining (2/day -> 2 days left -> 3-day refill warning)
    med = NormalizedMedication(
        name="Metformin",
        dose_quantity=500.0,
        dosage_form="mg",
        frequency="twice daily"
    )
    # Convert to dict payload with inventory attributes
    med_payload = med.model_dump()
    med_payload["pills_left"] = 4
    med_payload["daily_dosage"] = 2.0

    state = state_mgr.get_or_create_state(uid)
    state.active_medications.append(med)

    # Test direct forecast method
    from healthbot_v4.apps.notification.medication_intelligence_engine import MedicationIntelligenceEngine
    res_direct = MedicationIntelligenceEngine.forecast_inventory_depletion(uid, [med_payload])
    assert res_direct["status"] == "success"
    assert res_direct["urgent_refills_count"] == 1
    assert res_direct["forecasts"][0]["refill_recommended"] is True

    # Test API endpoint
    response = client.get(f"/api/v6/medication/depletion-forecast/{uid}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"







