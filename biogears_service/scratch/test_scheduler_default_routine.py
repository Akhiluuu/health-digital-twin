import sys
import os
import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api import dpss_db as db
from biogears_service.api import db as biogears_db
from biogears_service.api.dpss_scheduler import DPSSScheduler

def test_scheduler_uses_default_routine():
    print("==================================================")
    print(" TESTING SCHEDULER AUTO-SYNC WITH DEFAULT ROUTINE ")
    print("==================================================")

    user_id = "test_sched_user_routine_999"

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

    # Clean profile
    biogears_db.delete_profile(user_id)

    # 1. Create a profile with default routine metadata
    # We define water event with wallTime "09:30"
    # and meal event with timestamp pointing to hour=15, minute=45
    t_15_45 = int(datetime.datetime.combine(datetime.date.today(), datetime.time(15, 45)).timestamp())
    
    biogears_db.upsert_profile(user_id, {
        "profile_name": "Test Routine User",
        "default_routine": [
            {"event_type": "water", "value": 350.0, "wallTime": "09:30", "notes": "My Routine Hydration"},
            {"event_type": "meal", "value": 650.0, "timestamp": t_15_45, "notes": "My Routine Lunch"}
        ]
    })

    # Gap setup: We create a snapshot for 2 days ago, making yesterday a missed day
    today = datetime.date.today()
    day_minus_2 = (today - datetime.timedelta(days=2)).isoformat()
    yesterday = today - datetime.timedelta(days=1)
    yesterday_str = yesterday.isoformat()

    # Create the required successful simulation history entry
    sim_id = db.create_sim_history(
        user_id=user_id,
        sim_type="AUTOMATIC"
    )
    db.complete_sim_history(sim_id, "SUCCESS")

    db.create_snapshot(
        sim_id=sim_id,
        user_id=user_id,
        pre_state_path="pre.xml",
        post_state_path="post.xml",
        input_event_ids=[],
        vitals_snapshot={},
        biomarkers_snapshot={},
        sim_date=day_minus_2
    )

    DPSSScheduler._instance = None
    captured_events = []

    def mock_run_sim(uid, events, sim_type, sim_date):
        captured_events.extend(events)
        return {"success": True, "sim_id": "dummy_sim_id", "vitals": {}}

    with patch("biogears_service.api.dpss_scheduler.DPSSScheduler._spawn"), \
         patch("biogears_service.api.dpss_scheduler._run_sim", side_effect=mock_run_sim):
        
        scheduler = DPSSScheduler()
        print(f"Triggering auto-simulate for user '{user_id}' on missed day '{yesterday_str}'...")
        scheduler._auto_simulate_user(user_id, db)

        # Assertions
        assert len(captured_events) == 2, f"Expected 2 events mapped from default routine, got {len(captured_events)}"
        
        # Check first event (water, 350.0, 09:30)
        e1 = captured_events[0]
        assert e1["event_type"] == "water"
        assert e1["value"] == 350.0
        assert e1["notes"] == "My Routine Hydration"
        
        dt1 = datetime.datetime.fromtimestamp(e1["timestamp"])
        assert dt1.date() == yesterday, f"Expected event date to be {yesterday_str}, got {dt1.date()}"
        assert dt1.hour == 9
        assert dt1.minute == 30
        
        # Check second event (meal, 650.0, 15:45)
        e2 = captured_events[1]
        assert e2["event_type"] == "meal"
        assert e2["value"] == 650.0
        assert e2["notes"] == "My Routine Lunch"
        
        dt2 = datetime.datetime.fromtimestamp(e2["timestamp"])
        assert dt2.date() == yesterday
        assert dt2.hour == 15
        assert dt2.minute == 45

        print("PASS: Default routine events mapped to missed day timestamp successfully!")

    # Cleanup profile
    biogears_db.delete_profile(user_id)
    print("\n==================================================")
    print("           ALL TESTS PASSED SUCCESSFULLY!          ")
    print("==================================================")

if __name__ == "__main__":
    test_scheduler_uses_default_routine()
