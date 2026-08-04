"""
VitalHealth Validation Laboratory - Assertions Engine
Standardized validation assertion helpers for clinical safety, performance, security, and AI response quality.
"""

from typing import Dict, Any, List, Optional
import math

class ValidationAssertionError(AssertionError):
    """Custom assertion exception for Validation Laboratory failures."""
    pass

class Assertions:
    """Clinical, technical, performance, and security assertions library."""

    @staticmethod
    def assert_latency(latency_ms: float, max_allowed_ms: float, metric_name: str = "Latency") -> None:
        """Assert that an operation latency is under threshold."""
        if latency_ms > max_allowed_ms:
            raise ValidationAssertionError(
                f"[{metric_name} Breach] Measured: {latency_ms:.2f}ms exceeds maximum allowed threshold of {max_allowed_ms:.2f}ms."
            )

    @staticmethod
    def assert_status_code(actual_code: int, expected_code: int = 200, context: str = "API") -> None:
        """Assert HTTP response status code matches expected status."""
        if actual_code != expected_code:
            raise ValidationAssertionError(
                f"[{context} HTTP Error] Expected {expected_code}, received {actual_code}."
            )

    @staticmethod
    def assert_no_hallucination(response_text: str, forbidden_claims: List[str]) -> None:
        """Assert that AI response does not contain dangerous ungrounded medical claims."""
        lower_text = response_text.lower()
        for claim in forbidden_claims:
            if claim.lower() in lower_text:
                raise ValidationAssertionError(
                    f"[AI Hallucination Breach] Unsafe medical claim detected: '{claim}'"
                )

    @staticmethod
    def assert_emergency_escalation(response_text: str, query: str) -> None:
        """Assert that queries containing emergency red-flags trigger mandatory clinical triage warnings."""
        red_flags = ["emergency", "911", "seek immediate medical attention", "urgent care", "er"]
        lower_text = response_text.lower()
        if not any(flag in lower_text for flag in red_flags):
            raise ValidationAssertionError(
                f"[Clinical Safety Breach] Emergency query '{query}' failed to trigger required 911 / ER triage escalation guidance."
            )

    @staticmethod
    def assert_tenant_isolation(requested_user_id: str, returned_payload: Dict[str, Any]) -> None:
        """Assert payload strictly belongs to requested tenant profile."""
        payload_uid = str(returned_payload.get("user_id") or returned_payload.get("profileId") or requested_user_id)
        if payload_uid != str(requested_user_id):
            raise ValidationAssertionError(
                f"[Tenant Isolation Breach] Cross-profile leak! Requested profile '{requested_user_id}', payload belongs to '{payload_uid}'."
            )

    @staticmethod
    def assert_ocr_accuracy(extracted_data: Dict[str, Any], ground_truth: Dict[str, Any], min_accuracy: float = 0.85) -> float:
        """Assert OCR extracted key-values match ground truth above accuracy threshold."""
        matches = 0
        total_keys = len(ground_truth)
        if total_keys == 0:
            return 1.0

        for key, expected_val in ground_truth.items():
            actual_val = extracted_data.get(key)
            if str(actual_val).lower().strip() == str(expected_val).lower().strip():
                matches += 1

        accuracy = matches / total_keys
        if accuracy < min_accuracy:
            raise ValidationAssertionError(
                f"[OCR Accuracy Failure] Achieved accuracy {accuracy*100:.1f}% is below required threshold {min_accuracy*100:.1f}%."
            )
        return accuracy

    @staticmethod
    def assert_twin_simulation_integrity(vitals: Dict[str, Any]) -> None:
        """Assert BioGears Digital Twin simulation outputs non-nan, physiological parameters."""
        required_vitals = ["bp_systolic", "bp_diastolic", "hr", "spo2"]
        for key in required_vitals:
            if key not in vitals:
                raise ValidationAssertionError(f"[Twin Simulation Error] Missing required physiological key '{key}'.")
            val = vitals[key]
            if val is None or math.isnan(float(val)) or float(val) <= 0:
                raise ValidationAssertionError(f"[Twin Simulation Error] Unstable physiological value for '{key}': {val}.")
