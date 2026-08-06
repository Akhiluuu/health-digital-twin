"""
healthbot_v4/apps/brain/reasoning/llm_router.py
Dual-Tier Model & Intent Router for VitalHealth v5.0 Health Brain.
Routes patient queries between Tier 1 (Fast 8B / Triage) and Tier 2 (Deep Clinical Reasoning 32B / DeepSeek-R1).
"""

from enum import Enum
from typing import Dict, Any, List
from pydantic import BaseModel
from healthbot_v4.shared.logger.logger import logger


class ModelTier(str, Enum):
    TIER_1_FAST = "tier_1_fast"          # 7B/8B model for simple vitals & quick check-ins
    TIER_2_DEEP_CLINICAL = "tier_2_deep" # 32B/70B/DeepSeek-R1 for complex differential diagnosis


class RoutingDecision(BaseModel):
    query: str
    target_tier: ModelTier
    intent_category: str
    requires_biogears_sim: bool = False
    requires_drug_check: bool = False
    confidence: float = 0.95


class LLMRouter:
    """Intelligent Dual-Tier Model Router."""

    COMPLEX_CLINICAL_KEYWORDS = [
        "differential", "diagnosis", "interaction", "polypharmacy", "stage 3", "ckd",
        "hba1c", "biogears", "simulation", "organ score", "chemotherapy", "aromatase",
        "apixaban", "lisinopril", "nsaid", "kidney", "nephrology", "cardiology"
    ]

    BIOGEARS_KEYWORDS = [
        "biogears", "digital twin", "cardiac output", "mean arterial pressure",
        "map", "stroke volume", "organ status", "simulate"
    ]

    DRUG_KEYWORDS = [
        "medication", "drug", "interaction", "side effect", "nsaid", "ibuprofen",
        "apixaban", "lisinopril", "semaglutide", "metformin"
    ]

    def route_query(self, user_query: str) -> RoutingDecision:
        q_lower = user_query.lower()

        is_biogears = any(kw in q_lower for kw in self.BIOGEARS_KEYWORDS)
        is_drug = any(kw in q_lower for kw in self.DRUG_KEYWORDS)
        is_complex = any(kw in q_lower for kw in self.COMPLEX_CLINICAL_KEYWORDS) or len(user_query.split()) > 15

        if is_complex or is_biogears or is_drug:
            target_tier = ModelTier.TIER_2_DEEP_CLINICAL
            intent_category = "complex_clinical_reasoning"
        else:
            target_tier = ModelTier.TIER_1_FAST
            intent_category = "triage_and_vitals_summary"

        logger.info(f"🧠 LLMRouter decision: '{user_query[:30]}...' -> {target_tier.value} ({intent_category})")

        return RoutingDecision(
            query=user_query,
            target_tier=target_tier,
            intent_category=intent_category,
            requires_biogears_sim=is_biogears,
            requires_drug_check=is_drug,
        )
