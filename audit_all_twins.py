import sys
import os
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from biogears_service.api.server import _run_batch_sync_blocking, _register_impl, RegistrationRequest
from biogears_service.simulation import scenario_builder, engine_runner

AUDIT_PROFILES = [
    ("akhil_reddy_9594", {"age": 28, "weight": 74.0, "height": 178.0, "sex": "Male", "body_fat": 0.18}, {}),
    ("audit_baseline_001", {"age": 30, "weight": 70.0, "height": 175.0, "sex": "Male", "body_fat": 0.15}, {}),
    ("audit_t1d_002", {"age": 25, "weight": 65.0, "height": 170.0, "sex": "Female", "body_fat": 0.22}, {"has_type1_diabetes": True, "hba1c": 8.5}),
    ("audit_t2d_003", {"age": 52, "weight": 92.0, "height": 172.0, "sex": "Male", "body_fat": 0.31}, {"has_type2_diabetes": True, "hba1c": 7.8}),
    ("audit_obese_004", {"age": 40, "weight": 115.0, "height": 168.0, "sex": "Female", "body_fat": 0.42}, {}),
    ("audit_htn_005", {"age": 58, "weight": 82.0, "height": 175.0, "sex": "Male", "body_fat": 0.25}, {"systolic_bp": 145.0, "diastolic_bp": 92.0}),
    ("audit_anemia_006", {"age": 34, "weight": 58.0, "height": 165.0, "sex": "Female", "body_fat": 0.23}, {"has_anemia": True}),
    ("audit_athlete_007", {"age": 24, "weight": 68.0, "height": 182.0, "sex": "Male", "body_fat": 0.10}, {"resting_hr": 48.0}),
    ("audit_geriatric_008", {"age": 78, "weight": 62.0, "height": 160.0, "sex": "Female", "body_fat": 0.28}, {}),
    ("audit_ckd_009", {"age": 63, "weight": 76.0, "height": 170.0, "sex": "Male", "body_fat": 0.24}, {"egfr": 42.0, "creatinine": 1.9}),
    ("audit_child_010", {"age": 12, "weight": 40.0, "height": 148.0, "sex": "Female", "body_fat": 0.18}, {})
]

def audit():
    results = {}
    print("=== STARTING AUDIT OF ALL 11 DIGITAL TWIN PROFILES ===")
    for user_id, profile, clin in AUDIT_PROFILES:
        print(f"\n--- Testing Twin: {user_id} ---")
        
        # Test basic water action
        test_event = [{
            "event_type": "water",
            "value": 250,
            "timestamp": None
        }]
        
        try:
            res = _run_batch_sync_blocking(user_id, test_event)
            v = res.get("vitals", {})
            hr = v.get("heart_rate")
            bp = v.get("blood_pressure")
            glucose = v.get("glucose")
            print(f"SUCCESS [{user_id}] -> HR: {hr}, BP: {bp}, Glucose: {glucose}")
            results[user_id] = f"PASSED (HR: {hr}, BP: {bp}, Glucose: {glucose})"
        except Exception as e:
            print(f"FAILED [{user_id}] -> {e}")
            print(f"Recalibrating {user_id} from scratch...")
            try:
                reg_req = RegistrationRequest(
                    user_id=user_id,
                    age=profile["age"],
                    weight=profile["weight"],
                    height=profile["height"],
                    sex=profile["sex"],
                    body_fat=profile["body_fat"],
                    clinical_config=clin
                )
                res_reg = _register_impl(reg_req)
                print(f"Recalibration result for {user_id}: {res_reg}")
                
                res = _run_batch_sync_blocking(user_id, test_event)
                v = res.get("vitals", {})
                hr = v.get("heart_rate")
                bp = v.get("blood_pressure")
                glucose = v.get("glucose")
                print(f"SUCCESS RECALIBRATED [{user_id}] -> HR: {hr}, BP: {bp}, Glucose: {glucose}")
                results[user_id] = f"PASSED (RECALIBRATED) (HR: {hr}, BP: {bp}, Glucose: {glucose})"
            except Exception as e2:
                print(f"CRITICAL RECALIBRATION FAILURE [{user_id}] -> {e2}")
                results[user_id] = f"FAILED: {e2}"

    print("\n" + "="*60)
    print("=== FINAL AUDIT RESULTS FOR ALL 11 TWINS ===")
    print("="*60)
    for k, v in results.items():
        print(f"{k:20s}: {v}")

if __name__ == "__main__":
    audit()
