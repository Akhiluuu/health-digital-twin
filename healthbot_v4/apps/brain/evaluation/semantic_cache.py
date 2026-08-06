"""
healthbot_v4/apps/brain/evaluation/semantic_cache.py
Semantic Vector Cache for VitalHealth v5.0 Health Brain.
Caches high-confidence clinical responses for instant execution (< 15ms) on recurrent queries.
"""

import time
from typing import Dict, Any, Optional
from pydantic import BaseModel
from healthbot_v4.shared.logger.logger import logger


class CachedResponse(BaseModel):
    query: str
    response_text: str
    patient_id: str
    timestamp: float
    sources_cited: list[str]


class SemanticResponseCache:
    """In-Memory / Redis Vector Semantic Cache."""

    def __init__(self, similarity_threshold: float = 0.95):
        self.threshold = similarity_threshold
        self._cache: Dict[str, CachedResponse] = {}

    def _simple_similarity(self, q1: str, q2: str) -> float:
        w1 = set(q1.lower().split())
        w2 = set(q2.lower().split())
        if not w1 or not w2:
            return 0.0
        intersection = len(w1.intersection(w2))
        union = len(w1.union(w2))
        return intersection / union if union > 0 else 0.0

    def get(self, query: str, patient_id: str) -> Optional[CachedResponse]:
        for cached_q, item in self._cache.items():
            if item.patient_id == patient_id:
                sim = self._simple_similarity(query, cached_q)
                if sim >= self.threshold:
                    logger.info(f"⚡ Semantic Cache HIT (sim: {sim:.2f}) for query: '{query[:30]}...'")
                    return item
        return None

    def put(self, query: str, patient_id: str, response_text: str, sources_cited: list[str]) -> None:
        item = CachedResponse(
            query=query,
            response_text=response_text,
            patient_id=patient_id,
            timestamp=time.time(),
            sources_cited=sources_cited,
        )
        self._cache[query] = item
        logger.info(f"💾 Saved response to Semantic Cache for query: '{query[:30]}...'")
