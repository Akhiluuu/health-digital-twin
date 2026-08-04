"""
VitalHealth AI Acceptance Testing Platform — Failure Store & Regression Dataset
Logs all clinical/behavioral failures and builds a permanent regression suite.
"""

import json
import os
import time
from typing import List, Dict, Any

FAILURE_STORE_PATH = "/home/akhilreddy/health-digital-twin/healthbot_v4/ai_acceptance/failures/failure_log.json"
REGRESSION_DATASET_PATH = "/home/akhilreddy/health-digital-twin/healthbot_v4/ai_acceptance/failures/regression_cases.json"

class FailureStore:
    """Manages failure detection logging and permanent regression suite persistence."""

    def __init__(self):
        os.makedirs(os.path.dirname(FAILURE_STORE_PATH), exist_ok=True)
        self.failures = self._load_failures()
        self.regressions = self._load_regressions()

    def _load_failures(self) -> List[Dict[str, Any]]:
        if os.path.exists(FAILURE_STORE_PATH):
            try:
                with open(FAILURE_STORE_PATH, "r") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def _load_regressions(self) -> List[Dict[str, Any]]:
        if os.path.exists(REGRESSION_DATASET_PATH):
            try:
                with open(REGRESSION_DATASET_PATH, "r") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def record_failure(
        self,
        scenario_id: str,
        persona_id: str,
        user_query: str,
        response_text: str,
        failures_detected: List[str],
        evaluation_dict: Dict[str, Any]
    ):
        entry = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "scenario_id": scenario_id,
            "persona_id": persona_id,
            "user_query": user_query,
            "response_text": response_text,
            "failures_detected": failures_detected,
            "evaluation_metrics": evaluation_dict
        }
        self.failures.append(entry)

        # Save to permanent failure log
        with open(FAILURE_STORE_PATH, "w") as f:
            json.dump(self.failures, f, indent=2)

        # Automatically add to permanent regression dataset if not already present
        reg_ids = [r["scenario_id"] for r in self.regressions]
        if scenario_id not in reg_ids:
            self.regressions.append({
                "scenario_id": scenario_id,
                "persona_id": persona_id,
                "user_query": user_query,
                "expected_key_elements": evaluation_dict.get("expected_key_elements", []),
                "forbidden_elements": evaluation_dict.get("forbidden_elements", []),
                "first_failed_at": entry["timestamp"]
            })
            with open(REGRESSION_DATASET_PATH, "w") as f:
                json.dump(self.regressions, f, indent=2)

    def get_all_regressions(self) -> List[Dict[str, Any]]:
        return self.regressions

    def get_all_failures(self) -> List[Dict[str, Any]]:
        return self.failures
