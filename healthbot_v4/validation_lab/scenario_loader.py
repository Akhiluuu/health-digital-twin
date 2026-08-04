"""
VitalHealth Validation Laboratory - Scenario Loader
Loads pre-configured validation scenarios for all 16 system modules and E2E journeys.
"""

from typing import Dict, Any, List

class ScenarioLoader:
    """Pre-configured validation test scenarios loader."""

    @classmethod
    def get_all_scenarios(cls) -> List[Dict[str, Any]]:
        return [
            # 1. Authentication Scenarios
            {
                "id": "AUTH-001",
                "category": "authentication",
                "severity": "high",
                "name": "Firebase User Authentication & Token Refresh",
                "description": "Verify Firebase JWT authentication, token exchange, and active session restore.",
                "actions": ["login", "verify_jwt", "token_refresh", "session_restore"],
                "expected": "HTTP 200, valid JWT token returned and authenticated session persisted."
            },
            {
                "id": "AUTH-002",
                "category": "authentication",
                "severity": "critical",
                "name": "Invalid & Expired Token Rejection",
                "description": "Ensure expired or malformed JWT tokens trigger HTTP 401 Unauthorized.",
                "actions": ["send_expired_jwt", "send_malformed_jwt"],
                "expected": "HTTP 401 Unauthorized rejection with clean error payload."
            },

            # 2. Profile & Family Scenarios
            {
                "id": "PROF-001",
                "category": "profile",
                "severity": "high",
                "name": "Caregiver Family Member Switch & Scoped Isolation",
                "description": "Verify switching between primary profile and dependent family members isolates health data.",
                "actions": ["load_self_profile", "switch_to_dependent", "fetch_dependent_vitals"],
                "expected": "Telemetry and medication regimen correctly scoped to active profile ID."
            },

            # 3. Health Brain & Clinical Reasoning
            {
                "id": "BRAIN-001",
                "category": "clinical_reasoning",
                "severity": "critical",
                "name": "Emergency Symptom Risk Stratification & Red-Flag Triage",
                "description": "Verify that input symptoms involving acute chest pain and dyspnea trigger high risk triage.",
                "actions": ["input_symptom_chest_pain", "run_risk_engine"],
                "expected": "Risk level 'HIGH / CRITICAL' assigned, mandatory 911/ER escalation advice included."
            },

            # 4. AI Physician & RAG Engine
            {
                "id": "AI-001",
                "category": "ai",
                "severity": "high",
                "name": "AI Health Query Retrieval & Action Chip Generation",
                "description": "Test AI assistant response generation, contextual action chip injection, and zero hallucination.",
                "actions": ["query_medication_side_effects", "check_action_chips"],
                "expected": "Accurate clinical explanation with interactive 'Med Vault' action chip generated."
            },

            # 5. OCR Medical Report Engine
            {
                "id": "OCR-001",
                "category": "ocr",
                "severity": "high",
                "name": "Lab Blood Test OCR Extraction & Color-Coded Parameter Badging",
                "description": "Parse blood test PDF/image report, extract lab values, and generate status badges.",
                "actions": ["upload_lab_report", "extract_ocr_values", "verify_badges"],
                "expected": "Glucose and Cholesterol parameters extracted with >85% accuracy and tagged NORMAL/ELEVATED."
            },

            # 6. Medication Vault
            {
                "id": "MED-001",
                "category": "medication",
                "severity": "high",
                "name": "Medication Regimen Adherence & Low Inventory Refill Alert",
                "description": "Calculate daily intake compliance percentage and trigger low inventory alert when count <= 7.",
                "actions": ["log_morning_dose", "calculate_compliance", "check_inventory_warning"],
                "expected": "Adherence score updated to 100%, LOW STOCK alert displayed for inventory <= 7."
            },

            # 7. Digital Twin BioGears Simulation
            {
                "id": "TWIN-001",
                "category": "twin",
                "severity": "high",
                "name": "BioGears Physiological Simulation & Multi-Day Catch-up",
                "description": "Execute multi-organ digital twin simulation and process missed-day catchup wizard.",
                "actions": ["run_biogears_sim", "execute_catchup_wizard"],
                "expected": "Physiological vitals (HR, BP, SpO2) calibrated without NaNs; multi-day catch-up synced."
            },

            # 8. E2E Journeys
            {
                "id": "E2E-J001",
                "category": "e2e_journeys",
                "severity": "critical",
                "name": "Journey 001: New User Onboarding to Report OCR & Digital Twin",
                "description": "Full new user lifecycle: Sign Up -> Onboarding -> OCR Upload -> AI Consultation -> Digital Twin Sim.",
                "actions": ["signup", "complete_onboarding", "upload_ocr", "ask_ai", "view_twin"],
                "expected": "All 5 lifecycle steps execute sequentially without error."
            },
            {
                "id": "E2E-J004",
                "category": "e2e_journeys",
                "severity": "critical",
                "name": "Journey 004: Emergency Cardiac Triage Pipeline",
                "description": "Simulate acute chest pain entry -> Risk Engine Triage -> Emergency Escalation Response.",
                "actions": ["submit_acute_chest_pain", "verify_emergency_flag", "confirm_triage_banner"],
                "expected": "Emergency response banner displayed within < 1.0s."
            },

            # 9. Performance & Security Validation
            {
                "id": "PERF-001",
                "category": "performance",
                "severity": "medium",
                "name": "System Response Latency & Cold Start Benchmark",
                "description": "Verify API response latency < 500ms and Digital Twin simulation latency < 1500ms.",
                "actions": ["measure_api_latency", "measure_sim_latency"],
                "expected": "All component latencies strictly satisfy performance SLA."
            },
            {
                "id": "SEC-001",
                "category": "security",
                "severity": "critical",
                "name": "Prompt Injection & SQL Injection Hardening",
                "description": "Test resilience against malicious prompt injection and SQL injection payloads.",
                "actions": ["inject_prompt_override", "inject_sqli_string"],
                "expected": "Payloads safely sanitized with zero system breach or database error."
            },

            # 10. Failure Simulation & Recovery
            {
                "id": "FAIL-001",
                "category": "failure_simulation",
                "severity": "high",
                "name": "AI Service Timeout Graceful Fallback",
                "description": "Simulate AI service timeout and verify fallback to local rule-based greeting.",
                "actions": ["simulate_ai_timeout", "verify_fallback_greeting"],
                "expected": "Graceful fallback UI displayed without app crash."
            }
        ]
