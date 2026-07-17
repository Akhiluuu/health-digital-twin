import sys
import os
import time
import shutil
import gzip
import pandas as pd
from pathlib import Path
from unittest.mock import patch

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api.server import RegistrationRequest, _register_impl, _run_batch_sync_blocking
from biogears_service.simulation.config import USER_STATES_DIR, BIOGEARS_BIN_DIR, SCENARIO_API_DIR
from biogears_service.simulation.engine_runner import EngineResult

def mock_run_biogears_success(scenario_path, user_id):
    csv_prefix = Path(scenario_path).stem
    dest_csv = SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
    df = pd.DataFrame({
        "HeartRate(1/min)": [72.0, 72.5],
        "SystolicArterialPressure(mmHg)": [120.0, 120.0],
        "OxygenSaturation(unitless)": [0.98, 0.98],
        "CoreTemperature(degC)": [37.0, 37.0],
        "RespirationRate(1/min)": [14.0, 14.0],
        "Glucose-BloodConcentration(mg/dL)": [80.0, 80.0]
    })
    df.to_csv(dest_csv, index=False)
    
    state_out = BIOGEARS_BIN_DIR / f"batch_{user_id}.xml"
    real_xml_source = USER_STATES_DIR / "akhil_reddy_9594.xml"
    if not real_xml_source.exists():
        with gzip.open(str(USER_STATES_DIR / "akhil_reddy_9594.xml.gz"), "rb") as f_in:
            with open(str(real_xml_source), "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
    shutil.copy2(str(real_xml_source), str(state_out))
    return EngineResult(success=True, log_path="dummy.log", return_code=0)

def mock_run_biogears_failure(scenario_path, user_id):
    csv_prefix = Path(scenario_path).stem
    dest_csv = SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
    df = pd.DataFrame({
        "HeartRate(1/min)": [72.0, "1.#IND"],
        "SystolicArterialPressure(mmHg)": [120.0, 120.0],
        "OxygenSaturation(unitless)": [0.98, 0.98],
        "CoreTemperature(degC)": [37.0, 37.0],
        "RespirationRate(1/min)": [14.0, 14.0],
        "Glucose-BloodConcentration(mg/dL)": [80.0, 80.0]
    })
    df.to_csv(dest_csv, index=False)
    
    state_out = BIOGEARS_BIN_DIR / f"batch_{user_id}.xml"
    real_xml_source = USER_STATES_DIR / "akhil_reddy_9594.xml"
    if not real_xml_source.exists():
        with gzip.open(str(USER_STATES_DIR / "akhil_reddy_9594.xml.gz"), "rb") as f_in:
            with open(str(real_xml_source), "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
    shutil.copy2(str(real_xml_source), str(state_out))
    return EngineResult(success=True, log_path="dummy.log", return_code=0)

def run_test():
    user_id = "test_mock_user"
    state_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    meta_file = USER_STATES_DIR / f"{user_id}.meta.json"
    
    if state_file.exists():
        state_file.unlink()
    if meta_file.exists():
        meta_file.unlink()

    # Copy real state and meta files
    real_state = USER_STATES_DIR / "akhil_reddy_9594.xml.gz"
    real_meta = USER_STATES_DIR / "akhil_reddy_9594.meta.json"
    shutil.copy2(str(real_state), str(state_file))
    shutil.copy2(str(real_meta), str(meta_file))

    # Read original raw XML content to verify rollback
    with gzip.open(str(state_file), "rb") as f:
        original_xml_bytes = f.read()

    events = [
        {
            "event_type": "water",
            "value": 250.0,
            "timestamp": time.time()
        }
    ]

    # Test case 1: Healthy run (should succeed)
    print("--- Test Case 1: Healthy Run ---")
    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_run_biogears_success):
        try:
            res = _run_batch_sync_blocking(user_id, events)
            print("SUCCESS: Healthy run completed successfully:", res["status"])
        except Exception as e:
            print("FAILURE: Healthy run failed:", e)

    # Test case 2: Run resulting in IND/physiological failure (should raise 500 and rollback)
    print("\n--- Test Case 2: Run with IND/physiological failure ---")
    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_run_biogears_failure):
        try:
            res = _run_batch_sync_blocking(user_id, events)
            print("FAILURE: Simulation succeeded when it should have failed!")
        except Exception as e:
            print("SUCCESS: Simulation failed as expected!")
            print("Caught exception:", e)
            
            # Verify rollback: compare current raw decompressed XML bytes with original decompressed XML bytes
            if state_file.exists():
                try:
                    with gzip.open(str(state_file), "rb") as f:
                        current_xml_bytes = f.read()
                    if current_xml_bytes == original_xml_bytes:
                        print("SUCCESS: State file rolled back perfectly (decompressed XML matched)!")
                    else:
                        print("FAILURE: Rolled back state XML content differs from original!")
                except Exception as ex:
                    print("FAILURE: Failed to read decompressed state file:", ex)
            else:
                print("FAILURE: State file missing after rollback!")

    # Cleanup
    if state_file.exists():
        state_file.unlink()
    if meta_file.exists():
        meta_file.unlink()
    temp_xml = USER_STATES_DIR / "akhil_reddy_9594.xml"
    if temp_xml.exists():
        temp_xml.unlink()

if __name__ == "__main__":
    run_test()
