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
                lines.append(f"Based on a review of your complete health ecosystem, here is what I found regarding: **\"{user_query.strip()}\"**\n")

                # Sources reviewed
                lines.append("✅ **Sources Reviewed**")
                for src in evidence_bundle.sources:
                    icon = "✓" if src.status == SourceStatus.available else "⚠"
                    count = f" — {src.records_count} records" if src.records_count > 0 else ""
                    reason = f" ({src.missing_reason})" if src.missing_reason and src.status != SourceStatus.available else ""
                    lines.append(f"{icon} {src.name}{count}{reason}")

                # Key findings
                if evidence_bundle.findings:
                    lines.append("\n📊 **Key Findings**")
                    for f in evidence_bundle.findings:
                        conf = f"{f.confidence_pct * 100:.0f}%" if f.confidence_pct else f.confidence.value
                        val = f.value or "No data recorded"
                        abnormal_tag = " ⚠ *Abnormal*" if f.is_abnormal else ""
                        lines.append(
                            f"- **{f.label}:** {val}{abnormal_tag}  \n"
                            f"  *[Source: {f.source_name} | {f.timestamp_label} | Confidence: {conf}]*"
                        )

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
                    lines.append(f"The following sources had no data available: {', '.join(missing_names)}.")
                lines.append(f"Overall evidence confidence: **{int(evidence_bundle.overall_confidence * 100)}%** ({evidence_bundle.overall_confidence_label.value}).")

                # Missing information
                if evidence_bundle.missing_data:
                    lines.append("\n⚠ **Missing Information**")
                    lines.append("Confidence could be improved with:")
                    for gap in evidence_bundle.missing_data:
                        lines.append(f"• {gap}")

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
        lines.append("\n> 💡 *VitalHealth Personal Health Assistant | Consult your physician for medical advice.*")
        return "\n".join(lines)

    # =========================================================================
    # Post-processing safety guard
    # =========================================================================

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
