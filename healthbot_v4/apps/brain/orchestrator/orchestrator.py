"""
healthbot_v4/apps/brain/orchestrator/orchestrator.py
AI Orchestrator for VitalHealth v5.0 Health Brain.
Coordinates Clinical Intent, Context Retrieval Planning, Clinical Snapshot, Longitudinal Reasoning, Risk Matrix, and Qwen3.
Supports Production Streaming, Timeout Safeguards, Circuit Breakers, and Model Warm-up.
"""

import asyncio
import re
import time
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
from healthbot_v4.apps.brain.cache.semantic_cache import SemanticQueryCache
from healthbot_v4.apps.brain.guardrails.safety_router import EmergencySafetyRouter
from healthbot_v4.apps.ocr.multimodal_engine import MultimodalTriageEngine
from healthbot_v4.apps.brain.guardrails.fact_verifier import FactVerificationGuard
from healthbot_v4.apps.brain.reasoning.model_router import MultiModelRouter
from healthbot_v4.apps.brain.journey.action_engine import ProactiveActionEngine
from healthbot_v4.apps.brain.interop.fhir_exporter import FHIRR4Exporter
from healthbot_v4.shared.models.base import TimelineEventType, RiskLevel, NormalizedMedication

# Enterprise v6.0 Canonical State, Tools, Compressor & Counterfactual Scenario Engine
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState, FHIRPatientDemographics, FHIRMedicationRequest, FHIRObservationLab, FHIRAllergyIntolerance
from healthbot_v4.apps.brain.context.semantic_compressor import SemanticContextCompressor
from healthbot_v4.apps.brain.tools.registry import VitalHealthToolRegistry
from healthbot_v4.apps.brain.reasoning.biogears_scenario_engine import BioGearsScenarioEngine
from healthbot_v4.apps.brain.evidence.otm import OrchestratorToolManager


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
        self.safety_router = EmergencySafetyRouter()
        self.semantic_cache = SemanticQueryCache()
        self.multimodal_engine = MultimodalTriageEngine()
        self.fact_verifier = FactVerificationGuard()
        self.model_router = MultiModelRouter()
        self.action_engine = ProactiveActionEngine()
        self.fhir_exporter = FHIRR4Exporter()
        self.otm = OrchestratorToolManager()
        # In-memory session store for multi-turn conversation memory.
        # Key: session_id, Value: {"history": [...turns], "last_active": float}
        # Turns: [{"role": "user"|"assistant", "content": str}]
        self._session_store: Dict[str, Dict] = {}
        self._session_ttl: float = 1800.0  # 30-minute TTL

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
        await self.safety_router.initialize()
        await self.semantic_cache.initialize()
        await self.multimodal_engine.initialize()
        await self.fact_verifier.initialize()
        await self.model_router.initialize()
        await self.action_engine.initialize()
        await self.fhir_exporter.initialize()
        
        # Production Model Warm-Up Execution (Async non-blocking background task)
        asyncio.create_task(self.warmup_model())
        logger.info("🤖 AI Orchestrator initialized (Multi-Turn Memory + Local LLM — Zero External APIs)")

    # =========================================================================
    # Session memory helpers
    # =========================================================================

    def _get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        """Returns the conversation history for a session, pruning expired sessions."""
        now = time.time()
        # Evict expired sessions
        expired = [sid for sid, data in self._session_store.items()
                   if now - data["last_active"] > self._session_ttl]
        for sid in expired:
            del self._session_store[sid]
            logger.debug(f"Session {sid} expired and evicted.")
        return self._session_store.get(session_id, {}).get("history", [])

    def _resolve_query_context(self, query: str, history: List[Dict[str, str]]) -> str:
        """
        Resolves ambiguous user follow-up queries (e.g. 'what caused it?', 'how do I treat that?')
        by expanding ambiguous pronouns ('it', 'that', 'this') using recent conversation turns.
        """
        trimmed = query.strip()
        words = [re.sub(r'[^\w\s]', '', w) for w in trimmed.lower().split()]
        
        ambiguous_pronouns = {"it", "this", "that", "them", "these", "those"}
        has_pronoun = any(w in ambiguous_pronouns for w in words)
        
        # Only rewrite if explicit pronouns are used in follow-ups
        if has_pronoun and history:
            last_assistant_turn = None
            for turn in reversed(history):
                if turn.get("role") == "assistant" and turn.get("content"):
                    last_assistant_turn = turn["content"]
                    break
            
            if last_assistant_turn:
                heading_match = re.search(r'###\s*([^\n]+)', last_assistant_turn)
                topic = heading_match.group(1).strip() if heading_match else last_assistant_turn[:80].strip()
                logger.info(f"🔍 Resolved ambiguous follow-up: '{query}' -> Context topic: '{topic}'")
                return f"{query} (Context: referring to previous discussion about {topic})"
                
        return query

    def _append_to_session(self, session_id: str, role: str, content: str) -> None:
        """Appends a turn to session history and refreshes TTL."""
        if session_id not in self._session_store:
            self._session_store[session_id] = {"history": [], "last_active": time.time()}
        self._session_store[session_id]["history"].append({"role": role, "content": content})
        self._session_store[session_id]["last_active"] = time.time()
        if len(self._session_store[session_id]["history"]) > 20:
            self._session_store[session_id]["history"] = \
                self._session_store[session_id]["history"][-20:]


    async def warmup_model(self) -> None:
        """Executes lightweight synthetic inference query on startup to warm up GGUF/LLM weights."""
        logger.info("🔥 Performing AI Reasoning Model Warm-Up...")
        try:
            sample_query = "Heart rate status review"
            dummy_res = await asyncio.to_thread(
                self.qwen_engine.generate_reasoning_response,
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

    def export_patient_fhir_bundle(self, patient_id: str, care_plan_actions: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Generates HL7 FHIR R4 Bundle for patient state and active CarePlan."""
        state = self.state_mgr.get_or_create_state(patient_id)
        return self.fhir_exporter.export_patient_bundle(state, care_plan_actions)

    async def process_patient_query(
        self,
        patient_id: str,
        session_id: str,
        query: str,
        active_symptoms: Optional[List[Any]] = None,
        patient_context: Optional[Dict[str, Any]] = None,
        image_payload: Optional[str] = None,
        rag_context: Optional[str] = None,
    ) -> OrchestratorResponse:
        logger.info(f"AIOrchestrator processing query for patient {patient_id} in session {session_id}")

        # Check for image/document payload
        multimodal_res = None
        raw_img = (image_payload or (patient_context.get("image_payload") if patient_context else "")) or ""
        if isinstance(raw_img, str) and raw_img.strip():
            multimodal_res = self.multimodal_engine.process_image_payload(raw_img, patient_id=patient_id)
            if multimodal_res and getattr(multimodal_res, "triage_summary", None):
                query += f"\n\n[Multimodal Context: {multimodal_res.triage_summary}]"

        # Retrieve conversation history for this session (multi-turn memory)
        conversation_history = self._get_session_history(session_id)
        
        # Resolve ambiguous pronouns using recent conversation history
        resolved_query = self._resolve_query_context(query, conversation_history)
        
        # Step 0: Sub-2ms Pre-Guardrail Emergency Router Bypass
        is_emerg, emerg_resp, emerg_lat = self.safety_router.evaluate_query(query)
        if is_emerg and emerg_resp:
            self._append_to_session(session_id, "assistant", emerg_resp)
            return OrchestratorResponse(
                patient_id=patient_id,
                response_text=emerg_resp,
                emergency_triggered=True,
                confidence_score=1.0,
                metadata={"latency_ms": emerg_lat, "guardrail": "PRE_GUARDRAIL_SAFETY_ROUTER"},
            )

        # Step 0.5: Sub-5ms Semantic Query Cache Lookup
        cache_hit = self.semantic_cache.get(query)
        if cache_hit:
            cached_resp, cached_sources, cache_lat = cache_hit
            self._append_to_session(session_id, "assistant", cached_resp)
            return OrchestratorResponse(
                patient_id=patient_id,
                response_text=cached_resp,
                emergency_triggered=False,
                confidence_score=0.98,
                metadata={"latency_ms": cache_lat, "cache_hit": True, "sources_cited": cached_sources},
            )

        state = self.state_mgr.get_or_create_state(patient_id)
        risks = self.risk_engine.evaluate_patient_risks(state)
        state = self.state_mgr.update_risks(patient_id, risks)

        # 1. Intent Analysis & Safety Gatekeeper
        intent_res = self.intent_engine.classify_intent(resolved_query)
        decision = self.decision_engine.decide_query_action(state, resolved_query)

        if ActionType.emergency_redirect in decision.actions or intent_res.primary_intent == "EMERGENCY":
            emergency_text = (
                "**🚨 EMERGENCY WARNING & Immediate Triage Notice**\n"
                "Your query describes acute red flag symptoms (e.g. chest pain red flag, obstetric emergency, acute hemorrhage) that require immediate medical evaluation.\n\n"
                "**🎯 Action Required**\n"
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

        def _is_valid_symptom(item_str: str) -> bool:
            if not item_str:
                return False
            low = item_str.lower().strip()
            # Filter out system tags and query processing artifacts
            if any(kw in low for kw in ["user query", "query processed", "chat consultation", "user_query", "processed (", "processed"]):
                return False
            # Filter out UI suggestion chip queries and generic user question strings
            query_phrases = [
                "explain my symptoms", "check my medications", "read my lab results", "how's my heart health?",
                "how is my heart health", "active medicine", "symptoms", "medications", "lab results", "heart health",
                "is there any chance that i can get diabetes in near future", "can i have apple or does it have high sugars"
            ]
            if low in query_phrases:
                return False
            if low.endswith("?") or any(low.startswith(w) for w in ["how ", "can ", "what ", "is ", "explain ", "check ", "read ", "tell ", "show ", "does ", "should ", "will ", "why ", "where ", "when "]):
                return False
            return True

        # Parse symptoms explicitly sent from mobile client
        if active_symptoms:
            for s in active_symptoms:
                if isinstance(s, dict):
                    name = s.get("name") or s.get("title") or "Symptom"
                    sev = s.get("severity") or "Active"
                    item = f"{name} (Severity: {sev})"
                elif isinstance(s, str):
                    item = s
                else:
                    item = ""
                if _is_valid_symptom(item):
                    symptoms_logged.append(item)

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
                    item = f"{name} (Severity: {sev})"
                elif isinstance(s, str):
                    item = s
                else:
                    item = ""
                if _is_valid_symptom(item):
                    symptoms_logged.append(item)

            # Ingest active medications from mobile client
            raw_meds = patient_context.get("medicines") or patient_context.get("active_medications") or []
            if raw_meds:
                state.active_medications.clear()
                for m in raw_meds:
                    if isinstance(m, dict):
                        m_name = m.get("name") or m.get("medicineName") or m.get("title") or m.get("medication_name") or "Medication"
                        m_dose_str = str(m.get("dose") or m.get("dose_quantity") or m.get("dosage") or "")
                        m_type = m.get("type") or m.get("dosage_form") or m.get("form") or "Tablet"
                        m_time = m.get("time") or m.get("frequency") or m.get("schedule") or "Not specified"

                        # Extract numeric dose only from real value — never fabricate 500mg
                        num_dose = 0.0
                        dose_label = "Dose not specified"
                        if m_dose_str:
                            digits = "".join([c for c in m_dose_str if c.isdigit() or c == '.'])
                            if digits:
                                try:
                                    num_dose = float(digits)
                                    dose_label = m_dose_str
                                except ValueError:
                                    pass

                        try:
                            state.active_medications.append(
                                NormalizedMedication(
                                    name=m_name,
                                    dose_quantity=num_dose,
                                    dosage_form=dose_label if num_dose > 0 else f"Dose not specified ({m_type})",
                                    frequency=m_time,
                                    is_active=True
                                )
                            )
                        except Exception as err:
                            logger.warning(f"⚠️ Failed to normalize client medication {m_name}: {err}")
                    elif isinstance(m, str) and m.strip():
                        state.active_medications.append(
                            NormalizedMedication(
                                name=m.strip(),
                                dose_quantity=0.0,
                                dosage_form="Dose unknown",
                                frequency="Not specified",
                                is_active=True
                            )
                        )
                # Persist raw_meds into journey store for persistence
                try:
                    from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store, _save_journey_store
                    store = _load_journey_store(patient_id)
                    store["medicines"] = raw_meds
                    _save_journey_store(patient_id, store)
                except Exception:
                    pass

        # Fallback to journey store if active_medications is empty
        if not state.active_medications:
            try:
                from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
                store = _load_journey_store(patient_id)
                saved_meds = store.get("medicines") or store.get("active_medications") or []
                for m in saved_meds:
                    if isinstance(m, dict) and (m.get("name") or m.get("medicineName")):
                        m_name = m.get("name") or m.get("medicineName") or "Medication"
                        m_dose_str = str(m.get("dose") or m.get("dose_quantity") or "")
                        m_type = str(m.get("type") or m.get("dosage_form") or "Tablet")
                        m_time = str(m.get("time") or m.get("frequency") or "Not specified")
                        # Only extract a numeric dose if the source data actually contains one
                        num_dose = 0.0
                        dose_label = "Dose not specified"
                        if m_dose_str:
                            digits = "".join([c for c in m_dose_str if c.isdigit() or c == '.'])
                            if digits:
                                try:
                                    num_dose = float(digits)
                                    dose_label = m_dose_str
                                except ValueError:
                                    pass
                        state.active_medications.append(
                            NormalizedMedication(
                                name=m_name,
                                dose_quantity=num_dose,
                                dosage_form=dose_label if num_dose > 0 else f"Dose not specified ({m_type})",
                                frequency=m_time,
                                is_active=True
                            )
                        )
                    elif isinstance(m, str) and m.strip():
                        state.active_medications.append(
                            NormalizedMedication(
                                name=m.strip(),
                                dose_quantity=0.0,
                                dosage_form="Dose unknown",
                                frequency="Not specified",
                                is_active=True
                            )
                        )
            except Exception:
                pass

        # Fallback to journey store if recent_labs is empty (survives server restarts)
        if not state.recent_labs:
            try:
                from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
                from healthbot_v4.shared.models.base import NormalizedLab
                store = _load_journey_store(patient_id)
                saved_labs = store.get("recent_labs") or []
                for lab_dict in saved_labs:
                    if not isinstance(lab_dict, dict):
                        continue
                    try:
                        lab = NormalizedLab(
                            lab_id=lab_dict.get("lab_id") or f"lab_{patient_id[:6]}",
                            patient_id=patient_id,
                            canonical_name=lab_dict.get("canonical_name") or lab_dict.get("name") or "Lab Test",
                            value=float(lab_dict.get("value", 0.0)),
                            unit=lab_dict.get("unit", ""),
                            reference_range=lab_dict.get("reference_range", ""),
                            classification=lab_dict.get("classification", "Normal"),
                        )
                        state.recent_labs.append(lab)
                    except Exception:
                        pass
                if state.recent_labs:
                    logger.info(f"Loaded {len(state.recent_labs)} persisted labs from journey store for {patient_id}")
            except Exception:
                pass

        # Parse timeline events
        timeline_events = self.timeline_engine.get_timeline(patient_id, limit=30)
        for evt in timeline_events:
            evt_str = f"{evt.title} {evt.description}".lower()
            if evt.event_type == TimelineEventType.symptom_logged and _is_valid_symptom(evt_str):
                symptoms_logged.append(f"{evt.title} ({evt.description})")
        
        # Check fallback journey store for persistent symptoms
        try:
            from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
            store = _load_journey_store(patient_id)
            if store.get("symptoms"):
                for s in store["symptoms"]:
                    item = f"{s.get('name', 'Symptom')} (Severity: {s.get('severity', 'Moderate')})"
                    if _is_valid_symptom(item):
                        symptoms_logged.append(item)
        except Exception:
            pass

        snapshot = self.snapshot_engine.generate_snapshot(state, twin_summary=twin_summary)
        cleaned_symptoms = [s for s in symptoms_logged if _is_valid_symptom(s)]
        if cleaned_symptoms:
            snapshot.active_risks_summary = f"Active Logged Symptoms: {'; '.join(set(cleaned_symptoms))}"
        else:
            valid_risks = [r for r in state.active_risks if _is_valid_symptom(r.title)]
            if valid_risks:
                snapshot.active_risks_summary = "; ".join([f"[{r.level.value.upper()}] {r.title}" for r in valid_risks])
            else:
                snapshot.active_risks_summary = "No active symptoms or clinical risks logged"

        # Inject multi-domain context (body measurements, cognitive assessment, fitness, hydration) into snapshot
        if patient_context and isinstance(patient_context, dict):
            body_m = patient_context.get("body_measurements") or {}
            cog_a = patient_context.get("cognitive_assessment") or {}
            fit_a = patient_context.get("fitness_activity") or {}
            hyd_a = patient_context.get("hydration") or {}
            sim_v = patient_context.get("sim_vitals") or patient_context.get("simulation_vitals") or patient_context.get("vitals") or {}
            organ_s = patient_context.get("organ_scores") or patient_context.get("organScores") or {}

            extra_lines = []
            if body_m and isinstance(body_m, dict):
                h = body_m.get("height") or "Not recorded"
                w = body_m.get("weight") or "Not recorded"
                bmi = body_m.get("bmi") or "Not recorded"
                bt = body_m.get("blood_type") or "Not recorded"
                rhr = body_m.get("resting_hr") or "Uncalibrated"
                bp = body_m.get("blood_pressure") or "Uncalibrated"
                extra_lines.append(f"• BODY MEASUREMENTS & PHYSIQUE: Height {h}, Weight {w}, BMI {bmi}, Blood Type {bt}, Resting HR {rhr}, BP {bp}")

            # Only inject detailed BioGears simulation vitals & organ scores if retrieve_twin is planned or intent is digital twin simulation
            is_twin_query = getattr(plan, "retrieve_twin", False) or any(kw in query.lower() for kw in ["simulation", "digital twin", "biogears", "organ score", "vitals"])
            if is_twin_query and sim_v and isinstance(sim_v, dict):
                hr_v = sim_v.get("heart_rate") or sim_v.get("heartRate") or sim_v.get("hr") or body_m.get("resting_hr") or "Uncalibrated"
                sys_bp = sim_v.get("systolic_bp") or sim_v.get("systolicBp")
                dia_bp = sim_v.get("diastolic_bp") or sim_v.get("diastolicBp")
                if sys_bp and dia_bp:
                    bp_v = f"{sys_bp}/{dia_bp} mmHg"
                else:
                    bp_v = sim_v.get("blood_pressure") or sim_v.get("bloodPressure") or body_m.get("blood_pressure") or "Uncalibrated"
                
                map_v = sim_v.get("map") or sim_v.get("mean_arterial_pressure") or "Uncalibrated"
                co_v = sim_v.get("cardiac_output") or sim_v.get("cardiacOutput") or "Uncalibrated"
                sv_v = sim_v.get("stroke_volume") or sim_v.get("strokeVolume") or "Uncalibrated"
                rr_v = sim_v.get("respiration") or sim_v.get("respiration_rate") or sim_v.get("respirationRate") or "Uncalibrated"
                tv_v = sim_v.get("tidal_volume") or sim_v.get("tidalVolume") or "Uncalibrated"
                ph_v = sim_v.get("arterial_ph") or sim_v.get("arterialPh") or "Uncalibrated"
                gluc_v = sim_v.get("glucose") or "Uncalibrated"
                spo2_v = sim_v.get("spo2") or sim_v.get("spO2") or "Uncalibrated"
                temp_v = sim_v.get("core_temperature") or sim_v.get("coreTemperature") or "Uncalibrated"
                extra_lines.append(f"• BIOGEARS DIGITAL TWIN VITALS: HR: {hr_v} | BP: {bp_v} | MAP: {map_v} | Cardiac Output: {co_v} | Stroke Volume: {sv_v} | Respiration: {rr_v} | Tidal Volume: {tv_v} | Arterial pH: {ph_v} | Glucose: {gluc_v} | SpO2: {spo2_v} | Core Temp: {temp_v}")

            if is_twin_query and organ_s and isinstance(organ_s, dict):
                scores_dict = organ_s.get("scores") if isinstance(organ_s.get("scores"), dict) else organ_s
                org_pairs = []
                for k, v in scores_dict.items():
                    if isinstance(v, (int, float)) and k not in ["overall_score", "timestamp"]:
                        org_pairs.append(f"{k.capitalize()}: {v:.0f}/100")
                if organ_s.get("overall_score") and isinstance(organ_s.get("overall_score"), (int, float)):
                    org_pairs.insert(0, f"Overall: {organ_s['overall_score']:.0f}/100")
                if org_pairs:
                    extra_lines.append(f"• ORGAN SYSTEM HEALTH SCORES: {', '.join(org_pairs)}")

            if cog_a and isinstance(cog_a, dict):
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
                steps_cnt = fit_a.get("steps", 0) if isinstance(fit_a, dict) else 0
                cals = fit_a.get("calories", 0) if isinstance(fit_a, dict) else 0
                dist = fit_a.get("distance_km", 0) if isinstance(fit_a, dict) else 0
                water_ml = hyd_a.get("water_intake_ml", 0) if isinstance(hyd_a, dict) else 0
                extra_lines.append(f"• LIFESTYLE & FITNESS: Daily Steps: {steps_cnt} | Calories Burned: {cals} kcal | Distance: {dist} km | Hydration: {water_ml} mL / 2,500 mL goal")

            if extra_lines:
                extra_block = "\n".join(extra_lines)
                snapshot.profile_summary += f"\n{extra_block}"
                if snapshot.twin_prediction_summary:
                    snapshot.twin_prediction_summary += f"\n{extra_block}"
                else:
                    snapshot.twin_prediction_summary = extra_block

        master_summary = self.summary_engine.build_master_summary(state)

        server_rag_context = self.rag_service.retrieve_context(patient_id, query) if plan.retrieve_rag else ""
        # Merge: client-side document chunks (rag_context) take priority; append server RAG if also available
        if rag_context and rag_context.strip():
            combined_rag = f"UPLOADED DOCUMENT CONTEXT:\n{rag_context.strip()}"
            if server_rag_context:
                combined_rag += f"\n\nCLINICAL REFERENCE:\n{server_rag_context}"
        else:
            combined_rag = server_rag_context

        # 5a. OTM — collect structured evidence bundle from all relevant modules
        evidence_bundle = self.otm.collect_evidence(
            query=resolved_query,
            intent=intent_res.primary_intent.value,
            state=state,
            patient_context=patient_context,
            symptoms_logged=symptoms_logged,
            longitudinal_res=longitudinal_res,
        )

        # 5b. Dynamic Context Budgeter (still used for Ollama/GGUF system prompt base)
        budgeted_ctx = self.context_budgeter.assemble_context(
            state,
            snapshot,
            plan,
            longitudinal_res=longitudinal_res,
            master_summary=master_summary,
            rag_context=combined_rag,
            sim_context=sim_context,
        )

        # 6. Qwen3 Reasoning Engine Output with Timeout Circuit-Breaker
        try:
            # 30 second production timeout (GGUF on CPU needs more time for complex queries)
            reasoning_res = await asyncio.wait_for(
                asyncio.to_thread(
                    self.qwen_engine.generate_reasoning_response,
                    budgeted_ctx,
                    resolved_query,
                    conversation_history,
                    intent_res.primary_intent.value,
                    evidence_bundle,
                ),
                timeout=30.0
            )
        except asyncio.TimeoutError:
            logger.error(f"⏱️ AI Reasoning timed out after 30s for patient {patient_id}. Triggering graceful fallback.")
            reasoning_res = {
                "response": (
                    f"### ⏳ Response Timeout\n"
                    f"The AI reasoning engine is taking longer than expected. "
                    f"Your health profile shows a score of **{state.current_health_score:.0f}/100** "
                    f"with **{len(state.active_medications)}** active medication(s) on record.\n\n"
                    "Please try again in a moment.\n\n"
                    "> 💡 *Please consult your doctor for personalized medical advice.*"
                ),
                "confidence_score": 0.70,
                "sources_cited": ["VitalHealth Clinical State"],
            }

        # Record the assistant's response in session history for multi-turn continuity
        self._append_to_session(session_id, "assistant", str(reasoning_res.get("response", "")))

        self.timeline_engine.record_event(
            patient_id, TimelineEventType.consultation_completed, "Chat Consultation Query", query
        )

        resp_text = str(reasoning_res.get("response", ""))
        raw_sources = reasoning_res.get("sources_cited", [])
        if isinstance(raw_sources, list):
            sources_list: List[str] = [s if isinstance(s, str) else str(s) for s in raw_sources]
        elif isinstance(raw_sources, str):
            sources_list = [raw_sources]
        else:
            sources_list = []
        intent_name = intent_res.primary_intent.value

        # Step 7: Medically Grounded Fact Verification Guard
        verified_text, fact_corrected, fact_lat = self.fact_verifier.verify_and_correct_response(resp_text, patient_context)

        # Step 8: Proactive Health Journey Action Extraction
        proactive_actions = self.action_engine.extract_proactive_actions(patient_id, verified_text, query)

        # Store in Semantic Cache if non-personalized education query
        self.semantic_cache.put(query, intent_name, verified_text, sources_list)

        # Step 9: Dynamic Load-Balanced Multi-Model Route selection
        route_res = self.model_router.select_model_route(query, intent_name, len(state.active_risks), len(state.active_medications))

        raw_score = reasoning_res.get("confidence_score", 0.90)
        conf_score = float(raw_score) if isinstance(raw_score, (int, float, str)) else 0.90

        # Strip any raw markdown headers (###, ##, #) from response_text
        sanitized_text = re.sub(r'(?m)^#{1,6}\s+(.+)$', r'**\1**', verified_text) if verified_text else ""

        return OrchestratorResponse(
            patient_id=patient_id,
            response_text=sanitized_text,
            emergency_triggered=False,
            confidence_score=conf_score,
            metadata={
                "intent": intent_name,
                "retrieval_plan": plan.explainable_matrix,
                "actions": [a.value for a in decision.actions],
                "tokens_budgeted": budgeted_ctx.total_token_estimate,
                "health_score": state.current_health_score,
                "sources_cited": sources_list,
                "model_route": route_res["target_model"],
                "complexity_score": route_res["complexity_score"],
                "fact_verification": {"corrected": fact_corrected, "latency_ms": fact_lat},
                "proactive_actions": [act.model_dump() for act in proactive_actions],
                "multimodal_summary": multimodal_res.triage_summary if multimodal_res else None,
                "evidence_bundle": {
                    "intent": evidence_bundle.intent,
                    "overall_confidence": evidence_bundle.overall_confidence,
                    "sources_reviewed": [
                        {"name": s.name, "status": s.status.value, "records": s.records_count}
                        for s in evidence_bundle.sources
                    ],
                    "missing_data": evidence_bundle.missing_data,
                    "conflicts_detected": len(evidence_bundle.conflicts),
                }
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
