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
    events = []
    for i in range(5):
        events.append({
            "event_type": "substance",
            "substance_name": "Insulin",
            "value": 20.0,
            "unit": "U",
            "timestamp": start_ts + (i * 1800.0)  # Spaced 30 minutes apart
        })

    print(f"\nStarting simulation sync with {len(events)} insulin events (should result in physiological failure)...")
    try:
        res = _run_batch_sync_blocking(user_id, events)
        print("Simulation succeeded (unexpected):", res)
    except Exception as e:
        print("\nSUCCESS: Simulation failed as expected!")
        print("Caught exception details:")
        print(e)
        # Check if the state was rolled back to the pre-simulation state
        print("Is state file rolled back / exists?", state_file.exists())

if __name__ == "__main__":
    run_test()
