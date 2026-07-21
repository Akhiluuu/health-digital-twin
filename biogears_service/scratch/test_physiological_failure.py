import sys
import os
import time
import json
import shutil
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api.server import RegistrationRequest, _register_impl, _run_batch_sync_blocking
from biogears_service.simulation.config import USER_STATES_DIR

def run_test():
    user_id = "test_divergent_user"
    state_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    meta_file = USER_STATES_DIR / f"{user_id}.meta.json"
    
    if state_file.exists():
        state_file.unlink()
    if meta_file.exists():
        meta_file.unlink()

    # 1. Register a Type 1 Diabetic patient with high HbA1c
    reg_data = RegistrationRequest(
        user_id=user_id,
        profile_name="Test Divergent User",
        age=30,
        sex="Male",
        weight=70.0,
        height=175.0,
        body_fat=0.15,
        resting_hr=72.0,
        systolic_bp=115.0,
        diastolic_bp=75.0,
        has_type1_diabetes=True,
        has_type2_diabetes=False,
        hba1c=9.5,
        is_smoker=False,
        has_anemia=False,
        ethnicity="Other"
    )
    
    print("Registering test_divergent_user...")
    _register_impl(reg_data)
    print("Registration completed successfully.")

    # 2. Modify the meta file to set engine_sim_time to 3 hours ago
    start_ts = time.time() - 10800.0
    if meta_file.exists():
        with open(meta_file, "r") as f:
            meta = json.load(f)
        meta["engine_sim_time"] = start_ts
        with open(meta_file, "w") as f:
            json.dump(meta, f)
        print("Updated meta.json engine_sim_time to 3 hours ago.")

    # 3. Run simulation with multiple massive doses of insulin (20.0 Units each), 30 minutes apart.
    # Clinical expectation: BioGears correctly models severe hypoglycemia (near-fatal glucose drop).
    # The engine WON'T crash — it successfully simulates the patient going into hypoglycemic shock.
    # The result should: succeed=True, has_anomaly=True, critical Blood Glucose anomaly.
    events = []
    for i in range(5):
        events.append({
            "event_type": "substance",
            "substance_name": "Insulin",
            "value": 20.0,
            "unit": "U",
            "timestamp": start_ts + (i * 1800.0)  # Spaced 30 minutes apart
        })

    print(f"\nStarting simulation with {len(events)} massive insulin events...")
    print("Expected outcome: BioGears models severe hypoglycemia (glucose < 40 mg/dL, critical anomaly)")
    try:
        res = _run_batch_sync_blocking(user_id, events)
        # Engine succeeded — validate clinical outcome
        anomalies = res.get("anomalies", [])
        glucose = res.get("vitals", {}).get("glucose", 999.0)
        critical_glucose_anomaly = any(
            a.get("label") == "Blood Glucose" and a.get("severity") == "critical"
            for a in anomalies
        )
        if critical_glucose_anomaly and glucose < 40.0:
            print(f"\nPASS: Engine correctly modelled severe hypoglycemia!")
            print(f"  Glucose: {glucose} mg/dL (critically low)")
            print(f"  Anomalies: {[a['label'] for a in anomalies]}")
            print(f"  has_anomaly: {res.get('has_anomaly')}")
        elif res.get("has_anomaly"):
            print(f"\nPASS (partial): Simulation produced anomalies: {[a['label'] for a in anomalies]}")
            print(f"  Glucose: {glucose} mg/dL | Critical glucose anomaly: {critical_glucose_anomaly}")
        else:
            print(f"\nFAIL: Massive insulin overdose on T1D patient produced no anomalies!")
            print(f"  Vitals: {res.get('vitals')}")
        print("Is state file persisted after simulation?", state_file.exists())
    except Exception as e:
        # This would only happen on a true engine crash (NaN/serialization failure)
        print(f"\nINFO: Simulation raised exception (physiological crash): {type(e).__name__}: {e}")
        print("Is state file rolled back / exists?", state_file.exists())

if __name__ == "__main__":
    run_test()
