import sys
import os
import json
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api import dpss_db as db

def inspect():
    conn, is_pg = db.get_dpss_conn()
    print("Is Postgres:", is_pg)
    cur = conn.cursor()
    
    # Check pending events
    cur.execute("SELECT COUNT(*), status FROM pending_events GROUP BY status")
    print("Pending Events counts by status:", cur.fetchall())
    
    # Check scheduler state
    cur.execute("SELECT * FROM scheduler_state")
    print("\nScheduler States:")
    for row in cur.fetchall():
        print(row)
        
    # Check last 10 simulation history
    cur.execute("SELECT sim_id, user_id, sim_type, status, started_at FROM simulation_history ORDER BY started_at DESC LIMIT 10")
    print("\nSimulation History:")
    for row in cur.fetchall():
        print(row)
        
    # Check last 10 notifications
    cur.execute("SELECT notification_id, user_id, notif_type, sim_date, status, created_at FROM dpss_notifications ORDER BY created_at DESC LIMIT 10")
    print("\nDPSS Notifications:")
    for row in cur.fetchall():
        print(row)

if __name__ == "__main__":
    inspect()
