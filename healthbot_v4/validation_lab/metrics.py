"""
VitalHealth Validation Laboratory - Metrics Tracker
Aggregates test counts, latencies, reliability scores, and quality gate evaluations.
"""

from typing import Dict, Any, List
import time

class MetricsTracker:
    """Tracks and computes system-wide release metrics and quality scores."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.start_time = time.time()
        self.end_time = 0.0
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        self.skipped_tests = 0
        self.critical_failures = 0
        self.high_failures = 0

        self.latencies: Dict[str, List[float]] = {
            "auth": [],
            "api": [],
            "ai": [],
            "ocr": [],
            "twin": [],
            "medication": []
        }

        self.category_scores: Dict[str, Dict[str, int]] = {}

    def record_result(self, category: str, name: str, passed: bool, latency_ms: float, severity: str = "medium", error: str = ""):
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
        else:
            self.failed_tests += 1
            if severity == "critical":
                self.critical_failures += 1
            elif severity == "high":
                self.high_failures += 1

        if category not in self.category_scores:
            self.category_scores[category] = {"total": 0, "passed": 0, "failed": 0}

        self.category_scores[category]["total"] += 1
        if passed:
            self.category_scores[category]["passed"] += 1
        else:
            self.category_scores[category]["failed"] += 1

        if category in self.latencies:
            self.latencies[category].append(latency_ms)
        else:
            self.latencies.setdefault("api", []).append(latency_ms)

    def finalize(self):
        self.end_time = time.time()

    @property
    def duration_seconds(self) -> float:
        end = self.end_time if self.end_time > 0 else time.time()
        return round(end - self.start_time, 2)

    @property
    def reliability_score(self) -> float:
        if self.total_tests == 0:
            return 100.0
        return round((self.passed_tests / self.total_tests) * 100.0, 1)

    def avg_latency(self, category: str) -> float:
        vals = self.latencies.get(category, [])
        if not vals:
            return 0.0
        return round(sum(vals) / len(vals), 2)

    def evaluate_quality_gate(self) -> Dict[str, Any]:
        """Evaluates quality gates: READY FOR RELEASE | READY WITH MINOR FIXES | NOT READY."""
        reliability = self.reliability_score
        
        if self.critical_failures > 0 or reliability < 80.0:
            decision = "NOT READY"
            explanation = f"Critical failures detected ({self.critical_failures}) or low reliability ({reliability}%)."
        elif self.high_failures > 0 or reliability < 95.0:
            decision = "READY WITH MINOR FIXES"
            explanation = f"High priority issues detected ({self.high_failures}) or minor threshold gap ({reliability}%)."
        else:
            decision = "READY FOR RELEASE"
            explanation = f"All critical quality gates passed smoothly with {reliability}% reliability."

        return {
            "decision": decision,
            "explanation": explanation,
            "reliability_score": reliability,
            "total_tests": self.total_tests,
            "passed": self.passed_tests,
            "failed": self.failed_tests,
            "critical_failures": self.critical_failures,
            "duration_sec": self.duration_seconds
        }

    def summary_dict(self) -> Dict[str, Any]:
        gate = self.evaluate_quality_gate()
        return {
            "total_tests": self.total_tests,
            "passed": self.passed_tests,
            "failed": self.failed_tests,
            "skipped": self.skipped_tests,
            "reliability_pct": self.reliability_score,
            "duration_seconds": self.duration_seconds,
            "quality_gate": gate["decision"],
            "quality_gate_explanation": gate["explanation"],
            "category_scores": self.category_scores,
            "average_latencies_ms": {
                cat: self.avg_latency(cat) for cat in self.latencies
            }
        }
