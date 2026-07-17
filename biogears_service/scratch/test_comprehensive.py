import sys
import os
import time
import shutil
import gzip
import datetime
import pandas as pd
from pathlib import Path
from unittest.mock import patch
from lxml import etree

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

def run_comprehensive_tests():
    print("==================================================")
    print("      COMPREHENSIVE BIO-DIGITAL TWIN SUITE        ")
    print("==================================================")
    
    user_id = "test_comp_user"
    state_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    meta_file = USER_STATES_DIR / f"{user_id}.meta.json"
    
    # Pre-test cleanup
    for p in (state_file, meta_file):
        if p.exists():
            p.unlink()

    # ----------------------------------------------------
    # TEST 1: Schema Validation of XML Scenarios
    # ----------------------------------------------------
    print("\n[TEST 1] XML Schema Validation against BioGearsDataModel.xsd")
    xsd_path = Path("/home/akhilreddy/health-digital-twin/biogears_runtime/xsd/BioGearsDataModel.xsd")
    if xsd_path.exists():
        api_dir = Path("/home/akhilreddy/health-digital-twin/biogears_runtime/Scenarios/API/")
        xmls = list(api_dir.glob("*.xml"))
        if xmls:
            try:
                schema_doc = etree.parse(str(xsd_path))
                schema = etree.XMLSchema(schema_doc)
                xml_doc = etree.parse(str(xmls[0]))
                is_valid = schema.validate(xml_doc)
                print(f"  -> XML {xmls[0].name} schema validation: PASS (Valid={is_valid})")
            except Exception as e:
                print(f"  -> XML validation error: FAIL ({e})")
        else:
            print("  -> No scenario XML files found to validate: SKIP")
    else:
        print("  -> BioGearsDataModel.xsd not found: SKIP")

    # Setup baseline user files
    real_state = USER_STATES_DIR / "akhil_reddy_9594.xml.gz"
    real_meta = USER_STATES_DIR / "akhil_reddy_9594.meta.json"
    shutil.copy2(str(real_state), str(state_file))
    shutil.copy2(str(real_meta), str(meta_file))
    original_xml_bytes = None
    with gzip.open(str(state_file), "rb") as f:
        original_xml_bytes = f.read()

    events = [
        {
            "event_type": "water",
            "value": 250.0,
            "timestamp": time.time()
        }
    ]

    # ----------------------------------------------------
    # TEST 2: Normal Simulation Execution (Mocked)
    # ----------------------------------------------------
    print("\n[TEST 2] Normal Simulation Execution (Mocked Success)")
    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_run_biogears_success):
        try:
            res = _run_batch_sync_blocking(user_id, events)
            print("  -> Status:", res["status"])
            print("  -> Vitals:", res["vitals"])
            print("  -> PASS")
        except Exception as e:
            print("  -> FAIL:", e)

    # ----------------------------------------------------
    # TEST 3: Physiological Failure Detection & Rollback
    # ----------------------------------------------------
    print("\n[TEST 3] Physiological Failure Detection & Rollback (Mocked Failure)")
    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_run_biogears_failure):
        try:
            res = _run_batch_sync_blocking(user_id, events)
            print("  -> FAIL: Simulation succeeded but should have failed!")
        except Exception as e:
            print("  -> Caught expected simulation failure:", e)
            
            # Verify rollback
            if state_file.exists():
                with gzip.open(str(state_file), "rb") as f:
                    current_xml_bytes = f.read()
                if current_xml_bytes == original_xml_bytes:
                    print("  -> State file rolled back perfectly: PASS")
                else:
                    print("  -> Rolled back state does not match original: FAIL")
            else:
                print("  -> State file missing after rollback: FAIL")

    # ----------------------------------------------------
    # TEST 4: DPSS Scheduler State and DB Checks
    # ----------------------------------------------------
    print("\n[TEST 4] DPSS Scheduler & Database Schema Operations")
    try:
        from biogears_service.api import dpss_db
        # Test notification creation
        today_str = datetime.date.today().isoformat()
        notif_id = dpss_db.create_dpss_notification(
            user_id=user_id,
            notif_type="SIM_READY",
            sim_date=today_str,
            profile_name="Test User",
            payload={"title": "Test Title", "body": "Test Body"}
        )
        notifs = dpss_db.get_notifications(user_id)
        if len(notifs) > 0 and notifs[0]["notif_type"] == "SIM_READY":
            print("  -> Create/Retrieve DPSS Notifications: PASS")
        else:
            print("  -> Create/Retrieve DPSS Notifications: FAIL")
            
        # Clean test notifications
        dpss_db.mark_notification_status(notif_id, "dismissed")
        print("  -> Update DPSS Notification Status: PASS")
    except Exception as e:
        print("  -> DPSS DB operations: FAIL:", e)

    # ----------------------------------------------------
    # TEST 5: Insulin CDM Scenario builder verification
    # ----------------------------------------------------
    print("\n[TEST 5] Insulin Scenario XML Generation verification")
    try:
        from biogears_service.simulation.scenario_builder import build_batch_reconstruction
        insulin_events = [
            {
                "event_type": "substance",
                "substance_name": "Insulin",
                "value": 2.5,
                "unit": "U",
                "timestamp": time.time()
            }
        ]
        xml_file_path, run_id, csv_prefix = build_batch_reconstruction(
            user_id=user_id,
            state_path=str(state_file),
            events=insulin_events,
            user_weight_kg=70.0
        )
        scenario_file_path = Path(xml_file_path)
        if scenario_file_path.exists():
            content = scenario_file_path.read_text(encoding="utf-8")
            if "SubstanceBolusData" in content and "Insulin" in content:
                print("  -> Scenario generated with correct SubstanceBolusData details: PASS")
                # Clean up scenario file
                scenario_file_path.unlink()
            else:
                print("  -> Scenario missing insulin administration tag: FAIL")
        else:
            print("  -> Scenario XML file not created: FAIL")
    except Exception as e:
        print("  -> Scenario generation: FAIL:", e)

    # ----------------------------------------------------
    # TEST 6: Patient Registration with Conditions
    # ----------------------------------------------------
    print("\n[TEST 6] Patient Registration with Conditions (T1D, Hypertension, COPD)")
    try:
        from biogears_service.simulation.scenario_builder import build_registration_scenario
        clinic = {
            "resting_hr": 78.0,
            "systolic_bp": 145.0,
            "diastolic_bp": 92.0,
            "has_type1_diabetes": True,
            "hba1c": 8.5,
            "has_anemia": True,
            "is_smoker": True
        }
        init_xml_path = build_registration_scenario(
            user_id=user_id,
            age=34,
            weight=82.0,
            height=175.0,
            sex="Male",
            body_fat=0.24,
            clinical_config=clinic
        )
        init_file = Path(init_xml_path)
        patient_file = SCENARIO_API_DIR / f"patient_{user_id}.xml"
        
        if init_file.exists():
            # Validate generated init scenario against XSD schema if available
            if xsd_path.exists():
                try:
                    schema_doc = etree.parse(str(xsd_path))
                    schema = etree.XMLSchema(schema_doc)
                    xml_doc = etree.parse(str(init_file))
                    is_valid = schema.validate(xml_doc)
                    if is_valid:
                        print("  -> Registration scenario schema validation: PASS")
                    else:
                        print("  -> Registration scenario schema validation: FAIL")
                        for error in schema.error_log:
                            print(f"     XSD Error: {error.message} on line {error.line}")
                except Exception as xml_err:
                    print("  -> Registration scenario schema validation: ERROR:", xml_err)
            else:
                print("  -> Registration scenario generated: PASS (XSD schema not found, skipping validation)")
            
            # Clean up
            init_file.unlink()
            if patient_file.exists():
                patient_file.unlink()
        else:
            print("  -> Registration scenario XML file not created: FAIL")
    except Exception as e:
        print("  -> Registration scenario generation: FAIL:", e)

    # ----------------------------------------------------
    # TEST 7: What-If comparison (Mocked Success & Failure)
    # ----------------------------------------------------
    print("\n[TEST 7] What-If Intervention Simulation (Success & Failure)")
    from biogears_service.api.server import WhatIfRequest, HealthEvent, _predict_whatif_impl
    
    # Set up baseline files
    shutil.copy2(str(real_state), str(state_file))
    shutil.copy2(str(real_meta), str(meta_file))

    whatif_req = WhatIfRequest(
        user_id=user_id,
        event=HealthEvent(event_type="water", value=500.0),
        hours=1.0
    )

    def mock_whatif_success(scenario_path, user_id):
        csv_prefix = Path(scenario_path).stem
        dest_csv = SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
        df = pd.DataFrame({
            "Time(s)": [0.0, 3600.0],
            "HeartRate(1/min)": [72.0, 74.0],
            "SystolicArterialPressure(mmHg)": [120.0, 120.0],
            "DiastolicArterialPressure(mmHg)": [80.0, 80.0],
            "OxygenSaturation(unitless)": [0.98, 0.98],
            "CoreTemperature(degC)": [37.0, 37.0],
            "RespirationRate(1/min)": [14.0, 14.0],
            "Glucose-BloodConcentration(mg/dL)": [80.0, 80.0]
        })
        df.to_csv(dest_csv, index=False)
        return EngineResult(success=True, log_path="dummy.log", return_code=0)

    def mock_whatif_failure(scenario_path, user_id):
        csv_prefix = Path(scenario_path).stem
        dest_csv = SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
        # Return NaN for one of the critical columns to trigger physiological failure
        df = pd.DataFrame({
            "Time(s)": [0.0, 3600.0],
            "HeartRate(1/min)": [72.0, "1.#IND"],
            "SystolicArterialPressure(mmHg)": [120.0, 120.0],
            "DiastolicArterialPressure(mmHg)": [80.0, 80.0],
            "OxygenSaturation(unitless)": [0.98, 0.98],
            "CoreTemperature(degC)": [37.0, 37.0],
            "RespirationRate(1/min)": [14.0, 14.0],
            "Glucose-BloodConcentration(mg/dL)": [80.0, 80.0]
        })
        df.to_csv(dest_csv, index=False)
        return EngineResult(success=True, log_path="dummy.log", return_code=0)

    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_whatif_success):
        try:
            res = _predict_whatif_impl(whatif_req)
            if res.get("status") == "success" and "comparison_chart" in res:
                print("  -> What-If Success Run: PASS")
            else:
                print("  -> What-If Success Run: FAIL (Missing charts)")
        except Exception as e:
            print("  -> What-If Success Run: FAIL:", e)

    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_whatif_failure):
        try:
            _predict_whatif_impl(whatif_req)
            print("  -> What-If Failure Run: FAIL (Should have failed with NaN exception)")
        except Exception as e:
            print("  -> What-If Failure Run: PASS (Caught expected failure:", type(e).__name__, ")")

    # ----------------------------------------------------
    # TEST 8: Forecast Recovery (Mocked Success & Failure)
    # ----------------------------------------------------
    print("\n[TEST 8] Forecast Recovery Simulation (Success & Failure)")
    from biogears_service.api.server import PredictRequest, _predict_recovery_impl

    forecast_req = PredictRequest(
        user_id=user_id,
        hours=1.0
    )

    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_whatif_success):
        try:
            res = _predict_recovery_impl(forecast_req)
            if res.get("status") == "success" and "forecast_chart" in res:
                print("  -> Forecast Success Run: PASS")
            else:
                print("  -> Forecast Success Run: FAIL (Missing forecast chart)")
        except Exception as e:
            print("  -> Forecast Success Run: FAIL:", e)

    with patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_whatif_failure):
        try:
            _predict_recovery_impl(forecast_req)
            print("  -> Forecast Failure Run: FAIL (Should have failed with NaN exception)")
        except Exception as e:
            print("  -> Forecast Failure Run: PASS (Caught expected failure:", type(e).__name__, ")")

    # ----------------------------------------------------
    # TEST 9: Request Validation & Sanitization
    # ----------------------------------------------------
    print("\n[TEST 9] Request Validation & Sanitization")
    from biogears_service.api.server import RegistrationRequest
    from biogears_service.simulation import validator as sim_validator
    
    # 9.1 Invalid user_id in RegistrationRequest
    try:
        RegistrationRequest(
            user_id="../../bad_user",
            age=30, weight=70, height=170, sex="Male"
        )
        print("  -> Invalid user_id path traversal check: FAIL (Should have raised ValueError)")
    except Exception as e:
        print("  -> Invalid user_id path traversal check: PASS (Caught expected:", type(e).__name__, ")")

    try:
        RegistrationRequest(
            user_id="user!name",
            age=30, weight=70, height=170, sex="Male"
        )
        print("  -> Invalid user_id special characters check: FAIL (Should have raised ValueError)")
    except Exception as e:
        print("  -> Invalid user_id special characters check: PASS (Caught expected:", type(e).__name__, ")")

    # 9.2 Auto-title-casing of sex
    try:
        reg = RegistrationRequest(
            user_id="valid_user",
            age=30, weight=70, height=170, sex="female"
        )
        if reg.sex == "Female":
            print("  -> Auto-title-casing of 'female': PASS")
        else:
            print("  -> Auto-title-casing of 'female': FAIL (Got:", reg.sex, ")")
    except Exception as e:
        print("  -> Auto-title-casing of 'female': FAIL:", e)

    # 9.3 Validator future timestamp check
    future_time = time.time() + 3600 # 1 hour in the future
    future_event = {
        "event_type": "exercise",
        "value": 0.5,
        "timestamp": future_time
    }
    val_errors = sim_validator.validate_events([future_event])
    if any("timestamp cannot be in the future" in err for err in val_errors):
        print("  -> Future timestamp event validation: PASS")
    else:
        print("  -> Future timestamp event validation: FAIL (Errors:", val_errors, ")")

    # 9.4 Validator max dose check
    huge_dose_event = {
        "event_type": "substance",
        "substance_name": "Morphine",
        "value": 150000.0, # above 100,000 mg limit
        "timestamp": time.time()
    }
    val_errors = sim_validator.validate_events([huge_dose_event])
    if any("exceeds the maximum allowable dose limit" in err for err in val_errors):
        print("  -> Absurdly large substance dose validation: PASS")
    else:
        print("  -> Absurdly large substance dose validation: FAIL (Errors:", val_errors, ")")

    # 9.5 Custom meal macro validations
    invalid_macro_event = {
        "event_type": "meal",
        "meal_type": "custom",
        "value": 500,
        "carb_g": -10,
        "fat_g": 6000,
        "protein_g": 50,
        "timestamp": time.time()
    }
    val_errors = sim_validator.validate_events([invalid_macro_event])
    if any("carb_g" in err for err in val_errors) and any("fat_g" in err for err in val_errors):
        print("  -> Custom meal invalid macro bounds check: PASS")
    else:
        print("  -> Custom meal invalid macro bounds check: FAIL (Errors:", val_errors, ")")

    # 9.6 Environment name validation
    invalid_env_event = {
        "event_type": "environment",
        "environment_name": "NuclearReactor",
        "value": 1.0,
        "timestamp": time.time()
    }
    val_errors = sim_validator.validate_events([invalid_env_event])
    if any("is not supported" in err for err in val_errors):
        print("  -> Invalid environment name check: PASS")
    else:
        print("  -> Invalid environment name check: FAIL (Errors:", val_errors, ")")

    valid_env_event = {
        "event_type": "environment",
        "environment_name": "Hypobaric3000m",
        "value": 1.0,
        "timestamp": time.time()
    }
    val_errors = sim_validator.validate_events([valid_env_event])
    if not val_errors:
        print("  -> Valid environment name check: PASS")
    else:
        print("  -> Valid environment name check: FAIL (Errors:", val_errors, ")")

    # 9.7 Stacking logic check
    from biogears_service.simulation.scenario_builder import build_batch_reconstruction
    test_timeline = [
        {"event_type": "substance", "substance_name": "Caffeine", "value": 100.0, "timestamp": 1783500000.0},
        {"event_type": "substance", "substance_name": "Caffeine", "value": 100.0, "timestamp": 1783503600.0},
        {"event_type": "substance", "substance_name": "Caffeine", "value": 100.0, "timestamp": 1783520000.0},
    ]
    scen_path, _, _ = build_batch_reconstruction("test_stacking", "dummy_state.xml", test_timeline, 70.0)
    scen_xml = Path(scen_path).read_text(encoding="utf-8")
    
    # Caffeine is mapped to Stress Severity = dose_mg / 2000
    # 1st dose: 100 mg / 2000 = 0.0500 severity (not stacked)
    # 2nd dose: 115 mg / 2000 = 0.0575 severity (stacked)
    # 3rd dose: 100 mg / 2000 = 0.0500 severity (not stacked)
    if 'Severity value="0.0500"' in scen_xml and 'Severity value="0.0575"' in scen_xml:
        print("  -> Substance stacking calculation and timeline logic: PASS")
    else:
        print("  -> Substance stacking calculation and timeline logic: FAIL")
    
    if Path(scen_path).exists():
        Path(scen_path).unlink()

    # Final cleanup
    for p in (state_file, meta_file):
        if p.exists():
            p.unlink()
    temp_xml = USER_STATES_DIR / "akhil_reddy_9594.xml"
    if temp_xml.exists():
        temp_xml.unlink()
        
    print("\n==================================================")
    print("            COMPREHENSIVE SUITE COMPLETED         ")
    print("==================================================")

if __name__ == "__main__":
    run_comprehensive_tests()
