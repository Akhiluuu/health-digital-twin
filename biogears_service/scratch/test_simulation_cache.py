import sys
import os
import shutil
import json
import gzip
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from biogears_service.api.server import (
    _run_batch_sync_blocking,
    _predict_recovery_impl,
    _predict_whatif_impl,
    USER_STATES_DIR,
    BASE_DIR,
    PredictRequest,
    WhatIfRequest,
    HealthEvent
)

def test_simulation_cache():
    print("==================================================")
    print("     TESTING SIMULATION AND PREDICTION CACHE       ")
    print("==================================================")

    user_id = "test_cache_user_777"
    state_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    
    # 1. Clean up any prior test state & cache
    cache_dir = BASE_DIR / "simulation_cache"
    if cache_dir.exists():
        try: shutil.rmtree(cache_dir)
        except Exception: pass
    if state_file.exists():
        try: state_file.unlink()
        except Exception: pass
        
    # Copy template user files to build a starting state
    real_state = USER_STATES_DIR / "akhil_reddy_9594.xml.gz"
    assert real_state.exists(), "Template user state files must exist"
    shutil.copy2(str(real_state), str(state_file))

    # Define mock sync events
    events = [
        HealthEvent(
            event_type="water",
            value=250.0,
            time_offset=0,
            timestamp=1700000000.0
        )
    ]

    mock_sync_impl_result = {
        "status": "healthy",
        "vitals": {"heart_rate": 72.0}
    }

    # First call: Cache miss. Expect _run_batch_sync_blocking_impl to be called.
    with patch("biogears_service.api.server._run_batch_sync_blocking_impl", return_value=mock_sync_impl_result) as mock_sync:
        res1 = _run_batch_sync_blocking(user_id, events)
        assert res1 == mock_sync_impl_result
        mock_sync.assert_called_once()

    # Second call: Cache hit. Expect _run_batch_sync_blocking_impl NOT to be called.
    with patch("biogears_service.api.server._run_batch_sync_blocking_impl") as mock_sync:
        res2 = _run_batch_sync_blocking(user_id, events)
        assert res2 == mock_sync_impl_result
        mock_sync.assert_not_called()
        print("PASS: Simulation batch sync cache hit verified!")

    # 2. Test predict_recovery caching
    predict_req = PredictRequest(
        user_id=user_id,
        hours=4
    )
    mock_forecast_result = {
        "status": "success",
        "forecast_chart": "http://dummy.url/forecast.html",
        "hours": 4
    }

    with patch("biogears_service.api.server.scenario_builder.build_forecast_scenario", return_value=("dummy_path.xml", "run123", "prefix_")), \
         patch("biogears_service.api.server._run_biogears_via_celery", return_value=True), \
         patch("biogears_service.api.server.visualizer.generate_forecast_report", return_value="http://dummy.url/forecast.html"):
        
        # Cache miss
        res_rec1 = _predict_recovery_impl(predict_req)
        assert res_rec1 == mock_forecast_result

        # Cache hit - mock build_forecast_scenario to fail to verify it wasn't called
        with patch("biogears_service.api.server.scenario_builder.build_forecast_scenario", side_effect=Exception("Should not be called!")):
            res_rec2 = _predict_recovery_impl(predict_req)
            assert res_rec2 == mock_forecast_result
            print("PASS: Recovery prediction cache hit verified!")

    # 3. Test predict_whatif caching
    whatif_req = WhatIfRequest(
        user_id=user_id,
        event=events[0],
        hours=2
    )
    mock_whatif_result = {
        "status": "success",
        "hours": 2,
        "baseline_chart": "http://dummy/base.html",
        "intervention_chart": "http://dummy/int.html",
        "comparison_chart": "http://dummy/comp.html",
        "intervention_label": "Water"
    }

    # Write dummy CSV files to satisfy the file existence checks
    from biogears_service.api.server import SCENARIO_API_DIR
    dummy_csv = SCENARIO_API_DIR / "b_Results.csv"
    dummy_evt_csv = SCENARIO_API_DIR / "e_Results.csv"
    dummy_csv_content = "Time(s),HeartRate(1/min)\n0,72\n"
    dummy_csv.write_text(dummy_csv_content)
    dummy_evt_csv.write_text(dummy_csv_content)

    with patch("biogears_service.api.server.scenario_builder.build_whatif_scenario", return_value=("base.xml", "evt.xml", "run_b", "run_e", "b_", "e_")), \
         patch("biogears_service.api.server._run_biogears_via_celery", return_value=True), \
         patch("biogears_service.api.server.pd.read_csv", return_value=MagicMock()), \
         patch("biogears_service.api.server._validate_vitals_dataframe"), \
         patch("biogears_service.api.server.visualizer.generate_health_report", side_effect=["http://dummy/base.html", "http://dummy/int.html"]), \
         patch("biogears_service.api.server.visualizer.generate_comparison_report", return_value="http://dummy/comp.html"):
        
        # Cache miss
        res_wi1 = _predict_whatif_impl(whatif_req)
        assert res_wi1["baseline_chart"] == "http://dummy/base.html"
        assert res_wi1["intervention_chart"] == "http://dummy/int.html"
        assert res_wi1["comparison_chart"] == "http://dummy/comp.html"

        # Cache hit
        with patch("biogears_service.api.server.scenario_builder.build_whatif_scenario", side_effect=Exception("Should not be called!")):
            res_wi2 = _predict_whatif_impl(whatif_req)
            assert res_wi2 == res_wi1
            print("PASS: What-If prediction cache hit verified!")

    # Cleanup
    if state_file.exists():
        try: state_file.unlink()
        except Exception: pass
    if cache_dir.exists():
        try: shutil.rmtree(cache_dir)
        except Exception: pass
    for p in (dummy_csv, dummy_evt_csv):
        if p.exists():
            try: p.unlink()
            except Exception: pass
        
    print("\n==================================================")
    print("      ALL SIMULATION CACHE TESTS PASSED!          ")
    print("==================================================")

if __name__ == "__main__":
    test_simulation_cache()
