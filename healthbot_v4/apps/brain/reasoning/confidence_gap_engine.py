"""
healthbot_v4/apps/brain/reasoning/confidence_gap_engine.py

Explainable Confidence Scoring and Gap Detection Engine for PHOS.
Computes coverage, agreement, freshness, and simulation consistency metrics.
Detects missing clinical data gaps and assigns impact ratings.
"""

from typing import Any, Dict, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.evidence.evidence_bundle import EvidenceBundle, SourceStatus
from healthbot_v4.shared.logger.logger import logger


class MissingDataItem(BaseModel):
    data: str
    since: str = "none"
    impact: str = "Moderate"   # High, Moderate, Low

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "data": self.data,
            "since": self.since,
            "impact": self.impact,
        }


class ConfidenceAnalysis(BaseModel):
    overall_confidence: float
    confidence_label: str       # High, Moderate, Low
    coverage_score: float
    agreement_score: float
    freshness_score: float
    explanation: str
    missing_gaps: List[MissingDataItem] = Field(default_factory=list)

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "overall_confidence": round(self.overall_confidence, 2),
            "confidence_label": self.confidence_label,
            "coverage_score": round(self.coverage_score, 2),
            "agreement_score": round(self.agreement_score, 2),
            "freshness_score": round(self.freshness_score, 2),
            "explanation": self.explanation,
            "missing_gaps": [m.to_json_contract() for m in self.missing_gaps],
        }


class ConfidenceAndGapEngine:
    """
    Computes explainable confidence scores and identifies missing data gaps.
    """

    def analyze(self, bundle: EvidenceBundle) -> ConfidenceAnalysis:
        total_sources = len(bundle.sources)
        available_sources = [s for s in bundle.sources if s.status == SourceStatus.available]
        
        # 1. Coverage score
        coverage = len(available_sources) / max(1, total_sources)

        # 2. Agreement score (conflicts penalize agreement)
        conflict_count = len(bundle.conflicts)
        agreement = max(0.2, 1.0 - (conflict_count * 0.25))

        # 3. Freshness score
        freshness = 0.90 if any(s.last_updated not in ["Never", "Unknown"] for s in available_sources) else 0.60

        # Overall weighted confidence score
        overall = round((coverage * 0.40) + (agreement * 0.35) + (freshness * 0.25), 2)
        label = "High" if overall >= 0.80 else "Moderate" if overall >= 0.55 else "Low"

        # Missing data gaps detection
        missing_gaps: List[MissingDataItem] = []
        for src in bundle.sources:
            if src.status != SourceStatus.available:
                impact = "High" if src.source_type in ["medical_records", "biogears_twin", "vitals_history"] else "Moderate"
                missing_gaps.append(MissingDataItem(
                    data=src.name,
                    since="none",
                    impact=impact
                ))

        explanation = (
            f"Overall Confidence: {label} ({int(overall * 100)}%). "
            f"Coverage: {int(coverage * 100)}% ({len(available_sources)}/{total_sources} sources available). "
            f"Agreement: {int(agreement * 100)}% ({conflict_count} conflicts). "
        )
        if missing_gaps:
            explanation += f"Identified {len(missing_gaps)} missing data gaps."

        logger.info(f"📊 Calculated Confidence: {label} ({overall * 100:.0f}%), {len(missing_gaps)} gaps")
        return ConfidenceAnalysis(
            overall_confidence=overall,
            confidence_label=label,
            coverage_score=coverage,
            agreement_score=agreement,
            freshness_score=freshness,
            explanation=explanation,
            missing_gaps=missing_gaps,
        )
