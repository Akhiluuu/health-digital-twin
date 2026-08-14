import sys
import os
import time
import shutil
import gzip
import datetime
import pandas as pd
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api import dpss_db as db
from biogears_service.api.dpss_scheduler import DPSSScheduler
from biogears_service.simulation.config import USER_STATES_DIR, BIOGEARS_BIN_DIR, SCENARIO_API_DIR
from biogears_service.simulation.engine_runner import EngineResult

def mock_run_biogears_success(scenario_path, user_id):
    csv_prefix = Path(scenario_path).stem
    dest_csv = SCENARIO_API_DIR / f"{csv_prefix}Results.csv"
    df = pd.DataFrame({
        "Time(s)": [0.0, 10.0],
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

def test_scheduler_sweeps():
    print("==================================================")
    print("     TESTING SCHEDULER SWEEPS AND HISTORY FIXES   ")
    print("==================================================")

    user_id = "test_sched_user_999"
    state_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    meta_file = USER_STATES_DIR / f"{user_id}.meta.json"

    # Clean up any prior test state
    for p in (state_file, meta_file):
        if p.exists():
            p.unlink()

    # Copy template user files
    real_state = USER_STATES_DIR / "akhil_reddy_9594.xml.gz"
    real_meta = USER_STATES_DIR / "akhil_reddy_9594.meta.json"
    shutil.copy2(str(real_state), str(state_file))
    shutil.copy2(str(real_meta), str(meta_file))

    # Clean test snapshots and history from DB
    conn, is_pg = db.get_dpss_conn()
    try:
        cur = conn.cursor()
        param = "%s" if is_pg else "?"
        cur.execute(f"DELETE FROM pending_events WHERE user_id={param}", (user_id,))
        cur.execute(f"DELETE FROM simulation_snapshots WHERE user_id={param}", (user_id,))
        cur.execute(f"DELETE FROM simulation_history WHERE user_id={param}", (user_id,))
        cur.execute(f"DELETE FROM scheduler_state WHERE user_id={param}", (user_id,))
        conn.commit()
    finally:
        conn.close()

    # Stage pending events across two historical days
    today = datetime.date.today()
    day_minus_2 = (today - datetime.timedelta(days=2)).isoformat()
    day_minus_1 = (today - datetime.timedelta(days=1)).isoformat()

    # Event 1: day-2 (without timestamp in payload, to test fallback)
    db.insert_pending_event(
        user_id=user_id,
        event_type="water",
        event_timestamp=f"{day_minus_2}T08:00:00",
        payload={"value": 250.0},
        sequence_num=1
    )

    # Event 2: day-1 (with timestamp in payload)
    db.insert_pending_event(
        user_id=user_id,
        event_type="meal",
        event_timestamp=f"{day_minus_1}T12:00:00",
        payload={"value": 500.0, "timestamp": datetime.datetime.fromisoformat(f"{day_minus_1}T12:00:00").timestamp()},
        sequence_num=2
    )

    pending = db.get_pending_events(user_id) or []
    print("\nPending events in DB before auto-simulate:")
    for p in pending:
        print(f"  - Event timestamp: {p['event_timestamp']}, Type: {p['event_type']}")

    print("\nStaged events for day-2 and day-1 successfully.")

    # 1. Test simulation execution with mock biogears run
    DPSSScheduler._instance = None
    with patch("biogears_service.api.dpss_scheduler.DPSSScheduler._spawn"), \
         patch("biogears_service.simulation.engine_runner.run_biogears", side_effect=mock_run_biogears_success):
        scheduler = DPSSScheduler()
        
        # Trigger the auto simulate user
        print(f"Triggering auto-simulate for user '{user_id}'...")
        scheduler._auto_simulate_user(user_id, db)
        
        # Assertions
        snap = db.get_latest_snapshot(user_id)
        if not snap:
            print("FAILURE: No snapshot created after auto-simulation!")
            sys.exit(1)
        
        print("\nLatest snapshot after sweep:")
        print("  - Snapshot ID:", snap.get("snapshot_id"))
        print("  - Simulation Date:", snap.get("sim_date"))
        print("  - Vitals:", snap.get("vitals_snapshot"))

        # Since it processes day_minus_2, then day_minus_1 sequentially, the latest snapshot date should be day_minus_1
        assert snap.get("sim_date") == day_minus_1, f"Expected latest snapshot to be {day_minus_1}, got {snap.get('sim_date')}"
        print(f"PASS: Latest snapshot date is correctly chain-advanced to {day_minus_1} (not today's date)!")

        # Verify that day_minus_2's snapshot also exists in the database
        conn, is_pg = db.get_dpss_conn()
        try:
            cur = conn.cursor()
            param = "%s" if is_pg else "?"
            cur.execute(f"SELECT sim_date FROM simulation_snapshots WHERE user_id={param} ORDER BY sim_date ASC", (user_id,))
            rows = cur.fetchall()
            dates = [r[0] for r in rows]
            print("All simulation snapshot dates in DB:", dates)
            assert day_minus_2 in dates, f"Expected {day_minus_2} in snapshots"
            assert day_minus_1 in dates, f"Expected {day_minus_1} in snapshots"
            print("PASS: Snapshot dates for all Missed Days exist chronologically!")
        finally:
            conn.close()

        # Verify that all pending events were marked simulated
        pending = db.get_pending_events(user_id) or []
        assert len(pending) == 0, f"Expected 0 pending events, got {len(pending)}"
        print("PASS: All pending events processed and marked as simulated!")

        # Verify simulation history entries
        hist = db.get_sim_history(user_id) or []
        print(f"Simulation history entry count: {len(hist)}")
        assert len(hist) >= 2, "Expected at least 2 simulation history entries"
        for h in hist:
            assert h["status"] == "SUCCESS", f"Expected history status SUCCESS, got {h['status']}"
        print("PASS: All simulations recorded properly in history!")

    # Cleanup
    for p in (state_file, meta_file):
        if p.exists():
            p.unlink()
    temp_xml = USER_STATES_DIR / "akhil_reddy_9594.xml"
    if temp_xml.exists():
        temp_xml.unlink()

    print("\n==================================================")
    print("           ALL TESTS PASSED SUCCESSFULLY!          ")
    print("==================================================")

if __name__ == "__main__":
    test_scheduler_sweeps()
