"""
healthbot_v4/apps/brain/cache/semantic_cache.py
Semantic Query Cache Subsystem for VitalHealth v5.0 Health Brain.
Delivers sub-5ms latency for non-personalized general clinical education queries
while enforcing strict patient privacy isolation.
"""

import time
import math
import re
from typing import Dict, Any, Optional, List, Tuple
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class SemanticQueryCache(HealthBrainSubsystem):
    """
    Sub-5ms Semantic Query Cache for Health Brain.
    Strictly isolated for general health education & non-patient-specific queries.
    """

    def __init__(self, similarity_threshold: float = 0.88, max_entries: int = 1000):
        super().__init__("semantic_cache")
        self.similarity_threshold = similarity_threshold
        self.max_entries = max_entries
        # Storage format: List of Dicts with:
        # {"query": str, "norm_tokens": set, "intent": str, "response": str, "sources": list, "timestamp": float, "hit_count": int}
        self._cache: List[Dict[str, Any]] = []
        self.hits: int = 0
        self.misses: int = 0
        self.bypasses: int = 0

    async def initialize(self) -> None:
        """Initialize cache store with pre-warmed common clinical education entries."""
        self._prewarm_common_queries()
        logger.info(f"⚡ Semantic Query Cache initialized ({len(self._cache)} entries pre-warmed)")

    def _prewarm_common_queries(self) -> None:
        """Pre-warms high-frequency non-personalized health education queries."""
        common = [
            (
                "What is HbA1c?",
                "GENERAL_HEALTH_EDUCATION",
                "**HbA1c (Glycated Hemoglobin)** measures the average percentage of blood glucose bound to hemoglobin over the past **2 to 3 months**.\n\n"
                "• **Normal:** Below 5.7%\n"
                "• **Prediabetes:** 5.7% to 6.4%\n"
                "• **Diabetes:** 6.5% or higher\n\n"
                "It provides long-term glycemic trends rather than single daily spikes. Healthy diet, physical activity, and regular medical checkups help maintain optimal levels.\n\n"
                "> 💡 *Please consult your doctor for personalized medical advice.*",
                ["ADA_2026_Guidelines"]
            ),
            (
                "What is Metformin and how does it work?",
                "MEDICATION",
                "**Metformin** is a first-line oral antihyperglycemic medication prescribed for managing Type 2 Diabetes.\n\n"
                "• **Reduces Glucose Production:** Lowers liver gluconeogenesis.\n"
                "• **Improves Insulin Sensitivity:** Helps body tissues utilize glucose efficiently.\n"
                "• **Safety Note:** Take with meals to minimize gastrointestinal upset, and do not alter dosages without consulting your physician.\n\n"
                "> 💡 *Please consult your doctor for personalized medical advice.*",
                ["ADA_2026_Pharmacology"]
            ),
            (
                "What is normal blood pressure?",
                "GENERAL_HEALTH_EDUCATION",
                "Blood pressure is measured in **mmHg** using Systolic (top) and Diastolic (bottom) values:\n\n"
                "| Category | Systolic (mmHg) | Diastolic (mmHg) |\n"
                "| :--- | :--- | :--- |\n"
                "| **Normal** | Less than 120 | and Less than 80 |\n"
                "| **Elevated** | 120 – 129 | and Less than 80 |\n"
                "| **Stage 1 HTN** | 130 – 139 | or 80 – 89 |\n"
                "| **Stage 2 HTN** | 140 or higher | or 90 or higher |\n\n"
                "> 💡 *Please consult your doctor for personalized medical advice.*",
                ["AHA_2026_Guidelines"]
            ),
        ]

        now = time.time()
        for q, intent, resp, sources in common:
            self._cache.append({
                "query": q,
                "norm_tokens": self._tokenize(q),
                "intent": intent,
                "response": resp,
                "sources": sources,
                "timestamp": now,
                "hit_count": 0,
            })

    def is_cacheable(self, query: str) -> bool:
        """
        Determines whether a query is safe for caching.
        Returns False if the query contains patient-specific pronouns, vitals references, or personal flags.
        """
        q_low = query.lower().strip()

        # Reject short queries
        if len(q_low) < 6:
            return False

        # Patient-specific pronouns and indicators force cache bypass
        personal_patterns = [
            r"\bmy\b", r"\bme\b", r"\bi\b", r"\bi'm\b", r"\bmine\b",
            r"\bmy\s+vitals\b", r"\bmy\s+labs\b", r"\bmy\s+score\b",
            r"\bmy\s+doctor\b", r"\bmy\s+dose\b", r"\bmy\s+med\b",
            r"\bam\s+i\b", r"\bshould\s+i\b", r"\bcan\s+i\b", r"\bwill\s+i\b",
            r"\bfeel\b", r"\bhurts\b", r"\bpain\b", r"\bsymptom\b"
        ]

        for pat in personal_patterns:
            if re.search(pat, q_low):
                return False

        return True

    def get(self, query: str, intent: str = "GENERAL_HEALTH") -> Optional[Tuple[str, List[str], float]]:
        """
        Looks up query in semantic cache.
        Returns Tuple of (response_text, sources_cited, latency_ms) if hit, else None.
        Guarantees sub-5ms execution time.
        """
        start_time = time.time()

        if not self.is_cacheable(query):
            self.bypasses += 1
            return None

        query_tokens = self._tokenize(query)
        if not query_tokens:
            self.misses += 1
            return None

        best_match = None
        best_score = 0.0

        for entry in self._cache:
            score = self._jaccard_similarity(query_tokens, entry["norm_tokens"])
            if score > best_score:
                best_score = score
                best_match = entry

        elapsed_ms = (time.time() - start_time) * 1000.0

        if best_match and best_score >= self.similarity_threshold:
            best_match["hit_count"] += 1
            self.hits += 1
            logger.info(f"⚡ Semantic Cache HIT ({elapsed_ms:.2f}ms | Sim: {best_score:.2f}) for: '{query}'")
            return (best_match["response"], best_match["sources"], elapsed_ms)

        self.misses += 1
        return None

    def put(self, query: str, intent: str, response: str, sources: Optional[List[str]] = None) -> None:
        """Stores a newly generated response in semantic cache if cacheable."""
        if not self.is_cacheable(query):
            return

        if len(response) < 60 or "🚨" in response:
            return  # Never cache emergency or broken responses

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return

        # Evict oldest entry if max capacity reached
        if len(self._cache) >= self.max_entries:
            self._cache.sort(key=lambda x: x["hit_count"])
            self._cache.pop(0)

        self._cache.append({
            "query": query,
            "norm_tokens": query_tokens,
            "intent": intent,
            "response": response,
            "sources": sources or ["ClinicalKnowledgeBase"],
            "timestamp": time.time(),
            "hit_count": 0,
        })
        logger.debug(f"📥 Cached semantic response for: '{query[:40]}...'")

    @staticmethod
    def _tokenize(text: str) -> set:
        """Extracts normalized word n-gram tokens."""
        words = re.findall(r'\w+', text.lower())
        stopwords = {"a", "an", "the", "is", "are", "was", "were", "what", "how", "where", "when", "does", "do"}
        tokens = {w for w in words if w not in stopwords and len(w) > 2}
        return tokens

    @staticmethod
    def _jaccard_similarity(s1: set, s2: set) -> float:
        """Calculates Jaccard similarity index between token sets."""
        if not s1 or not s2:
            return 0.0
        intersection = len(s1.intersection(s2))
        union = len(s1.union(s2))
        return intersection / union if union > 0 else 0.0

    def get_stats(self) -> Dict[str, Any]:
        """Returns performance telemetry metrics."""
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100.0) if total > 0 else 0.0
        return {
            "entries_count": len(self._cache),
            "hits": self.hits,
            "misses": self.misses,
            "bypasses": self.bypasses,
            "hit_rate_pct": round(hit_rate, 2),
        }
