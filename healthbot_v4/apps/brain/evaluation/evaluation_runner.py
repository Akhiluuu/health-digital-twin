"""
VitalHealth AI Quality Improvement Program — Evaluation Runner
Automated batch execution runner for response quality evaluation and regression tracking.
"""

from typing import List, Dict, Any
from healthbot_v4.apps.brain.evaluation.response_evaluator import ResponseEvaluator

class EvaluationRunner:
    """Batch evaluation harness executing ResponseEvaluator over scenario sets."""

    def __init__(self):
        self.evaluator = ResponseEvaluator()

    def run_suite_evaluation(self, scenarios: List[Any], orchestrator_instance: Any) -> Dict[str, Any]:
        results = []
        for scenario in scenarios:
            res = self.evaluator.evaluate_response(
                user_query=scenario.user_query,
                response_text="Generated response placeholder",
                patient_context=None,
                expected_key_elements=scenario.expected_key_elements,
                forbidden_elements=scenario.forbidden_elements,
                emergency_expected=scenario.emergency_expected
            )
            results.append(res)
        return {"total_evaluated": len(results), "passed_count": sum(1 for r in results if r["passed"])}
