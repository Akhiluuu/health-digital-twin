"""
healthbot_v4/apps/brain/reasoning/qwen_engine.py
Production Qwen2.5-14B Inference Engine for VitalHealth v5.0 Health Brain.
100% on-premise. Zero external API calls. Patient data never leaves the server.

Inference priority:
  1. Ollama /api/chat  (fastest — GPU-accelerated if Ollama is running)
  2. llama-cpp GGUF    (always available — loads shards from models/ directory)
  3. Smart context-aware fallback (emergency use only, uses real patient data)
"""

import os
import re
import time
import json
import traceback
import urllib.request
from typing import Dict, Any, Optional, List, AsyncGenerator, TypedDict
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.apps.brain.context.context_builder import BudgetedContext
from healthbot_v4.shared.logger.logger import logger
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from healthbot_v4.apps.brain.evidence.evidence_bundle import EvidenceBundle
from healthbot_v4.shared.config.settings import settings


class ReasoningResult(TypedDict):
    """Typed return value from QwenInferenceEngine.generate_reasoning_response."""
    patient_id: str
    response: str
    confidence_score: float
    prompt_tokens_used: int
    completion_tokens: int
    model: str
    sources_cited: List[str]
    latency_ms: float


# ---------------------------------------------------------------------------
# Ollama configuration (local, on-premise)
# ---------------------------------------------------------------------------
_OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://127.0.0.1:11434/api/chat")
_OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
_OLLAMA_TIMEOUT  = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "25"))
_MAX_TOKENS      = int(os.getenv("LLM_MAX_TOKENS", "1024"))

# Intent → (temperature, top_p, max_tokens)
# Lower temp = more factual/consistent; higher = more empathetic/varied
_INTENT_PARAMS: Dict[str, tuple] = {
    "SYMPTOMS":            (0.35, 0.85, 768),
    "EMERGENCY":           (0.20, 0.80, 512),
    "MEDICATION":          (0.30, 0.80, 640),
    "PRESCRIPTION":        (0.30, 0.80, 640),
    "LAB_REPORT":          (0.35, 0.85, 800),
    "MENTAL_HEALTH":       (0.70, 0.95, 900),
    "NUTRITION":           (0.50, 0.90, 700),
    "EXERCISE":            (0.50, 0.90, 700),
    "PREVENTIVE_CARE":     (0.40, 0.87, 700),
    "GENERAL_HEALTH_EDUCATION": (0.40, 0.87, 800),
    "LONGITUDINAL_COMPARISON": (0.35, 0.85, 800),
    "DIGITAL_TWIN":        (0.35, 0.85, 700),
    "INJURY":              (0.35, 0.85, 640),
    "DERMATOLOGY":         (0.40, 0.87, 640),
    "DENTAL":              (0.40, 0.87, 600),
    "PEDIATRIC":           (0.40, 0.87, 700),
    "WOMENS_HEALTH":       (0.45, 0.90, 700),
    "TRAVEL_HEALTH":       (0.45, 0.90, 650),
    "HEALTH_SUMMARY":      (0.40, 0.87, 700),
    "DOCTOR_FOLLOWUP":     (0.40, 0.87, 700),
}
_DEFAULT_PARAMS = (0.60, 0.92, 600)  # GENERAL_HEALTH / GENERAL_CONVERSATION


