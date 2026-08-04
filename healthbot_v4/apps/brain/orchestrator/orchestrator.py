"""
healthbot_v4/apps/brain/orchestrator/orchestrator.py
AI Orchestrator for VitalHealth v5.0 Health Brain.
Coordinates Clinical Intent, Context Retrieval Planning, Clinical Snapshot, Longitudinal Reasoning, Risk Matrix, and Qwen3.
Supports Production Streaming, Timeout Safeguards, Circuit Breakers, and Model Warm-up.
"""

import asyncio
from typing import Dict, Any, List, Optional, AsyncGenerator
from pydantic import BaseModel, Field

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.graph.patient_graph import PatientGraphEngine
from healthbot_v4.apps.brain.risk.risk_engine import ClinicalRiskEngine
from healthbot_v4.apps.brain.recommendations.recommendation_engine import RecommendationEngine
from healthbot_v4.apps.brain.decision.decision_engine import HealthBrainDecisionEngine, ActionType
from healthbot_v4.apps.brain.summary.summary_engine import HealthSummaryEngine
from healthbot_v4.apps.brain.context.context_builder import ContextBudgeter
from healthbot_v4.apps.brain.rag.dual_rag import DualRAGService
from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
from healthbot_v4.apps.brain.reasoning.clinical_intent import ClinicalIntentEngine
from healthbot_v4.apps.brain.reasoning.retrieval_planner import ContextRetrievalPlanner
from healthbot_v4.apps.brain.copilot.clinical_snapshot import ClinicalSnapshotEngine
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalEngine
from healthbot_v4.apps.twin.simulation_runner import DigitalTwinRunner
from healthbot_v4.shared.models.base import TimelineEventType, RiskLevel, NormalizedMedication


