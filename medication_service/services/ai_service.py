"""
medication_service/services/ai_service.py
Dr. Aria AI assistant — clinical Q&A, adherence advice, drug education.
Integrates with the existing healthbot/BioGears LLM infrastructure.
"""
from __future__ import annotations
import os
import json
import logging
import httpx
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

AI_BASE = os.environ.get("SERVER_BASE_URL", "http://localhost:8000")
AI_API_KEY = os.environ.get("DIGITAL_TWIN_API_KEY", "")

SYSTEM_PROMPT = """You are Dr. Aria, a certified AI Clinical Companion embedded in the VitalHealth Digital Twin platform.
You provide evidence-based medication guidance to patients. You:
- Explain medications clearly without excessive jargon
- Give missed-dose advice per clinical guidelines
- Warn about drug-food-alcohol interactions with severity context
- Provide adherence motivation with empathy
- Always recommend consulting a physician for dosage changes
- Cite clinical references when possible
- Flag high-severity interactions as urgent warnings
Never diagnose. Never prescribe. Focus on education and safety."""

# In-memory conversation store (replace with Redis in production)
_conversations: Dict[str, List[Dict]] = {}


class AIService:
    @staticmethod
    async def chat(
        user_id: str,
        message: str,
        conversation_id: Optional[str],
        medicine_context: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        conv_id = conversation_id or str(uuid4())
        history = _conversations.get(conv_id, [])

        # Build context from active medicines
        patient_context = {
            "medicines": [],
            "activeSymptoms": [],
            "historySymptoms": []
        }
        if medicine_context:
            for m in medicine_context:
                patient_context["medicines"].append({
                    "name": m.get("name"),
                    "dose": m.get("dose") or m.get("strength"),
                    "type": m.get("type"),
                    "frequency": m.get("frequency"),
                    "time": m.get("time"),
                    "meal": m.get("meal")
                })

        formatted_history = []
        for h in history:
            role = "User" if h["role"] == "user" else "Dr. Aria"
            formatted_history.append(f"{role}: {h['content']}")

        history.append({"role": "user", "content": message})

        # Try BioGears AI generate endpoint
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{AI_BASE}/generate",
                    json={
                        "query": message,
                        "history": formatted_history,
                        "patient_context": patient_context
                    },
                    headers={"X-API-Key": AI_API_KEY},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    reply = data.get("response") or data.get("reply") or data.get("answer") or str(data)
                    history.append({"role": "assistant", "content": reply})
                    _conversations[conv_id] = history[-20:]  # keep last 20 turns
                    return {
                        "reply": reply,
                        "conversation_id": conv_id,
                        "clinical_citations": _extract_citations(reply),
                        "suggested_actions": _extract_actions(message),
                        "risk_flags": _detect_risks(message, medicine_context or []),
                    }
        except Exception as e:
            logger.warning(f"AI backend call failed: {e}")

        # Fallback: rule-based clinical responses
        reply = _rule_based_response(message, medicine_context or [])
        history.append({"role": "assistant", "content": reply})
        _conversations[conv_id] = history[-20:]

        return {
            "reply": reply,
            "conversation_id": conv_id,
            "clinical_citations": _extract_citations(reply),
            "suggested_actions": _extract_actions(message),
            "risk_flags": _detect_risks(message, medicine_context or []),
        }

    @staticmethod
    def clear_conversation(conversation_id: str) -> None:
        _conversations.pop(conversation_id, None)


def _rule_based_response(message: str, medicines: List[Dict]) -> str:
    msg = message.lower()
    med_names = [m.get("name", "") for m in medicines]

    if any(w in msg for w in ("miss", "forgot", "skip")):
        return (
            "If you missed a dose, take it as soon as you remember — unless it is almost time for your next dose. "
            "In that case, skip the missed dose and resume your regular schedule. "
            "Never double-dose. Log this event in your medication history so your Digital Twin can be recalibrated."
        )
    if any(w in msg for w in ("alcohol", "drink", "beer", "wine")):
        return (
            "⚠️ Alcohol can interact with several medications. "
            f"{'Metformin specifically combined with alcohol increases lactic acidosis risk. ' if any('metformin' in n.lower() for n in med_names) else ''}"
            "As a general rule, space alcohol at least 6 hours from any dose, and limit to 1 standard unit. "
            "Always consult your prescribing physician."
        )
    if any(w in msg for w in ("side effect", "reaction", "nausea", "vomit", "dizziness")):
        return (
            "Side effects vary by medication. Common GI symptoms (nausea, stomach upset) can often be reduced "
            "by taking medications with food. If symptoms are severe or persistent, contact your physician immediately. "
            "Log any reactions in VitalHealth so your clinical team can review them."
        )
    if any(w in msg for w in ("food", "eat", "meal", "grapefruit", "dairy")):
        return (
            "Food timing matters for medication absorption. "
            "Grapefruit juice inhibits CYP3A4 enzymes and can significantly increase blood levels of many drugs. "
            "Dairy can bind to certain antibiotics (tetracyclines, fluoroquinolones) and reduce absorption. "
            "Always follow the 'before/after food' instructions specific to each of your medications."
        )
    if any(w in msg for w in ("interact", "combination", "together")):
        return (
            "Drug interactions can be pharmacokinetic (affecting drug levels) or pharmacodynamic (combined effects). "
            f"Your current medications ({', '.join(med_names[:3]) if med_names else 'not listed'}) should be checked "
            "using the Interactions Checker in your Medication Vault for a complete clinical analysis."
        )
    return (
        "I'm Dr. Aria, your AI Clinical Companion. I can help you with medication questions, "
        "missed dose guidance, food/alcohol compatibility, and side effect information. "
        "Please ask me a specific question about your medications."
    )


def _extract_citations(text: str) -> List[str]:
    citations = []
    if "metformin" in text.lower():
        citations.append("ADA Standards of Medical Care in Diabetes — Pharmacologic Approaches to Glycemic Treatment")
    if "aspirin" in text.lower():
        citations.append("ACC/AHA Guideline on Primary Prevention of Cardiovascular Disease, 2019")
    if "lactic acidosis" in text.lower():
        citations.append("FDA Drug Safety Communication: Metformin and Lactic Acidosis Risk")
    return citations


def _extract_actions(message: str) -> List[str]:
    actions = []
    msg = message.lower()
    if "miss" in msg or "forgot" in msg:
        actions.append("Log missed dose in Medication History")
        actions.append("Set a backup reminder for next dose")
    if "refill" in msg or "running out" in msg:
        actions.append("Request refill from Inventory Manager")
    if "side effect" in msg:
        actions.append("Report reaction to your physician")
        actions.append("Log symptom event in Digital Twin")
    return actions


def _detect_risks(message: str, medicines: List[Dict]) -> List[str]:
    flags = []
    msg = message.lower()
    med_names_lower = [m.get("name", "").lower() for m in medicines]

    if "alcohol" in msg and any("metformin" in n for n in med_names_lower):
        flags.append("HIGH RISK: Alcohol + Metformin → lactic acidosis")
    if "ibuprofen" in msg and any("aspirin" in n for n in med_names_lower):
        flags.append("MODERATE: Ibuprofen + Aspirin → reduced cardioprotection")
    if "double" in msg and "dose" in msg:
        flags.append("CRITICAL: Do not double-dose — overdose risk")
    return flags