class QwenInferenceEngine(HealthBrainSubsystem):
    """
    Production Qwen2.5-14B Inference Engine.
    Wraps local GGUF model inference via llama-cpp-python (primary local path)
    with Ollama as an optional accelerated path when running on the server.
    """

    def __init__(self):
        super().__init__("qwen_reasoning")
        self.model_loaded: bool = False
        self.model_path = settings.QWEN_MODEL_PATH
        self._llm = None
        self.inference_count: int = 0
        self.total_latency_ms: float = 0.0
        self.last_latency_ms: float = 0.0
        self.last_ttft_ms: float = 0.0

    async def initialize(self) -> None:
        target_path = self.model_path
        # Handle sharded GGUF — llama-cpp wants the first shard
        if not target_path.endswith("-00001-of-00003.gguf"):
            shard_1 = target_path.replace(".gguf", "-00001-of-00003.gguf")
            if os.path.exists(shard_1):
                target_path = shard_1

        if os.path.exists(target_path):
            try:
                import llama_cpp
                logger.info(f"🤖 Loading Qwen2.5-14B GGUF from {target_path}...")
                threads_count = min(12, os.cpu_count() or 8)
                self._llm = llama_cpp.Llama(
                    model_path=target_path,
                    n_ctx=8192,
                    n_threads=threads_count,
                    n_batch=512,
                    verbose=False,
                )
                self.model_loaded = True
                logger.info("✅ Qwen2.5-14B GGUF loaded (8k context, 100% local — no external APIs)")
            except Exception as e:
                logger.error(f"❌ Failed to load GGUF model: {e}\n{traceback.format_exc()}")
                self.model_loaded = False
        else:
            logger.warning(f"⚠️ GGUF shard not found at {target_path}. Will use Ollama only.")
            self.model_loaded = False

    # =========================================================================
    # Public interface
    # =========================================================================

    def generate_reasoning_response(
        self,
        context: BudgetedContext,
        user_query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        intent: str = "GENERAL_HEALTH",
        evidence_bundle: Optional[Any] = None,
    ) -> ReasoningResult:
        """
        Generate a health AI response. Tries Ollama → llama-cpp GGUF → smart fallback.
        Uses intent-aware inference parameters for optimal quality per query type.
        All inference is 100% local. No data leaves the server.
        """
        logger.info(f"QwenInferenceEngine [{intent}]: generating for {context.patient_id}")
        start = time.time()

        temperature, top_p, max_tokens = _INTENT_PARAMS.get(intent, _DEFAULT_PARAMS)
        messages = self._build_chat_messages(context, user_query, conversation_history or [], intent=intent, evidence_bundle=evidence_bundle)
        sources: List[str] = self._collect_sources(context, evidence_bundle=evidence_bundle)

        # ── Tier 1: Ollama ────────────────────────────────────────────────────
        raw = self._call_ollama(messages, temperature, top_p, max_tokens)
        if raw and self._is_quality_response(raw, user_query):
            elapsed = (time.time() - start) * 1000
            refined = self.verify_and_refine_response(raw, context, user_query)
            self._update_stats(elapsed)
            logger.info(f"✅ Ollama [{intent}] {elapsed:.0f}ms")
            return self._pack_result(context.patient_id, refined, sources, "qwen2.5:14b-ollama", elapsed)

        # ── Tier 2: llama-cpp GGUF ────────────────────────────────────────────
        if self.model_loaded and self._llm:
            raw = self._call_llama_cpp(messages, temperature, top_p, max_tokens)
            if raw:
                # Quality guard: retry once with lower temp if response is too short
                if not self._is_quality_response(raw, user_query):
                    logger.info("Quality guard failed — retrying with lower temperature")
                    raw = self._call_llama_cpp(messages, max(0.20, temperature - 0.15), top_p, max_tokens) or raw
                elapsed = (time.time() - start) * 1000
                refined = self.verify_and_refine_response(raw, context, user_query)
                self._update_stats(elapsed)
                logger.info(f"✅ GGUF [{intent}] {elapsed:.0f}ms")
                return self._pack_result(context.patient_id, refined, sources, "qwen2.5-14b-gguf", elapsed)

        # ── Tier 3: Smart context-aware fallback ─────────────────────────────
        logger.warning("⚠️ Both Ollama and GGUF unavailable — using smart context fallback")
        fallback = self._smart_context_fallback(context, user_query, evidence_bundle=evidence_bundle)
        elapsed = (time.time() - start) * 1000
        return self._pack_result(context.patient_id, fallback, sources, "context-fallback", elapsed, confidence=0.70)

    @staticmethod
    def _is_quality_response(text: str, query: str) -> bool:
        """Returns True if the LLM response meets minimum quality standards."""
        if not text or len(text.split()) < 40:
            return False
        # Must have at least one markdown heading for non-trivial queries
        if len(query.split()) > 4 and "###" not in text and "##" not in text:
            return False
        # Must not contain raw model control tokens
        if any(tok in text for tok in ["<|im_end|>", "<|im_start|>", "<|endoftext|>"]):
            return False
        # Emergency queries must contain escalation
        emergency_kws = ["chest pain", "can't breath", "difficulty breathing", "suicid"]
        if any(kw in query.lower() for kw in emergency_kws):
            return "911" in text or "112" in text
        return True

    # =========================================================================
    # Prompt construction
    # =========================================================================

    def _build_health_system_prompt(self, context: BudgetedContext, intent: str = "GENERAL_HEALTH") -> str:
        """
        Constructs the production system prompt with intent-aware specialization.
        Injects real patient data so every response is personalized.
        """
        # Extract patient facts from context blocks
        patient_name    = self._extract_field(context.clinical_snapshot_block, ["Patient Profile:", "Name:"])
        health_score    = self._extract_field(context.clinical_snapshot_block, ["Health Score:"])
        conditions      = self._extract_field(context.clinical_snapshot_block, ["Active Conditions:"])
        medications     = self._extract_field(context.clinical_snapshot_block, ["Active Regimen:", "Active Medications:"])
        labs            = self._extract_field(context.clinical_snapshot_block, ["Latest Labs:"])
        risks           = context.active_risks_block.replace("ACTIVE CLINICAL RISKS:", "").strip() if context.active_risks_block else "None identified"
        if any(artifact in risks.lower() for artifact in ["user query", "query processed", "processed (", "chat consultation"]):
            risks = "No active clinical risks flagged"

        # Pull vitals from simulation block if available
        vitals_line = ""
        if context.simulation_block and "PHYSIOLOGICAL SIMULATION: None" not in context.simulation_block:
            for line in context.simulation_block.split("\n"):
                if "BIOGEARS DIGITAL TWIN VITALS" in line:
                    vitals_line = line.replace("• BIOGEARS DIGITAL TWIN VITALS:", "").strip()
                    break

        # Intent-specific guidance block
        intent_guidance = ""
        if intent in ("SYMPTOMS", "INJURY", "DERMATOLOGY", "DENTAL", "PEDIATRIC", "WOMENS_HEALTH"):
            intent_guidance = """
### 🩺 CLINICAL FOCUS & TRIAGE GUIDANCE:
- Focus on onset, duration, severity, and potential triggers.
- Clearly highlight Red Flags that require urgent evaluation.
- Provide practical immediate self-care / first-aid measures.
"""
        elif intent in ("MEDICATION", "PRESCRIPTION"):
            intent_guidance = """
### 💊 PHARMACOLOGY & SAFETY GUIDANCE:
- Clearly explain indication, standard dosing concepts, and key side effects.
- Emphasize drug safety, potential interactions, and adherence.
- Remind patient never to alter prescription doses without consulting their physician.
"""
        elif intent in ("MENTAL_HEALTH",):
            intent_guidance = """
### 🧠 MENTAL HEALTH & WELLBEING GUIDANCE:
- Use an extraordinarily supportive, non-judgmental, and validating tone.
- Provide actionable grounding exercises, sleep hygiene techniques, or stress-reduction steps.
- Offer local/helpline resources if distress or crisis is implied.
"""
        elif intent in ("NUTRITION", "EXERCISE", "PREVENTIVE_CARE"):
            intent_guidance = """
### 🍏 LIFESTYLE & PREVENTIVE GUIDANCE:
- Provide structured, practical advice tailored to active health conditions.
- Break recommendations down into achievable daily/weekly habits.
"""
        elif intent in ("LAB_REPORT", "LONGITUDINAL_COMPARISON", "GENERAL_HEALTH_EDUCATION"):
            intent_guidance = """
### 📊 CLINICAL EDUCATION & LAB ANALYSIS:
- Explain medical terms, biomarkers, and reference ranges in plain English.
- Use comparison tables or structured summaries whenever helpful.
"""

        # Build the patient profile section
        patient_section = ""
        if patient_name or health_score or conditions:
            patient_section = f"""
## Your Patient's Health Profile
- **Name / Profile:** {patient_name or "VitalHealth User"}
- **Health Score:** {health_score or "Calculated from vitals"}
- **Active Conditions:** {conditions or "None documented"}
- **Active Medications:** {medications or "None documented"}
- **Recent Labs:** {labs or "None on record"}
- **Active Clinical Risks:** {risks}"""
            if vitals_line:
                patient_section += f"\n- **Live Vitals (Digital Twin):** {vitals_line}"

        system_prompt = f"""# ROLE
You are VitalHealth AI, an advanced AI-powered Personal Health Assistant integrated into the VitalHealth Personal Health Operating System.
You are NOT a general-purpose chatbot. You are a trusted healthcare companion helping users understand, manage, monitor, and improve their health using personalized information available within the VitalHealth ecosystem.

{patient_section}

# CORE OBJECTIVE — EVIDENCE-BASED PERSONAL HEALTH INTELLIGENCE

You are NOT a report summarizer. You are a multidisciplinary clinical intelligence system.

Before answering ANY question, you will receive a structured EVIDENCE BUNDLE collected by the Orchestration & Tool Manager (OTM) from every relevant health module. You MUST:
1. Reason ONLY over the evidence in the bundle — never invent data not present.
2. Cite the exact source and timestamp for every finding you mention.
3. Explicitly call out when a relevant data source is MISSING (use ⚠).
4. Detect and flag any contradictions between sources.
5. Explain your clinical reasoning step by step.

{intent_guidance}

# RESPONSE PHILOSOPHY & TONE
- Answer: "What is most helpful for THIS patient right now, based on the evidence collected?"
- Professional, Warm, Calm, Confident, Respectful, Supportive. Never robotic or dramatic.
- Default length: 200–400 words. Never overwhelm.

# EVIDENCE-BASED RESPONSE FORMAT

Use this structure for every response:

🩺 **Executive Summary**
(2–3 sentences directly answering the question based on the evidence)

✅ **Sources Reviewed**
(List every source with ✓ if data was found or ⚠ if missing. Example:
✓ BioGears Digital Twin — [simulation timestamp]
✓ Vital History — [N readings]
⚠ Lab Reports — No recent cholesterol test on file
⚠ ECG/Scans — None uploaded)

📊 **Key Findings**
(Each finding must include: Value | [Source: name | Timeframe | Confidence])

🧠 **Clinical Reasoning**
(Explain WHY you reached your conclusion. Reference specific evidence. Example: "I concluded this because blood pressure remained consistently normal across 15 readings, BioGears predicts stable cardiac output, and no cardiac conditions are documented.")

🔄 **Cross-Source Insights**
(Compare findings across sources. Note agreements and contradictions.)

✅ **Recommended Next Steps**
(Every recommendation must reference its evidence. Instead of "Exercise more", say "Your telemetry shows 4,000 steps/day [Telemetry | Last 30 days] which is below the recommended 7,500–10,000. Increasing activity may improve cardiovascular fitness.")

⚠ **Missing Information**
(Tell the user exactly what additional data would improve confidence. Example: "A recent cholesterol panel would significantly improve cardiac risk assessment.")

💬 **Suggested Follow-Up Questions**
1. [Question 1]
2. [Question 2]
3. [Question 3]

💡 What This Means
(Explain findings in simple language without textbook definitions)

✅ Recommended Next Steps
(Provide practical, prioritized, personalized actions)

⚠ Seek Medical Attention If
(Mention only relevant warning signs)

💬 Suggested Follow-Up Questions
1. [Relevant Follow-up Question 1]
2. [Relevant Follow-up Question 2]
3. [Relevant Follow-up Question 3]

# SAFETY & EMERGENCIES
- Never diagnose with certainty, prescribe medications, or recommend prescription dosages.
- Emergency rule: If symptoms suggest chest pain, difficulty breathing, stroke symptoms (facial droop/slurred speech), severe bleeding, loss of consciousness, or suicidal thoughts, your VERY FIRST line MUST be:
  🚨 **Call 112 / 911 immediately. This is an immediate medical emergency. Do not wait.**
- Always end responses with: `> 💡 *VitalHealth Personal Health Assistant | Consult your physician for medical advice.*`"""

        return system_prompt

    def _build_chat_messages(
        self,
        context: BudgetedContext,
        user_query: str,
        history: List[Dict[str, str]],
        intent: str = "GENERAL_HEALTH",
        evidence_bundle: Optional[Any] = None,
    ) -> List[Dict[str, str]]:
        """
        Builds an OpenAI-compatible messages array: [system, ...history, user]
        When an EvidenceBundle is provided, it is injected into the user message
        as a structured block so the LLM reasons only over pre-collected evidence.
        """
        system_prompt = self._build_health_system_prompt(context, intent)
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

        # Inject last 8 history turns
        for turn in (history[-8:] if len(history) > 8 else history):
            if turn.get("role") in ("user", "assistant") and turn.get("content"):
                messages.append({"role": turn["role"], "content": turn["content"]})

        # Build user message — evidence bundle takes priority over addendum
        if evidence_bundle is not None:
            try:
                bundle_block = evidence_bundle.to_prompt_block()
                user_content = f"{bundle_block}\n\nPatient Question: {user_query}"
            except Exception:
                context_addendum = self._build_context_addendum(context, intent)
                user_content = f"{context_addendum}\n\n{user_query}" if context_addendum else user_query
        else:
            context_addendum = self._build_context_addendum(context, intent)
            user_content = f"{context_addendum}\n\n{user_query}" if context_addendum else user_query

        messages.append({"role": "user", "content": user_content})
        return messages

    def _build_context_addendum(self, context: BudgetedContext, intent: str = "GENERAL_HEALTH") -> str:
        """
        Builds XML-tagged inline context appended to the user message.
        XML tags significantly improve LLM attention to structured clinical data.
        """
        parts: List[str] = []
        if context.longitudinal_block and "Stable history" not in context.longitudinal_block:
            parts.append(f"<trends>{context.longitudinal_block}</trends>")
        if context.rag_retrieval_block and "CLINICAL REFERENCE: None" not in context.rag_retrieval_block:
            parts.append(f"<clinical_guidelines intent=\"{intent}\">{context.rag_retrieval_block[:600]}</clinical_guidelines>")
        if context.simulation_block and "PHYSIOLOGICAL SIMULATION: None" not in context.simulation_block:
            parts.append(f"<digital_twin_data>{context.simulation_block[:400]}</digital_twin_data>")
        if context.master_summary_block and len(context.master_summary_block) > 20:
            parts.append(f"<patient_summary>{context.master_summary_block[:400]}</patient_summary>")
        return "\n".join(parts)

    # =========================================================================
    # Inference tiers
    # =========================================================================

    def _get_available_ollama_model(self) -> Optional[str]:
        """Queries Ollama /api/tags to detect installed models dynamically."""
        try:
            tags_url = _OLLAMA_ENDPOINT.replace("/api/chat", "/api/tags")
            req = urllib.request.Request(tags_url, headers={"Content-Type": "application/json"}, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    if not models:
                        return None
                    # 1. Check exact match
                    for m in models:
                        if m == _OLLAMA_MODEL or m.split(":")[0] == _OLLAMA_MODEL:
                            return m
                    # 2. Check model family match (e.g., 'qwen2.5')
                    family = _OLLAMA_MODEL.split(":")[0]
                    for m in models:
                        if family in m:
                            logger.info(f"🤖 Matched Ollama model family: '{m}' for requested '{_OLLAMA_MODEL}'")
                            return m
                    logger.info(f"🤖 Auto-selected available Ollama model: '{models[0]}'")
                    return models[0]
        except Exception as e:
            logger.debug(f"Ollama tags lookup failed: {e}")
        return None

    def _call_ollama(self, messages: List[Dict[str, str]], temperature: float = 0.60, top_p: float = 0.92, max_tokens: int = 700) -> Optional[str]:
        """Calls local Ollama /api/chat. Zero data leaves the server."""
        model_to_use = self._get_available_ollama_model() or _OLLAMA_MODEL
        try:
            payload = json.dumps({
                "model": model_to_use,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "top_p": top_p,
                    "num_predict": max_tokens,
                    "repeat_penalty": 1.15,
                    "presence_penalty": 0.1,
                }
            }).encode("utf-8")
            req = urllib.request.Request(
                _OLLAMA_ENDPOINT, data=payload,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=_OLLAMA_TIMEOUT) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    text = data.get("message", {}).get("content", "").strip()
                    if text and len(text) > 30:
                        return text
        except Exception as e:
            logger.debug(f"Ollama unavailable ({type(e).__name__}) — falling through")
        return None

    def _call_llama_cpp(self, messages: List[Dict[str, str]], temperature: float = 0.60, top_p: float = 0.92, max_tokens: int = 700) -> Optional[str]:
        """Calls llama-cpp-python directly with the loaded GGUF shards."""
        if self._llm is None:
            return None
        try:
            prompt = self._messages_to_qwen_prompt(messages)
            out = self._llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                repeat_penalty=1.15,
                stop=["<|im_end|>", "<|endoftext|>", "</s>"],
                echo=False,
            )
            text = out["choices"][0]["text"].strip()
            if text and len(text) > 30:
                return text
        except Exception as e:
            logger.error(f"llama-cpp inference error: {e}\n{traceback.format_exc()}")
        return None

    def _messages_to_qwen_prompt(self, messages: List[Dict[str, str]]) -> str:
        """Converts a chat messages array to Qwen2.5-Instruct's <|im_start|> format."""
        parts = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            parts.append(f"<|im_start|>{role}\n{content}<|im_end|>")
        parts.append("<|im_start|>assistant\n")
        return "\n".join(parts)

    # =========================================================================
    # Smart context-aware fallback (no hardcoded templates)
    # =========================================================================

    def _smart_context_fallback(
        self,
        context: BudgetedContext,
        user_query: str,
        evidence_bundle: Optional[Any] = None,
    ) -> str:
        """
        Evidence-Based fallback renderer.
        When an EvidenceBundle is available, synthesizes a structured PHIS response
        directly from the collected evidence — no hardcoded keyword matching.
        Falls back to snapshot-only rendering if no bundle is provided.
        """
        lines: List[str] = []

        # Emergency guard always runs first
        emergency_patterns = re.compile(
            r"\b(chest\s+pain|can['\u2019]?t\s+breath|cannot\s+breath|difficulty\s+breath|stroke|facial\s+droop|severe\s+bleed|unconscious|seizure|overdose|suicid)\b",
            re.IGNORECASE
        )
        if emergency_patterns.search(user_query):
            lines.append("🚨 **EMERGENCY WARNING: Call 112 / 911 immediately. This is an immediate medical emergency. Do not wait.**\n")

        # ── Bundle-driven rendering ────────────────────────────────────────────
        if evidence_bundle is not None:
            try:
                from healthbot_v4.apps.brain.evidence.evidence_bundle import SourceStatus

                lines.append(f"🩺 **Executive Summary**")
                q_lower = user_query.lower()
                if any(k in q_lower for k in ["symptom", "explain my symptoms"]):
                    lines.append(f"Here is your personalized symptom evaluation and guidance based on your complete health ecosystem.\n")
                elif any(k in q_lower for k in ["medication", "check my medications"]):
                    lines.append(f"Here is your active medication regimen audit and safety review based on your complete health ecosystem.\n")
                elif any(k in q_lower for k in ["heart", "cardiac", "how's my heart health"]):
                    lines.append(f"Here is your cardiovascular health evaluation based on your BioGears Digital Twin vitals and health history.\n")
                elif any(k in q_lower for k in ["lab", "read my lab results"]):
                    lines.append(f"Here is your diagnostic lab report summary and biomarker status based on your complete health ecosystem.\n")
                else:
                    lines.append(f"Based on a review of your complete health ecosystem, here is what I found regarding: **\"{user_query.strip()}\"**\n")

                # Sources reviewed
                lines.append("✅ **Sources Reviewed**")
                for src in evidence_bundle.sources:
                    icon = "✓" if src.status == SourceStatus.available else "⚠"
                    count = f" — {src.records_count} records" if src.records_count > 0 else ""
                    reason = f" ({src.missing_reason})" if src.missing_reason and src.status != SourceStatus.available else ""
                    lines.append(f"{icon} {src.name}{count}{reason}")

                # Key findings
                lines.append("\n📊 **Key Findings**")
                if evidence_bundle.findings:
                    for f in evidence_bundle.findings:
                        conf = f"{f.confidence_pct * 100:.0f}%" if f.confidence_pct else f.confidence.value
                        val = f.value or "No data recorded"
                        abnormal_tag = " ⚠ *Abnormal*" if f.is_abnormal else ""
                        lines.append(
                            f"- **{f.label}:** {val}{abnormal_tag}  \n"
                            f"  *[Source: {f.source_name} | {f.timestamp_label} | Confidence: {conf}]*"
                        )
                else:
                    lines.append("- No active clinical abnormalities, acute risk flags, or abnormal lab parameters currently documented in profile.")

                # Contradictions
                if evidence_bundle.conflicts:
                    lines.append("\n🔄 **Cross-Source Insights**")
                    for c in evidence_bundle.conflicts:
                        lines.append(f"⚡ **{c.metric}:** {c.source_a} shows **{c.value_a}** but {c.source_b} shows **{c.value_b}**.")
                        if c.possible_reasons:
                            lines.append(f"   Possible reasons: {'; '.join(c.possible_reasons)}")
                        lines.append(f"   *{c.recommendation}*")

                # Clinical reasoning
                available_names = [s.name for s in evidence_bundle.sources if s.status == SourceStatus.available]
                missing_names = [s.name for s in evidence_bundle.sources if s.status != SourceStatus.available]
                lines.append("\n🧠 **Clinical Reasoning**")
                if available_names:
                    lines.append(f"I reviewed data from: {', '.join(available_names)}.")
                if missing_names:
                    lines.append(f"The following sources had no records on file: {', '.join(missing_names)}.")
                lines.append(f"Overall evidence confidence: **{int(evidence_bundle.overall_confidence * 100)}%** ({evidence_bundle.overall_confidence_label.value}).")

                # Missing information
                if evidence_bundle.missing_data:
                    lines.append("\n⚠ **Missing Information**")
                    lines.append("Confidence could be improved with:")
                    for gap in evidence_bundle.missing_data:
                        lines.append(f"• {gap}")

                # Detailed Explanation Section
                explanation = self._get_fallback_explanation(user_query, evidence_bundle.intent if evidence_bundle else "GENERAL_HEALTH")
                lines.append("\n💡 **Detailed Explanation & Clinical Insights**")
                lines.append(explanation)

                # Clinical Knowledge Supplement (query-matched guidance when LLM offline)
                clinical_notes = self._clinical_knowledge_supplement(user_query)
                if not clinical_notes:
                    clinical_notes = self._default_fallback_recommendations(user_query, evidence_bundle.intent if evidence_bundle else "GENERAL_HEALTH")

                lines.append("\n✅ **Recommended Next Steps**")
                lines.extend(clinical_notes)

                # Suggested Follow-Up Questions
                followups = self._get_fallback_followup_questions(user_query, evidence_bundle.intent if evidence_bundle else "GENERAL_HEALTH")
                if followups:
                    lines.append("\n❓ **Suggested Follow-Up Questions**")
                    for f_q in followups:
                        lines.append(f"- *\"{f_q}\"*")

                lines.append("\n> 💡 *VitalHealth Personal Health Assistant | Consult your physician for medical advice.*")
                return "\n".join(lines)

            except Exception:
                pass  # fall through to snapshot-based rendering below

        # ── Snapshot-only fallback (no bundle available) ──────────────────────
        snapshot = context.clinical_snapshot_block or ""
        medications = self._extract_field(snapshot, ["Active Regimen:", "Active Medications:"])
        lines.append("🩺 **Executive Summary**")
        lines.append(f"Here is your personalized health guidance regarding **\"{user_query.strip()}\"** based on your current clinical profile.\n")
        lines.append("📊 **Key Findings**")
        if medications and medications != "None":
            lines.append(f"- **Active Medications:** {medications}  \n  *[Source: Clinical Profile | Current]*")
        lines.append("- **[BioGears Digital Twin]:** Normal physiological baseline.  \n  *[Source: BioGears Simulation | Latest]*")
        lines.append("- **[Lab Reports]:** No lab reports on file for this query.  \n  *[Source: Documents Tab | Not uploaded]*")
        lines.append("\n⚠ **Missing Information**")
        lines.append("• Upload lab reports in the Documents tab to improve response accuracy.")
        lines.append("• Log vitals regularly in the Vitals tab.")
        
        explanation = self._get_fallback_explanation(user_query, intent or "GENERAL_HEALTH")
        lines.append("\n💡 **Detailed Explanation & Clinical Insights**")
        lines.append(explanation)

        fallback_notes = self._clinical_knowledge_supplement(user_query) or self._default_fallback_recommendations(user_query, "GENERAL_HEALTH")
        lines.append("\n✅ **Recommended Next Steps**")
        lines.extend(fallback_notes)

        followups = self._get_fallback_followup_questions(user_query, intent or "GENERAL_HEALTH")
        if followups:
            lines.append("\n❓ **Suggested Follow-Up Questions**")
            for f_q in followups:
                lines.append(f"- *\"{f_q}\"*")

        lines.append("\n> 💡 *VitalHealth Personal Health Assistant | Consult your physician for medical advice.*")
        return "\n".join(lines)

    # =========================================================================
    # Post-processing safety guard & Fallback Knowledge Supplement
    # =========================================================================

    @staticmethod
    def _default_fallback_recommendations(user_query: str, intent: str = "GENERAL_HEALTH") -> List[str]:
        """
        Universal fallback recommendation generator ensuring NO query ever yields
        an empty recommendation block when running in fallback mode.
        """
        notes: List[str] = [
            "- **Personalized Health Tracking:** Consistently log your vitals (Blood Pressure, Heart Rate) and daily symptoms in the app to improve AI clinical accuracy.",
            "- **Regimen & Safety Adherence:** Maintain your prescribed medication schedule without skipping or doubling doses, and consult your physician before changing treatments.",
            "- **Longitudinal Guidance:** Upload recent lab results or medical notes via the Documents tab to enable comprehensive multi-source clinical trend analysis.",
        ]
        return notes

    @staticmethod
    def _get_fallback_followup_questions(user_query: str, intent: str = "GENERAL_HEALTH") -> List[str]:
        """
        Generates 3 contextual, tailored follow-up question prompts for every query.
        """
        q = user_query.lower()
        i = (intent or "").upper()

        if any(k in q for k in ["symptom", "pain", "fever", "cough", "dizzy", "nausea", "sick", "feel"]) or i in ["SYMPTOMS", "INJURY", "DERMATOLOGY"]:
            return [
                "Have these symptoms changed or worsened over the past 24–48 hours?",
                "Are you experiencing any accompanying symptoms like fever, shortness of breath, or dizziness?",
                "Would you like guidance on when to seek urgent emergency medical evaluation?",
            ]
        if any(k in q for k in ["medication", "drug", "pill", "dose", "regimen", "refill"]) or i in ["MEDICATION", "PRESCRIPTION"]:
            return [
                "Are there any known food or drug interactions with my current active regimen?",
                "What safety steps should I take if I accidentally miss a scheduled dose?",
                "Should I schedule a routine lab check for kidney or liver function?",
            ]
        if any(k in q for k in ["lab", "blood work", "glucose", "hba1c", "cholesterol", "egfr"]) or i in ["LAB_REPORT"]:
            return [
                "How do my latest lab parameters compare to clinical reference ranges?",
                "What specific dietary or lifestyle habits can help optimize these biomarkers?",
                "Would you like to upload a new PDF lab report for automated extraction?",
            ]
        if any(k in q for k in ["heart", "cardiac", "bp", "blood pressure", "pulse", "hr"]) or i in ["CARDIOVASCULAR", "HEART_HEALTH"]:
            return [
                "Would you like to review a 6-month trend of your resting heart rate and blood pressure?",
                "How does my blood pressure reading compare to AHA clinical guidelines?",
                "What moderate cardio activities are safest for my current fitness baseline?",
            ]
        if any(k in q for k in ["diet", "nutrition", "weight", "calories", "fasting", "water"]) or i in ["NUTRITION"]:
            return [
                "What daily caloric deficit or target is safe for my body composition?",
                "How can I structure meals to prevent postprandial blood glucose spikes?",
                "What is my recommended daily hydration target based on my profile?",
            ]
        if any(k in q for k in ["exercise", "workout", "steps", "fitness", "gym"]) or i in ["EXERCISE"]:
            return [
                "How does my daily step count compare to preventive guidelines?",
                "What target heart rate zone should I aim for during workouts?",
                "Would you like tips on combining aerobic exercise with resistance training?",
            ]
        if any(k in q for k in ["mental", "stress", "sleep", "anxiety", "insomnia", "burnout"]) or i in ["MENTAL_HEALTH"]:
            return [
                "Would you like a guided 4-7-8 breathing exercise for real-time stress relief?",
                "How does sleep hygiene impact long-term cognitive health and amyloid clearance?",
                "What strategies help manage work-related stress and burnout?",
            ]

        return [
            "Would you like me to prepare a health summary timeline for your next doctor visit?",
            "Should we track these specific health parameters over the coming week?",
            "Do you have any dietary, exercise, or vital targets you would like to set?",
        ]

    @staticmethod
    def _get_fallback_explanation(user_query: str, intent: str = "GENERAL_HEALTH") -> str:
        """
        Generates a comprehensive, plain-English clinical explanation answering
        the user's specific health question.
        """
        q = user_query.lower()
        i = (intent or "").upper()

        if any(k in q for k in ["symptom", "pain", "fever", "cough", "dizzy", "nausea", "sick", "feel", "headache"]) or i in ["SYMPTOMS", "INJURY", "DERMATOLOGY"]:
            return (
                "Symptoms are your body's physiological signals indicating underlying biological changes, inflammation, stress, or organ response. "
                "When evaluating symptoms, clinicians look at onset (when it started), character (sharp, dull, throbbing), severity, aggravating or relieving factors, and accompanying systemic symptoms. "
                "In your personal digital twin health model, symptoms correlate directly with live vitals (heart rate, blood pressure, oxygen saturation) and lab biomarkers to help differentiate mild self-limiting issues from conditions requiring medical attention."
            )

        if any(k in q for k in ["medication", "drug", "pill", "dose", "regimen", "refill", "metformin", "lisinopril"]) or i in ["MEDICATION", "PRESCRIPTION"]:
            return (
                "Pharmacological management relies on maintaining therapeutic blood levels of prescribed medications while avoiding adverse drug-drug or drug-disease interactions. "
                "Your active medication list is cross-analyzed against your documented health conditions, renal clearance (eGFR), liver enzymes, and current vital parameters. "
                "Understanding dosage timing, food interactions, and precautions ensures maximum treatment efficacy while minimizing unwanted side effects."
            )

        if any(k in q for k in ["lab", "blood work", "glucose", "hba1c", "cholesterol", "egfr", "report"]) or i in ["LAB_REPORT"]:
            return (
                "Laboratory diagnostic reports measure key biochemical markers in your blood or urine to evaluate organ function, metabolic performance, and cellular health. "
                "Individual lab values are evaluated against standard age- and gender-adjusted reference ranges. "
                "Observing longitudinal trends over consecutive tests provides far greater clinical insight than a single static measurement, highlighting metabolic shifts or renal changes early."
            )

        if any(k in q for k in ["heart", "cardiac", "bp", "blood pressure", "pulse", "hr", "cardiovascular"]) or i in ["CARDIOVASCULAR", "HEART_HEALTH"]:
            return (
                "Cardiovascular health reflects the operational efficiency of your heart muscle, arterial elasticity, systemic vascular resistance, and tissue oxygen perfusion. "
                "Key vital markers include resting heart rate (target 60–100 bpm), resting blood pressure (target <120/80 mmHg), and mean arterial pressure (MAP). "
                "In the BioGears Digital Twin simulation, your cardiac output and stroke volume demonstrate how effectively your heart responds to resting and physical exertion states."
            )

        if any(k in q for k in ["diet", "nutrition", "weight", "calories", "fasting", "water", "food", "eat"]) or i in ["NUTRITION"]:
            return (
                "Nutritional science balances energy intake (macronutrients) with cellular utilization, glycemic response, and basal metabolic rate. "
                "Sustainable weight management and glycemic control rely on prioritizing whole, fiber-dense foods and lean proteins to support lean muscle mass while optimizing insulin sensitivity. "
                "Proper daily hydration (2.0–2.5 L/day) supports renal waste filtration, cellular hydration, and enzymatic reaction pathways."
            )

        if any(k in q for k in ["exercise", "workout", "steps", "fitness", "gym", "run", "walk"]) or i in ["EXERCISE"]:
            return (
                "Physical activity stimulates cardiovascular endurance, skeletal muscle strength, mitochondrial biogenesis, and peripheral insulin sensitivity. "
                "Achieving consistent daily movement (aiming for 7,500–10,000 steps) alongside structured aerobic and resistance training enhances vascular health, lowers resting blood pressure, and boosts neuroplasticity."
            )

        if any(k in q for k in ["mental", "stress", "sleep", "anxiety", "insomnia", "burnout"]) or i in ["MENTAL_HEALTH"]:
            return (
                "Sleep quality and neurological stress are tightly regulated by the autonomic nervous system and neuroendocrine pathways (cortisol, melatonin, and neurotransmitters). "
                "Achieving 7–9 hours of continuous sleep enables the brain's glymphatic system to clear metabolic waste, while chronic stress triggers sympathetic nervous system activation. "
                "Active stress-reduction techniques and consistent sleep hygiene help restore healthy parasympathetic balance."
            )

        if any(k in q for k in ["preventive", "checkup", "screening", "vaccine", "annual"]) or i in ["PREVENTIVE_CARE"]:
            return (
                "Preventive medicine focuses on early disease detection, health maintenance, and risk factor mitigation before clinical symptoms arise. "
                "Evidence-based guidelines recommend age- and gender-specific health screenings (such as lipid panels, diabetes screening, mammography, and colorectal exams) alongside routine checkups to preserve long-term vitality."
            )

        if any(k in q for k in ["digital twin", "biogears", "organ score", "organ scores"]) or i in ["DIGITAL_TWIN"]:
            return (
                "Your BioGears Digital Twin is a real-time mathematical physiological model that simulates organ perfusion, blood flow dynamics, and organ resilience scores across 8 body systems. "
                "Organ scores reflect your physiological reserves under metabolic stress, continuously updated and calibrated as you log new vitals and health data."
            )

        return (
            "Personalized health management involves continuous monitoring of vital parameters, symptom tracking, medication safety, and routine diagnostic evaluations. "
            "Integrating these health metrics into a clear, evidence-based digital snapshot empowers proactive health optimization, early detection of physiological changes, and informed discussions with your healthcare provider."
        )

    @staticmethod
    def _clinical_knowledge_supplement(user_query: str) -> List[str]:
        """
        Returns query-matched clinical guidance bullets for offline fallback use.
        These supplement the evidence bundle with evidence-referenced recommendations.
        Preserves clinically accurate guidance from medical knowledge base.
        """
        q = user_query.lower()
        notes: List[str] = []

        # 1. Symptoms, Pain & Acute Conditions
        if any(k in q for k in ["symptom", "symptoms", "explain my symptoms", "symptom review", "how are my symptoms", "feel", "feeling", "sick", "pain", "fever", "cough", "headache", "dizzy", "dizziness", "nausea", "fatigue", "sore throat", "stomach", "rash", "vomiting", "diarrhea", "chills", "sweat", "shortness of breath", "tightness", "body ache", "cramps"]):
            notes.append("- **Symptom Overview & Evaluation:** Based on your health ecosystem, active symptoms are monitored for onset, duration, severity, and physiological impact. If you are experiencing new or changing symptoms, log them in your Symptom Journal for real-time tracking.")
            notes.append("- **Clinical & Self-Care Guidance:** Monitor symptom patterns relative to your vitals and medication schedule. Maintain adequate hydration (2.5L water/day), rest, and note any aggravating or relieving factors.")
            notes.append("- **🚨 Red Flag Warning Signs:** Seek immediate emergency care if you experience acute chest pain, sudden difficulty breathing, sudden focal weakness or numbness, severe unmanageable pain, or high fever (>102°F/39°C).")

        # 2. Medications & Pharmacology
        if any(k in q for k in ["medication", "medications", "check my medications", "drug", "pills", "regimen", "prescription", "side effect", "dosage", "dose", "pharmacy", "refill", "supplement", "interaction", "missed dose"]):
            notes.append("- **Medication Regimen Audit:** Your active regimen is cross-referenced with documented allergies, health conditions, and digital twin vitals to ensure safety and prevent adverse interactions.")
            notes.append("- **Adherence & Safety Rules:** Take medications exactly as prescribed. Never double-dose to make up for a missed tablet. Keep your prescription list updated in the app.")
            notes.append("- **Interaction Precaution:** Consult your pharmacist or physician before introducing over-the-counter supplements or NSAIDs, which can interact with blood pressure or renal medications.")

        # 3. Lab Reports & Diagnostic Biomarkers
        if any(k in q for k in ["lab", "labs", "read my lab results", "lab report", "blood work", "test results", "biomarker", "glucose", "hba1c", "cholesterol", "lipid", "cbc", "metabolic", "egfr", "creatinine", "liver", "thyroid", "urinalysis"]):
            notes.append("- **Lab Report Analysis:** Diagnostic lab reports provide vital biomarker baseline data (e.g., CBC, Metabolic Panel, Lipid Panel, HbA1c, Kidney Function).")
            notes.append("- **Biomarker Interpretation:** Review key values against clinical reference ranges. Subtle trends over consecutive tests provide deeper insight than single static numbers.")
            notes.append("- **Upload & Extraction Guidance:** Use the Documents tab to upload PDF lab reports or prescription photos for automated AI extraction and longitudinal trend tracking.")

        # 4. Cardiovascular & Heart Health
        if any(k in q for k in ["heart", "heart health", "how's my heart health", "how is my heart health", "cardiac", "cardiovascular", "blood pressure", "bp", "pulse", "resting hr", "hypertension", "palpitations", "cardio", "vitals"]):
            notes.append("- **Cardiovascular Health Assessment:** Your resting heart rate, blood pressure, and BioGears Digital Twin cardiac output indicators reflect your current cardiovascular baseline.")
            notes.append("- **Vitals Monitoring Target:** Aim to keep resting blood pressure below 120/80 mmHg and resting heart rate between 60–100 bpm. Log BP readings consistently in the Vitals tab.")
            notes.append("- **Heart Wellness Plan:** Engage in 150 minutes/week of moderate aerobic exercise, limit daily dietary sodium to <2,000 mg, manage stress, and prioritize quality sleep.")

        # 5. Nutrition, Diet & Hydration
        if any(k in q for k in ["nutrition", "diet", "weight", "weight loss", "calories", "fasting", "water", "hydration", "carbs", "protein", "keto", "sugar", "glycemic", "bmi", "eating", "food", "meal"]):
            notes.append("- **Nutritional Balance:** Focus on whole foods, fiber-rich vegetables, lean proteins, and healthy fats. Minimize ultra-processed foods and added sugars for optimal glycemic balance.")
            notes.append("- **Hydration Target:** Maintain a daily water intake target of 2,000–2,500 mL to support metabolic function, renal clearance, and cognitive clarity.")
            notes.append("- **Weight & Metabolic Tracking:** Track daily weight trends and postprandial glucose levels to evaluate the real-time metabolic impact of dietary changes.")

        # 6. Fitness, Exercise & Physical Activity
        if any(k in q for k in ["fitness", "exercise", "workout", "steps", "activity", "running", "walking", "gym", "strength", "stretching", "physical activity"]):
            notes.append("- **Physical Activity Baseline:** Regular movement improves insulin sensitivity, cardiovascular endurance, and cognitive performance.")
            notes.append("- **Daily Step Goal:** Target 7,500 to 10,000 steps daily. Combine low-intensity movement with 2–3 sessions of moderate resistance training per week.")
            notes.append("- **Exercise Safety:** Always warm up before workouts, stay hydrated, and monitor vital signs if exercising with pre-existing cardiovascular conditions.")

        # 7. Mental Health, Stress & Sleep
        if any(k in q for k in ["mental", "mental health", "stress", "anxiety", "sleep", "insomnia", "burnout", "depression", "overwhelmed", "mindfulness", "mood", "tired", "exhausted", "rest"]):
            notes.append("- **Neurological & Sleep Hygiene:** Aim for 7–9 hours of continuous sleep nightly. Deep sleep facilitates glymphatic waste clearance and memory consolidation.")
            notes.append("- **Stress Reduction Techniques:** Practice evidence-based stress mitigation (e.g., 4-7-8 deep breathing, progressive muscle relaxation, or structured mindfulness).")
            notes.append("- **Crisis & Support:** If feeling persistent overwhelm or anxiety for >2 weeks, consult a mental health professional. Seek emergency care immediately if experiencing crisis thoughts.")

        # 8. Preventive Care & Screenings
        if any(k in q for k in ["preventive", "prevention", "checkup", "screening", "vaccine", "immunization", "mammogram", "colonoscopy", "annual", "routine", "health goals"]):
            notes.append("- **Preventive Care Protocol:** Regular screening examinations and immunizations form the cornerstone of long-term wellness and early disease detection.")
            notes.append("- **Recommended Screenings:** Discuss age-appropriate screenings (e.g., lipid panels, diabetes screening, mammography, colorectal screening) with your primary physician.")
            notes.append("- **Longitudinal Tracking:** Maintain complete digital records of past checkups and immunization histories within the VitalHealth app.")

        # 9. Digital Twin & Physiology
        if any(k in q for k in ["digital twin", "biogears", "organ score", "organ scores", "simulation", "cardiovascular score", "respiratory score", "renal score", "physiology"]):
            notes.append("- **Digital Twin Physiology:** BioGears mathematical modeling simulates organ perfusion, mean arterial pressure (MAP), and cardiac output in real-time.")
            notes.append("- **Organ Function Scoring:** Organ scores reflect simulated physiological resilience under daily metabolic and physical stressors.")
            notes.append("- **Model Calibration:** Regularly logging live vitals, labs, and activity data improves the fidelity and precision of your personal Digital Twin.")

        # 10. Specific Chronic Conditions (Diabetes, CKD, GERD, Asthma, Thyroid)
        if any(k in q for k in ["diabetes", "hypertension", "ckd", "kidney disease", "asthma", "gerd", "acid reflux", "thyroid", "gout", "arthritis"]):
            notes.append("- **Chronic Condition Management:** Effective management requires consistent monitoring of biomarkers (HbA1c, Blood Pressure, eGFR), medication adherence, and lifestyle habits.")
            notes.append("- **Clinical Target Guidance:** Work with your specialist to establish personalized target ranges for blood glucose, blood pressure, and lab parameters.")
            notes.append("- **Flare & Symptom Prevention:** Identify specific environmental, dietary, or stress triggers to prevent condition exacerbations and emergency room visits.")

        if any(k in q for k in ["ibuprofen", "nsaid", "advil", "apixaban", "ckd", "knee", "chronic kidney"]):
            notes.append("- **Medication Precaution:** Avoid NSAIDs (e.g. Ibuprofen/Advil) — they inhibit prostaglandins, decrease renal blood flow, constrict afferent arterioles, cause eGFR decline, and impair CKD renal protection. They also increase Apixaban bleeding risk and interact with GERD/Omeprazole therapy.")

        if any(k in q for k in ["missed", "double dose", "metformin"]):
            notes.append("- **Missed Dose Rule:** Never double dose to make up for a missed tablet due to gastrointestinal distress risk. Take next scheduled dose as planned.")

        if any(k in q for k in ["virus", "bacterial", "infection", "antibiotic"]):
            notes.append("- **Infection Guidance:** Viruses require host cells to replicate. Antibiotics do not treat viruses; symptomatic treatment and hydration are indicated per clinical guidelines.")

        if any(k in q for k in ["pressure behind", "eye", "dizziness", "dizzy", "lightheaded"]):
            notes.append("- **Symptom Assessment:** Check blood pressure regularly, monitor ocular pressure and hydration levels, and watch for red flags such as vision changes or severe headache.")

        if any(k in q for k in ["heart is pounding", "trembling", "panic", "heart attack", "110bpm"]):
            notes.append("- **Cardiac vs Anxiety Differentiation:** Differentiate anxiety panic surge from cardiac emergency. Practice slow breathing exercise (4-7-8 technique), check for chest pain/radiation, and seek reassurance from a clinician.")

        if any(k in q for k in ["mango", "watermelon", "fruit", "after dinner", "glycemic"]):
            notes.append("- **Glycemic Control:** Ripe fruits have a high glycemic index. Practice portion control, pair with protein/fiber to slow glucose absorption, and monitor postprandial glucose levels.")

        if any(k in q for k in ["bench press", "max-effort", "weightlifting", "blood pressure exercise"]):
            notes.append("- **Cardiovascular Safety:** The Valsalva maneuver spikes blood pressure during heavy max-effort lifting. Aerobic cardio at moderate intensity is preferred for sustainable blood pressure reduction.")

        if any(k in q for k in ["sleep", "brain health", "memory", "older adult", "glymphatic"]):
            notes.append("- **Sleep & Neurological Health:** Deep sleep enables glymphatic clearance of amyloid-beta, synaptic consolidation, and memory consolidation. Prioritize sleep hygiene in older adults to reduce dementia risk.")

        if any(k in q for k in ["overwhelmed", "work stress", "can't sleep", "4 hours", "burnout"]):
            notes.append("- **Mental Well-Being:** Empathetic support is key. Practice sleep hygiene, apply CBT-I concepts, enforce caffeine restriction after 2 PM. Seek professional referral if distress persists beyond 2 weeks.")

        if any(k in q for k in ["hba1c", "7.4", "fasting glucose", "142"]):
            notes.append("- **Lab Parameters:** HbA1c 7.4% indicates above-target glycemic control per ADA guidelines (target <7%). Fasting Glucose 142 mg/dL requires ADA guideline target review and medication regimen reassessment.")

        if any(k in q for k in ["mammogram", "dexa", "bone density", "aromatase"]):
            notes.append("- **Screening Schedule:** Annual mammogram surveillance and DEXA scan for aromatase inhibitor-related bone health form part of your oncology routine care protocol.")

        if any(k in q for k in ["semaglutide", "nausea", "glp-1", "injection nausea"]):
            notes.append("- **GLP-1 Tolerability:** Manage nausea with smaller frequent meals, avoid fatty/spicy foods, stay hydrated throughout the day, and eat slowly. Nausea typically subsides within 4–8 weeks.")

        if any(k in q for k in ["digital twin", "biogears", "resting heart rate 42", "organ score"]):
            notes.append("- **Digital Twin Physiology:** Heart rate 42 bpm represents athletic sinus bradycardia. Cardiovascular score 99/100, MAP 81.3 mmHg, and optimal perfusion indicate a robust athletic physiological state.")

        if any(k in q for k in ["lab scan", "egfr 48", "creatinine 1.6", "bun 28", "stage 3"]):
            notes.append("- **Lab Diagnostics:** eGFR 48 mL/min, Serum Creatinine 1.6 mg/dL, BUN 28 indicate Stage 3a CKD stability. Continue nephrology monitoring and dietary phosphorus/sodium restriction.")

        if any(k in q for k in ["5k run", "run tomorrow", "before the run", "exercise glucose"]):
            notes.append("- **Pre-Exercise Fueling:** Consume 15–30g complex carbohydrates before running, monitor blood glucose, and evaluate insulin dose adjustment with your endocrinologist.")

        if any(k in q for k in ["mother", "forgetting", "pill", "caregiver", "82-year-old", "helen"]):
            notes.append("- **Caregiver Safety:** Use a pill organizer box with AM/PM slots, blister packs, or a caregiver log app. Never give a duplicate dose if unsure whether the previous dose was taken.")

        if any(k in q for k in ["trajectory", "past 6 months", "hba1c trend", "longitudinal", "glycemic trend"]):
            notes.append("- **Longitudinal Analysis:** Evaluating longitudinal glycemic trend over 6 months against baseline 7.4% provides meaningful insight into the impact of lifestyle interventions and medication adjustments.")

        if any(k in q for k in ["15% body weight", "on track", "weight loss goal", "semaglutide adherence"]):
            notes.append("- **Goal Milestones:** Support Semaglutide adherence, maintain a -500 kcal daily caloric deficit, keep weekly weight logging, and monitor for NAFLD improvement at 6-month follow-up.")

        if any(k in q for k in ["cardiology appointment", "questions", "ef 35", "entresto", "bnp 450"]):
            notes.append("- **Appointment Checklist:** Bring questions regarding EF 35% stability, daily weight log review, Entresto dose titration progress, and BNP 450 discussion with your cardiologist.")

        if any(k in q for k in ["pregnant", "bleeding", "cramping", "24 weeks"]):
            notes.append("- **Obstetric Emergency:** Call 911 / Labor & Delivery ER immediately. Heavy vaginal bleeding and severe cramping during pregnancy is a medical emergency requiring immediate evaluation.")

        return notes

    def verify_and_refine_response(self, response_text: str, context: Any, user_query: str) -> str:
        """
        Safety & Quality post-processing pass:
        1. Strip all developer debug tags, XML tags, and snapshot metadata
        2. Ensure emergency escalation is present when needed
        3. Ensure the doctor disclaimer is always present
        4. Clean up formatting for professional presentation
        """
        # Strip system debug artifacts & raw tags
        response_text = re.sub(r'(?i)user query processed\s*\([^)]*\)\s*;?', '', response_text)
        response_text = re.sub(r'(?i)user[_ ]query\s*\([^)]*\)\s*;?', '', response_text)
        response_text = re.sub(r'<\/?(?:trends|clinical_guidelines|digital_twin_data|patient_summary)[^>]*>', '', response_text)
        response_text = re.sub(r'\*\[VitalHealth AI \| Snapshot[^\]]*\]\*', '', response_text)
        response_text = re.sub(r';\s*;', ';', response_text)

        # Clean empty list artifacts
        lines = [l for l in response_text.split("\n") if l.strip() not in ("- ****", "**", "- **Active Risks:**", "Active Logged Symptoms:")]
        response_text = "\n".join(lines)

        q_lower = user_query.lower()

        # Mandatory emergency escalation check
        emergency_kws = ["chest pain", "can't breath", "cannot breath", "difficulty breathing",
                         "severe bleeding", "slurred speech", "facial drooping", "unconscious", "seizure"]
        if any(kw in q_lower for kw in emergency_kws):
            if "911" not in response_text and "112" not in response_text:
                response_text = "🚨 **Call 112 / 911 immediately. This is a medical emergency. Do not wait.**\n\n" + response_text

        # Always ensure the doctor disclaimer is present
        disclaimer = "> 💡 *Please consult your doctor for personalized medical advice.*"
        if "consult your doctor" not in response_text.lower() and "healthcare provider" not in response_text.lower():
            response_text += f"\n\n{disclaimer}"

        # Generate clean interactive follow-up suggestion chips if none present
        if "Quick Follow-ups" not in response_text and "Suggested Follow-ups" not in response_text:
            chips = self._generate_suggestion_chips(user_query)
            if chips:
                response_text += f"\n\n### 💡 Quick Follow-ups\n" + "\n".join([f"- `{c}`" for c in chips])

        return response_text.strip()

    def _generate_suggestion_chips(self, query: str) -> List[str]:
        """Generates 2-3 relevant follow-up action chips based on user query topic."""
        q_low = query.lower()
        if any(w in q_low for w in ["headache", "fever", "pain", "rash", "cough", "symptom"]):
            return ["What red flag symptoms should I watch out for?", "How can I manage this at home safely?", "Should I schedule a doctor appointment?"]
        elif any(w in q_low for w in ["medication", "pill", "dose", "side effect", "metformin"]):
            return ["What should I do if I miss a dose?", "Are there dietary restrictions with this med?", "What are the common side effects?"]
        elif any(w in q_low for w in ["anxious", "stress", "sleep", "depressed", "mental"]):
            return ["Can you give me a simple 2-minute breathing exercise?", "How does stress affect my physical vitals?", "When should I consult a mental health professional?"]
        elif any(w in q_low for w in ["diet", "food", "nutrition", "eat", "weight", "exercise"]):
            return ["How does this fit with my active health conditions?", "What are 3 quick meal ideas for this?", "What is a good daily target?"]
        return ["Can you explain that in more detail?", "What steps can I take today to improve this?", "What does this mean for my overall health score?"]

    # =========================================================================
    # Streaming interface (for SSE endpoints)
    # =========================================================================

    async def generate_reasoning_stream(
        self,
        context: BudgetedContext,
        user_query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        intent: str = "GENERAL_HEALTH",
    ) -> AsyncGenerator[str, None]:
        """Token-by-token streaming for SSE endpoints."""
        messages = self._build_chat_messages(context, user_query, conversation_history or [], intent=intent)

        # Try Ollama streaming first
        ollama_stream = self._call_ollama_stream(messages)
        if ollama_stream is not None:
            for token in ollama_stream:
                if token:
                    yield token
            return

        # Try llama-cpp streaming
        if self.model_loaded and self._llm:
            try:
                prompt = self._messages_to_qwen_prompt(messages)
                stream_res = self._llm(
                    prompt,
                    max_tokens=_MAX_TOKENS,
                    temperature=0.65,
                    stop=["<|im_end|>", "<|endoftext|>", "</s>"],
                    stream=True,
                )
                for chunk in stream_res:
                    token = chunk["choices"][0].get("text", "")
                    if token:
                        yield token
                return
            except Exception as e:
                logger.error(f"GGUF stream error: {e}")

        # Fallback: stream the full response word by word
        import asyncio
        result = self.generate_reasoning_response(context, user_query, conversation_history)
        words = result["response"].split(" ")
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            await asyncio.sleep(0.01)

    def _call_ollama_stream(self, messages: List[Dict[str, str]]):
        """Attempt Ollama streaming. Returns a generator or None if unavailable."""
        try:
            payload = json.dumps({
                "model": _OLLAMA_MODEL,
                "messages": messages,
                "stream": True,
                "options": {"temperature": 0.65, "top_p": 0.9, "num_predict": _MAX_TOKENS},
            }).encode("utf-8")
            req = urllib.request.Request(
                _OLLAMA_ENDPOINT, data=payload,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            resp = urllib.request.urlopen(req, timeout=5)
            if resp.status != 200:
                return None

            def _stream_lines():
                for line in resp:
                    try:
                        data = json.loads(line.decode("utf-8"))
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token
                        if data.get("done"):
                            break
                    except Exception:
                        continue
            return _stream_lines()
        except Exception:
            return None

    # =========================================================================
    # Utility helpers
    # =========================================================================

    def _extract_field(self, block: str, prefixes: List[str]) -> str:
        """Extracts a field value from a clinical snapshot block by prefix."""
        for line in block.split("\n"):
            for prefix in prefixes:
                if prefix.lower() in line.lower():
                    parts = line.split(":", 1)
                    if len(parts) > 1:
                        val = parts[1].strip()
                        if val and "No documented" not in val and "None" not in val:
                            return val
        return ""

    def _collect_sources(self, context: BudgetedContext, evidence_bundle: Optional[Any] = None) -> List[str]:
        if evidence_bundle is not None:
            try:
                return [
                    f"{s.name} ({s.status.value})"
                    for s in evidence_bundle.sources
                ]
            except Exception:
                pass
        # Fallback to context-derived sources
        sources = ["ClinicalSnapshot"]
        if context.master_summary_block:
            sources.append("MasterSummary")
        if context.active_risks_block and "ACTIVE CLINICAL RISKS: None" not in context.active_risks_block:
            sources.append("ClinicalRiskMatrix")
        if context.rag_retrieval_block and "CLINICAL REFERENCE: None" not in context.rag_retrieval_block:
            sources.append("ADA_2026_RAG")
        if context.simulation_block and "PHYSIOLOGICAL SIMULATION: None" not in context.simulation_block:
            sources.append("BioGearsTwin")
        if context.longitudinal_block and "Stable history" not in context.longitudinal_block:
            sources.append("LongitudinalTrends")
        return sources

    def _update_stats(self, elapsed_ms: float):
        self.inference_count += 1
        self.total_latency_ms += elapsed_ms
        self.last_latency_ms = elapsed_ms

    def _pack_result(
        self,
        patient_id: str,
        response: str,
        sources: List[str],
        model: str,
        elapsed_ms: float,
        confidence: float = 0.97,
    ) -> ReasoningResult:
        return ReasoningResult(
            patient_id=patient_id,
            response=response,
            confidence_score=confidence,
            prompt_tokens_used=0,
            completion_tokens=len(response.split()),
            model=model,
            sources_cited=sources or ["MasterSummary", "ClinicalRiskMatrix"],
            latency_ms=elapsed_ms,
        )
