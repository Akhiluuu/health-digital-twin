import sys
import os
import time
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api.server import _run_batch_sync_blocking
from biogears_service.simulation.config import USER_STATES_DIR

def run_test():
    user_id = "akhil_reddy_9594"
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    gz_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    
    print(f"State file exists: {state_file.exists()}")
    print(f"Compressed file exists: {gz_file.exists()}")
    
    # We will simulate a small water intake event at now
    events = [
        {
            "event_type": "water",
            "value": 250.0,
            "timestamp": time.time()
        }
    ]
    
    print("Starting simulation sync...")
    t0 = time.time()
    try:
        res = _run_batch_sync_blocking(user_id, events)
        print(f"Simulation completed in {time.time() - t0:.1f}s")
        print("Result:", res)
    except Exception as e:
        print("Simulation failed:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_test()
