"""
healthbot_v4/apps/brain/guardrails/safety_router.py
Sub-2ms Pre-Guardrail Emergency Router for VitalHealth v5.0 Health Brain.
Executes instantaneous red-flag emergency triage before running state retrieval, RAG, or twin simulations.
"""

import time
import re
from typing import Optional, Dict, Any, Tuple, List
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class EmergencySafetyRouter(HealthBrainSubsystem):
    """
    Sub-2ms Emergency Pre-Guardrail Router.
    Evaluates acute emergency indicators and returns immediate clinical triage.
    """

    def __init__(self):
        super().__init__("emergency_safety_router")
        self.triages_triggered: int = 0
        self._compiled_regexes = self._compile_emergency_patterns()

    async def initialize(self) -> None:
        logger.info("🚨 Emergency Pre-Guardrail Safety Router initialized (<2ms Triage Guarantee)")

    def _compile_emergency_patterns(self) -> List[Tuple[str, re.Pattern]]:
        """Compiles regex patterns for high-priority emergency categories."""
        patterns = [
            (
                "CARDIAC",
                re.compile(r"\b(chest\s+pain|crushing\s+chest|pain\s+radiating\s+to\s+arm|heart\s+attack|cardiac\s+arrest)\b", re.IGNORECASE)
            ),
            (
                "RESPIRATORY",
                re.compile(r"\b(can['\u2019]?t\s+breath|cannot\s+breathe|difficulty\s+breathing|severe\s+shortness\s+of\s+breath|choking|asphyxiat)\b", re.IGNORECASE)
            ),
            (
                "NEUROLOGICAL",
                re.compile(r"\b(facial\s+droop|arm\s+weakness|slurred\s+speech|stroke|sudden\s+numbness|unconscious|fainted|seizure)\b", re.IGNORECASE)
            ),
            (
                "CRISIS_OR_HEMORRHAGE",
                re.compile(r"\b(severe\s+bleeding|hemorrhage|suicid|self[- ]harm|overdose|poisoning)\b", re.IGNORECASE)
            ),
        ]
        return patterns

    def evaluate_query(self, query: str) -> Tuple[bool, Optional[str], float]:
        """
        Evaluates query for acute red flag emergency symptoms.
        Returns:
            Tuple[is_emergency: bool, triage_response: Optional[str], execution_time_ms: float]
        """
        start = time.time()
        q_clean = query.strip()

        for category, pattern in self._compiled_regexes:
            if pattern.search(q_clean):
                elapsed_ms = (time.time() - start) * 1000.0
                self.triages_triggered += 1
                logger.warning(f"🚨 Pre-Guardrail EMERGENCY Triggered [{category}] in {elapsed_ms:.2f}ms for: '{query}'")
                
                triage_response = (
                    "### 🚨 EMERGENCY WARNING — Immediate Medical Action Required\n\n"
                    "Your description indicates **acute red flag symptoms** requiring immediate emergency medical evaluation.\n\n"
                    "### 🎯 Action Plan:\n"
                    "1. **Call 112 / 911 immediately** or have someone drive you to the nearest Emergency Room.\n"
                    "2. **Do not drive yourself** if experiencing chest pain, severe shortness of breath, dizziness, or weakness.\n"
                    "3. Stay calm and stay on the line with emergency dispatchers until help arrives.\n\n"
                    "> 💡 *VitalHealth Safety Guardrail | Immediate Emergency Escalation Rule*"
                )
                return True, triage_response, elapsed_ms

        elapsed_ms = (time.time() - start) * 1000.0
        return False, None, elapsed_ms

    def get_stats(self) -> Dict[str, Any]:
        """Returns safety router metrics."""
        return {
            "triages_triggered": self.triages_triggered,
            "latency_max_allowed_ms": 2.0,
            "status": "ACTIVE_GUARDRAIL"
        }
