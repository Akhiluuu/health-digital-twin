"""
VitalHealth AI Acceptance Testing Platform — Scenario Runner
Executes scenarios asynchronously against AIOrchestrator and records performance metrics.
"""

import time
import asyncio
from typing import List, Dict, Any, Tuple
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator
from healthbot_v4.ai_acceptance.personas.persona_factory import PersonaFactory, PatientPersona
from healthbot_v4.ai_acceptance.scenarios.scenario_generator import ClinicalScenario
from healthbot_v4.ai_acceptance.evaluator import MultiDimensionalEvaluator, EvaluationScore
from healthbot_v4.ai_acceptance.failures.failure_store import FailureStore
from healthbot_v4.ai_acceptance.review.human_review_workflow import HumanReviewWorkflow

class ScenarioRunner:
    """Orchestrates scenario execution against AIOrchestrator and evaluates results."""

    def __init__(self):
        self.orchestrator = AIOrchestrator()
        self.evaluator = MultiDimensionalEvaluator()
        self.failure_store = FailureStore()
        self.human_review = HumanReviewWorkflow()
        self.personas = PersonaFactory.get_all_personas()

    async def run_scenario(self, scenario: ClinicalScenario) -> Tuple[EvaluationScore, Dict[str, Any]]:
        persona = self.personas.get(scenario.persona_id, self.personas["p_healthy"])

        # Construct full patient context
        patient_context = {
            "patient_id": persona.id,
            "patient_name": persona.name,
            "age": persona.age,
            "gender": persona.gender,
            "medical_history": persona.medical_history,
            "medicines": persona.active_medications,
            "lifestyle": persona.lifestyle,
            "goals": persona.goals,
            "vitals": persona.vitals_baseline,
            "labs": persona.lab_baseline,
            "timeline": persona.timeline_events,
            "family_history": persona.family_history,
            "biogears_sim": persona.biogears_sim
        }

        if scenario.ocr_payload:
            patient_context["ocr_findings"] = [scenario.ocr_payload]

        t0 = time.time()
        session_id = f"accept_sess_{scenario.id}"

        # Execute AI Orchestrator
        orchestration_result = await self.orchestrator.process_patient_query(
            patient_id=persona.id,
            session_id=session_id,
            query=scenario.user_query,
            patient_context=patient_context
        )
        latency_ms = (time.time() - t0) * 1000.0

        emergency_triggered = getattr(orchestration_result, "triage_triggered", False)

        # Evaluate Response
        score = self.evaluator.evaluate_response(
            scenario=scenario,
            persona=persona,
            response_text=orchestration_result.response_text,
            latency_ms=latency_ms,
            emergency_triggered=emergency_triggered
        )

        response_log = {
            "scenario_id": scenario.id,
            "capability": scenario.capability,
            "complexity_tier": scenario.complexity_tier,
            "persona_id": persona.id,
            "user_query": scenario.user_query,
            "response_text": orchestration_result.response_text,
            "latency_ms": round(latency_ms, 2),
            "emergency_triggered": emergency_triggered,
            "passed": score.passed
        }

        # Log Failure if not passed
        if not score.passed:
            self.failure_store.record_failure(
                scenario_id=scenario.id,
                persona_id=persona.id,
                user_query=scenario.user_query,
                response_text=orchestration_result.response_text,
                failures_detected=score.failures_detected,
                evaluation_dict={
                    "expected_key_elements": scenario.expected_key_elements,
                    "forbidden_elements": scenario.forbidden_elements,
                    "overall_score": score.overall_acceptance_score
                }
            )

            # Enqueue for human review
            self.human_review.enqueue_for_review(
                scenario_id=scenario.id,
                persona={"name": persona.name, "category": persona.category},
                user_query=scenario.user_query,
                expected_behavior=scenario.expected_key_elements,
                actual_response=orchestration_result.response_text,
                system_prompt="Qwen2.5 Persona System Prompt",
                context_used=str(patient_context),
                model_reasoning="Universal Dynamic Synthesizer Output"
            )

        return score, response_log