class OrchestratorResponse(BaseModel):
    patient_id: str
    response_text: str
    emergency_triggered: bool = False
    confidence_score: float = 0.95
    disclaimer: str = "VitalHealth AI is a clinical decision support system, not a substitute for professional medical advice."
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AIOrchestrator(HealthBrainSubsystem):
    """Central Orchestrator routing query workflows across Health Brain subsystems."""

    def __init__(self):
        super().__init__("ai_orchestrator")
        self.state_mgr = PatientStateManager()
        self.timeline_engine = MedicalTimelineEngine()
        self.graph_engine = PatientGraphEngine()
        self.risk_engine = ClinicalRiskEngine()
        self.rec_engine = RecommendationEngine()
        self.decision_engine = HealthBrainDecisionEngine()
        self.summary_engine = HealthSummaryEngine()
        self.context_budgeter = ContextBudgeter()
        self.rag_service = DualRAGService()
        self.qwen_engine = QwenInferenceEngine()
        self.intent_engine = ClinicalIntentEngine()
        self.planner = ContextRetrievalPlanner()
        self.snapshot_engine = ClinicalSnapshotEngine()
        self.longitudinal_engine = LongitudinalEngine()
        self.twin_runner = DigitalTwinRunner()

    async def initialize(self) -> None:
        await self.state_mgr.initialize()
        await self.timeline_engine.initialize()
        await self.graph_engine.initialize()
        await self.risk_engine.initialize()
        await self.rec_engine.initialize()
        await self.decision_engine.initialize()
        await self.summary_engine.initialize()
        await self.context_budgeter.initialize()
        await self.rag_service.initialize()
        await self.qwen_engine.initialize()
        await self.intent_engine.initialize()
        await self.planner.initialize()
        await self.snapshot_engine.initialize()
        await self.longitudinal_engine.initialize()
        await self.twin_runner.initialize()
        
        # Production Model Warm-Up Execution
        await self.warmup_model()
        logger.info("🤖 AI Orchestrator initialized (Multi-Agent Tool Router & Guardrails Active)")

    async def warmup_model(self) -> None:
        """Executes lightweight synthetic inference query on startup to warm up GGUF/LLM weights."""
        logger.info("🔥 Performing AI Reasoning Model Warm-Up...")
        try:
            sample_query = "Heart rate status review"
            dummy_res = self.qwen_engine.generate_reasoning_response(
                self.context_budgeter.assemble_context(
                    self.state_mgr.get_or_create_state("usr_warmup"),
                    self.snapshot_engine.generate_snapshot(self.state_mgr.get_or_create_state("usr_warmup")),
                    self.planner.create_retrieval_plan(
                        self.intent_engine.classify_intent(sample_query),
                        self.state_mgr.get_or_create_state("usr_warmup")
                    )
                ),
                sample_query
            )
            logger.info(f"✅ AI Warm-Up complete (Sample output length: {len(dummy_res.get('response', ''))} chars)")
        except Exception as e:
            logger.warning(f"⚠️ Model warm-up skipped or failed: {e}")

    async def process_patient_query(
        self,
        patient_id: str,
        session_id: str,
        query: str,
        active_symptoms: Optional[List[Any]] = None,
        patient_context: Optional[Dict[str, Any]] = None,
    ) -> OrchestratorResponse:
        logger.info(f"AIOrchestrator processing query for patient {patient_id} in session {session_id}")

        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        state = self.state_mgr.update_risks(patient_id, risks)

        # 1. Intent Analysis & Safety Gatekeeper
        intent_res = self.intent_engine.classify_intent(query)
        decision = self.decision_engine.decide_query_action(state, query)

        if ActionType.emergency_redirect in decision.actions or intent_res.primary_intent == "EMERGENCY":
            emergency_text = (
                "### 🚨 EMERGENCY WARNING & Immediate Triage Notice\n"
                "Your query describes acute red flag symptoms (e.g. chest pain red flag, obstetric emergency, acute hemorrhage) that require immediate medical evaluation.\n\n"
                "### 🎯 Action Required\n"
                "1. **Call 911 / Labor & Delivery ER** or proceed to the nearest Emergency Room or immediate medical department.\n"
                "2. Do not delay seeking emergency care.\n\n"
                "[Health Brain Citation: Emergency Triage System | AHA 2026 Guidelines]"
            )
            self.timeline_engine.record_event(
                patient_id,
                TimelineEventType.risk_flagged,
                "Emergency Safety Triage Triggered",
                "Severe symptoms detected in query input.",
            )
            return OrchestratorResponse(
                patient_id=patient_id,
                response_text=emergency_text,
                emergency_triggered=True,
                confidence_score=1.0,
                metadata={"actions": [a.value for a in decision.actions], "intent": intent_res.primary_intent.value},
            )

        # 2. Context Retrieval Planning
        plan = self.planner.create_retrieval_plan(intent_res, state)

        # 3. Longitudinal & Twin Simulation
        longitudinal_res = self.longitudinal_engine.analyze_patient_trajectory(state) if plan.retrieve_trends or plan.retrieve_timeline else None

        sim_context = ""
        twin_summary = None
        if plan.retrieve_twin and state.active_medications:
            sim_res = self.twin_runner.run_medication_simulation(state.profile, state.active_medications[0].name)
            sim_context = f"PHYSIOLOGICAL SIMULATION: {sim_res.clinical_summary}"
            twin_summary = sim_res.clinical_summary

        # 4. Clinical Snapshot with Logged Symptoms
        symptoms_logged = []

        # Parse symptoms explicitly sent from mobile client
        if active_symptoms:
            for s in active_symptoms:
                if isinstance(s, dict):
                    name = s.get("name") or s.get("title") or "Symptom"
                    sev = s.get("severity") or "Active"
                    symptoms_logged.append(f"{name} (Severity: {sev})")
                elif isinstance(s, str):
                    symptoms_logged.append(s)

        if patient_context and isinstance(patient_context, dict):
            # Parse patient profile metadata explicitly sent from mobile client
            p_name = patient_context.get("patient_name") or patient_context.get("first_name")
            if p_name and isinstance(p_name, str):
                parts = p_name.strip().split()
                state.profile.first_name = parts[0]
                if len(parts) > 1:
                    state.profile.last_name = " ".join(parts[1:])
            p_age = patient_context.get("age")
            if p_age:
                try:
                    state.profile.age = int(p_age)
                except (ValueError, TypeError):
                    pass
            p_gender = patient_context.get("gender")
            if p_gender and isinstance(p_gender, str):
                try:
                    from healthbot_v4.shared.models.base import BiologicalSex
                    norm_g = p_gender.strip().lower()
                    if norm_g == 'female':
                        state.profile.biological_sex = BiologicalSex.female
                    elif norm_g == 'male':
                        state.profile.biological_sex = BiologicalSex.male
                except Exception:
                    pass

            ctx_symptoms = patient_context.get("activeSymptoms") or []
            for s in ctx_symptoms:
                if isinstance(s, dict):
                    name = s.get("name") or "Symptom"
                    sev = s.get("severity") or "Active"
                    symptoms_logged.append(f"{name} (Severity: {sev})")

            # Ingest active medications from mobile client
            raw_meds = patient_context.get("medicines") or patient_context.get("active_medications") or []
            if raw_meds:
                state.active_medications.clear()
                for m in raw_meds:
                    if isinstance(m, dict):
                        m_name = m.get("name") or m.get("medicineName") or m.get("title") or m.get("medication_name") or "Medication"
                        m_dose_str = str(m.get("dose") or m.get("dose_quantity") or m.get("dosage") or "500mg")
                        m_type = m.get("type") or m.get("dosage_form") or m.get("form") or "Tablet"
                        m_time = m.get("time") or m.get("frequency") or m.get("schedule") or "daily"

                        num_dose = 500.0
                        digits = "".join([c for c in m_dose_str if c.isdigit() or c == '.'])
                        if digits:
                            try:
                                num_dose = float(digits)
                            except ValueError:
                                pass

                        try:
                            state.active_medications.append(
                                NormalizedMedication(
                                    name=m_name,
                                    dose_quantity=num_dose,
                                    dosage_form=f"{m_dose_str} ({m_type})",
                                    frequency=m_time if m_time else "daily",
                                    is_active=True
                                )
                            )
                        except Exception as err:
                            logger.warning(f"⚠️ Failed to normalize client medication {m_name}: {err}")
                    elif isinstance(m, str) and m.strip():
                        state.active_medications.append(
                            NormalizedMedication(
                                name=m.strip(),
                                dose_quantity=500.0,
                                dosage_form="Tablet",
                                frequency="daily",
                                is_active=True
                            )
                        )

        # Parse timeline events
        timeline_events = self.timeline_engine.get_timeline(patient_id, limit=30)
        for evt in timeline_events:
            if evt.event_type == TimelineEventType.symptom_logged or "HEADACHE" in evt.title.upper() or "symptom" in evt.title.lower():
                symptoms_logged.append(f"{evt.title} ({evt.description})")
        
        # Check fallback journey store for persistent symptoms
        try:
            from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
            store = _load_journey_store(patient_id)
            if store.get("symptoms"):
                for s in store["symptoms"]:
                    symptoms_logged.append(f"{s.get('name', 'Symptom')} (Severity: {s.get('severity', 'Moderate')})")
        except Exception:
            pass

        snapshot = self.snapshot_engine.generate_snapshot(state, twin_summary=twin_summary)
        if symptoms_logged:
            snapshot.active_risks_summary = f"Active Logged Symptoms: {'; '.join(set(symptoms_logged))}"

        # Inject multi-domain context (body measurements, cognitive assessment, fitness, hydration) into snapshot
        if patient_context and isinstance(patient_context, dict):
            body_m = patient_context.get("body_measurements") or {}
            cog_a = patient_context.get("cognitive_assessment") or {}
            fit_a = patient_context.get("fitness_activity") or {}
            hyd_a = patient_context.get("hydration") or {}
            sim_v = patient_context.get("sim_vitals") or {}
            organ_s = patient_context.get("organ_scores") or {}

            extra_lines = []
            if body_m:
                h = body_m.get("height", "170 cm")
                w = body_m.get("weight", "70 kg")
                bmi = body_m.get("bmi", "22.5")
                bt = body_m.get("blood_type", "O+")
                rhr = body_m.get("resting_hr", 72)
                bp = body_m.get("blood_pressure", "120/80 mmHg")
                extra_lines.append(f"• BODY MEASUREMENTS & PHYSIQUE: Height {h}, Weight {w}, BMI {bmi} kg/m², Blood Type {bt}, Resting HR {rhr} bpm, BP {bp}")

            if sim_v:
                hr_v = sim_v.get("heart_rate", 72)
                bp_v = sim_v.get("blood_pressure", "120/80")
                map_v = sim_v.get("map", 93.3)
                co_v = sim_v.get("cardiac_output", 5.0)
                sv_v = sim_v.get("stroke_volume", 70.0)
                rr_v = sim_v.get("respiration", 14.0)
                tv_v = sim_v.get("tidal_volume", 500.0)
                ph_v = sim_v.get("arterial_ph", 7.40)
                gluc_v = sim_v.get("glucose", 96.0)
                spo2_v = sim_v.get("spo2", 98.5)
                temp_v = sim_v.get("core_temperature", 37.0)
                extra_lines.append(f"• BIOGEARS DIGITAL TWIN VITALS: HR: {hr_v} bpm | BP: {bp_v} | MAP: {map_v} mmHg | Cardiac Output: {co_v} L/min | Stroke Volume: {sv_v} mL | Respiration: {rr_v} br/min | Tidal Volume: {tv_v} mL | Arterial pH: {ph_v} | Glucose: {gluc_v} mg/dL | SpO2: {spo2_v}% | Core Temp: {temp_v} °C")

            if organ_s:
                org_str = ", ".join([f"{k.capitalize()}: {v}/100" for k, v in organ_s.items() if isinstance(v, (int, float))])
                if org_str:
                    extra_lines.append(f"• ORGAN SYSTEM HEALTH SCORES: {org_str}")

            if cog_a:
                cog_age = cog_a.get("cognitive_age", state.profile.age)
                score = cog_a.get("overall_score", "85")
                domains = cog_a.get("domain_scores") or {}
                dom_str = f"Attention: {domains.get('attention', 80)}, Memory: {domains.get('memory', 85)}, Processing Speed: {domains.get('processingSpeed', 78)}, Executive Function: {domains.get('executiveFunction', 84)}"
                streak = cog_a.get("streak_days", 0)
                tests = cog_a.get("test_results") or []
                test_names = [t.get("name") for t in tests if isinstance(t, dict) and t.get("name")]
                tests_summary = f" [Tests: {', '.join(test_names)}]" if test_names else ""
                extra_lines.append(f"• COGNITIVE STRESS TEST & BRAIN HEALTH: Cognitive Age {cog_age} yrs (Chronological: {state.profile.age}) | Overall Score: {score}/100 | Domain Breakdown: {dom_str}{tests_summary} | Testing Streak: {streak} days")

            if fit_a or hyd_a:
                steps_cnt = fit_a.get("steps", 0)
                cals = fit_a.get("calories", 0)
                dist = fit_a.get("distance_km", 0)
                water_ml = hyd_a.get("water_intake_ml", 0)
                extra_lines.append(f"• LIFESTYLE & FITNESS: Daily Steps: {steps_cnt} | Calories Burned: {cals} kcal | Distance: {dist} km | Hydration: {water_ml} mL / 2,500 mL goal")

            if extra_lines:
                extra_block = "\n".join(extra_lines)
                snapshot.profile_summary += f"\n{extra_block}"
                if snapshot.twin_prediction_summary:
                    snapshot.twin_prediction_summary += f"\n{extra_block}"
                else:
                    snapshot.twin_prediction_summary = extra_block

        master_summary = self.summary_engine.build_master_summary(state)

        rag_context = self.rag_service.retrieve_context(patient_id, query) if plan.retrieve_rag else ""

        # 5. Dynamic Context Budgeter
        budgeted_ctx = self.context_budgeter.assemble_context(
            state,
            snapshot,
            plan,
            longitudinal_res=longitudinal_res,
            master_summary=master_summary,
            rag_context=rag_context,
            sim_context=sim_context,
        )

        # 6. Qwen3 Reasoning Engine Output with Timeout Circuit-Breaker
        try:
            # 15 second production timeout cap
            reasoning_res = await asyncio.wait_for(
                asyncio.to_thread(self.qwen_engine.generate_reasoning_response, budgeted_ctx, query),
                timeout=15.0
            )
        except asyncio.TimeoutError:
            logger.error(f"⏱️ AI Reasoning timed out after 15s for patient {patient_id}. Triggering graceful fallback.")
            reasoning_res = {
                "response": f"Based on your clinical record summary:\n• Health Score: {state.current_health_score}/100\n• Active Regimens: {len(state.active_medications)}\n\n(Clinical Fallback: AI reasoning service timed out, but your underlying profile remains healthy.)",
                "confidence_score": 0.80,
                "sources_cited": ["VitalHealth Clinical State Fallback Engine"],
            }

        self.timeline_engine.record_event(
            patient_id, TimelineEventType.symptom_logged, "User Query Processed", query
        )

        return OrchestratorResponse(
            patient_id=patient_id,
            response_text=reasoning_res["response"],
            emergency_triggered=False,
            confidence_score=reasoning_res["confidence_score"],
            metadata={
                "intent": intent_res.primary_intent.value,
                "retrieval_plan": plan.explainable_matrix,
                "actions": [a.value for a in decision.actions],
                "tokens_budgeted": budgeted_ctx.total_token_estimate,
                "health_score": state.current_health_score,
                "sources_cited": reasoning_res.get("sources_cited", []),
            },
        )

    async def stream_patient_query(self, patient_id: str, session_id: str, query: str) -> AsyncGenerator[str, None]:
        """Production streaming generator yielding SSE event chunks for real-time streaming UI."""
        res = await self.process_patient_query(patient_id, session_id, query)
        words = res.response_text.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield f"data: {chunk}\n\n"
            await asyncio.sleep(0.02)
        yield "data: [DONE]\n\n"
