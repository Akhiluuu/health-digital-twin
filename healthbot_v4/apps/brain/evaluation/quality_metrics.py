"""
VitalHealth AI Quality Improvement Program — Quality Metrics Engine
Defines dataclasses and calculation formulas for 17 Quality Dimensions, Personalization Score, Clinical Depth Score, and Overall Score.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class QualityMetrics:
    intent_detection_accuracy: float = 1.0       # 0.0 - 1.0
    clinical_reasoning: float = 1.0              # 0.0 - 1.0
    retrieved_info_usage: float = 1.0            # 0.0 - 1.0
    personalization_score: float = 1.0           # 0.0 - 1.0
    medication_correctness: float = 1.0          # 0.0 - 1.0
    lab_interpretation_accuracy: float = 1.0     # 0.0 - 1.0
    safety_score: float = 1.0                    # 0.0 - 1.0
    emergency_handling_score: float = 1.0        # 0.0 - 1.0
    explanation_quality: float = 1.0             # 0.0 - 1.0
    hallucination_rate: float = 0.0              # 0.0 - 1.0 (Lower is better)
    answer_completeness: float = 1.0             # 0.0 - 1.0
    context_usage_efficiency: float = 1.0        # 0.0 - 1.0
    memory_usage_accuracy: float = 1.0           # 0.0 - 1.0
    tone_empathy: float = 1.0                    # 0.0 - 1.0
    readability_clarity: float = 1.0             # 0.0 - 1.0
    clinical_usefulness: float = 1.0             # 0.0 - 1.0
    follow_up_appropriateness: float = 1.0       # 0.0 - 1.0
    clinical_depth_score: float = 1.0            # 0.0 - 1.0
    overall_ai_score: float = 1.0                # 0.0 - 1.0

@dataclass
class PersonalizationBreakdown:
    age_referenced: bool = False
    gender_referenced: bool = False
    conditions_referenced: bool = False
    medications_referenced: bool = False
    labs_referenced: bool = False
    vitals_referenced: bool = False
    twin_referenced: bool = False
    memory_referenced: bool = False
    goals_referenced: bool = False
    lifestyle_referenced: bool = False
    family_history_referenced: bool = False
    score: float = 1.0

@dataclass
class ClinicalDepthBreakdown:
    medical_correctness: float = 1.0
    clinical_completeness: float = 1.0
    evidence_base: float = 1.0
    reasoning_depth: float = 1.0
    explanation_quality: float = 1.0
    decision_support: float = 1.0
    actionability: float = 1.0
    risk_explanation: float = 1.0
    differential_diagnosis: float = 1.0
    follow_up_suggestions: float = 1.0
    score: float = 1.0
