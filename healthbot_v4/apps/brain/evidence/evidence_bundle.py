"""
healthbot_v4/apps/brain/evidence/evidence_bundle.py

Evidence Bundle data models for the VitalHealth Evidence-Based
Personal Health Intelligence System (PHIS).

The Orchestration & Tool Manager (OTM) builds an EvidenceBundle by
collecting structured findings from every relevant health module.
The LLM reasons ONLY over this bundle — never over raw database state.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SourceStatus(str, Enum):
    available  = "available"   # data was found for this source
    missing    = "missing"     # source exists but no data recorded yet
    unavailable = "unavailable" # source subsystem could not be reached


class ConfidenceLevel(str, Enum):
    high    = "High"
    medium  = "Medium"
    low     = "Low"
    unknown = "Unknown"


class TrendDirection(str, Enum):
    rising   = "↗ Rising"
    falling  = "↘ Falling"
    stable   = "→ Stable"
    unknown  = "? Unknown"


# ---------------------------------------------------------------------------
# Atomic finding — one discrete clinical fact with full provenance
# ---------------------------------------------------------------------------

class EvidenceFinding(BaseModel):
    """A single piece of clinical evidence with full source attribution."""

    finding_id: str                          # e.g. "heart_rate_avg"
    label: str                               # human label, e.g. "Average Resting Heart Rate"
    value: Optional[str] = None             # e.g. "67 bpm"
    source_name: str                         # e.g. "Vital History"
    source_type: str                         # e.g. "biogears_twin" | "vital_logs" | "lab_reports" | ...
    timestamp_label: str = "Unknown"         # e.g. "Last 30 days" | "Today 09:14"
    confidence: ConfidenceLevel = ConfidenceLevel.medium
    confidence_pct: Optional[float] = None  # e.g. 0.93
    trend: TrendDirection = TrendDirection.unknown
    is_abnormal: bool = False
    notes: Optional[str] = None             # clinical interpretation note
    raw_data: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_evidence_item(cls, item: Any) -> "EvidenceFinding":
        """Convert a PHOS EvidenceItem to an EvidenceFinding for backwards compatibility."""
        val_str = f"{item.value} {item.unit}".strip() if getattr(item, "unit", None) else str(item.value)
        return cls(
            finding_id=getattr(item, "itemId", "finding-item"),
            label=getattr(item, "notes", None) or getattr(item, "dataType", "Finding").replace("_", " ").title(),
            value=val_str,
            source_name=getattr(item, "source", "Unknown Source"),
            source_type=getattr(item, "dataType", "general"),
            timestamp_label=getattr(item, "timestamp", _utc_now()).strftime("%Y-%m-%d %H:%M UTC") if isinstance(getattr(item, "timestamp", None), datetime) else "Recent",
            confidence=ConfidenceLevel.high if getattr(item, "confidence", 0.9) >= 0.8 else ConfidenceLevel.medium,
            confidence_pct=getattr(item, "confidence", 0.85),
            is_abnormal=getattr(item, "is_abnormal", False),
            notes=getattr(item, "notes", None),
            raw_data=getattr(item, "raw_payload", {}),
        )


# ---------------------------------------------------------------------------
# Source summary — status of one entire data module
# ---------------------------------------------------------------------------

class EvidenceSource(BaseModel):
    """Summary of one health data module queried by the OTM."""

    name: str                               # e.g. "BioGears Digital Twin"
    source_type: str                        # internal key e.g. "biogears_twin"
    status: SourceStatus = SourceStatus.missing
    records_count: int = 0
    last_updated: str = "Never"
    confidence: ConfidenceLevel = ConfidenceLevel.unknown
    confidence_pct: Optional[float] = None
    findings: List[EvidenceFinding] = Field(default_factory=list)
    missing_reason: Optional[str] = None   # why data is absent


# ---------------------------------------------------------------------------
# Contradiction — a detected conflict between two sources
# ---------------------------------------------------------------------------

class EvidenceConflict(BaseModel):
    """Detected contradiction between two data sources."""

    metric: str
    source_a: str
    value_a: str
    source_b: str
    value_b: str
    possible_reasons: List[str] = Field(default_factory=list)
    recommendation: str = "Repeat measurement or reconcile sources."


# ---------------------------------------------------------------------------
# Full Evidence Bundle — passed to the LLM as the sole reasoning input
# ---------------------------------------------------------------------------

class EvidenceBundle(BaseModel):
    """
    Structured evidence collected by the OTM across all relevant health modules.
    The LLM receives only this bundle — it never queries raw data directly.
    """

    # Query context
    intent: str
    query: str
    bundle_timestamp: datetime = Field(default_factory=_utc_now)

    # Sources reviewed
    sources: List[EvidenceSource] = Field(default_factory=list)

    # All discrete findings aggregated across sources
    findings: List[EvidenceFinding] = Field(default_factory=list)

    # Detected contradictions between sources
    conflicts: List[EvidenceConflict] = Field(default_factory=list)

    # Explicit missing data gaps (for "⚠ Missing Information" section)
    missing_data: List[str] = Field(default_factory=list)

    # Overall confidence (weighted across sources)
    overall_confidence: float = 0.80
    overall_confidence_label: ConfidenceLevel = ConfidenceLevel.medium

    # ---------------------------------------------------------------------------
    # Serialization helpers
    # ---------------------------------------------------------------------------

    def to_prompt_block(self) -> str:
        """
        Render the bundle as a structured evidence block for injection
        into the LLM system prompt.
        """
        ts = self.bundle_timestamp.strftime("%Y-%m-%d %H:%M UTC")
        lines: List[str] = [
            "=== EVIDENCE BUNDLE ===",
            f"Intent: {self.intent}",
            f"Query: \"{self.query}\"",
            f"Bundle Generated: {ts}",
            f"Overall Confidence: {int(self.overall_confidence * 100)}% ({self.overall_confidence_label.value})",
            "",
            "SOURCES REVIEWED:",
        ]

        for src in self.sources:
            icon = "✓" if src.status == SourceStatus.available else "⚠"
            conf_str = f" | Confidence: {src.confidence_pct * 100:.0f}%" if src.confidence_pct else f" | Confidence: {src.confidence.value}"
            updated_str = f" | Last updated: {src.last_updated}" if src.last_updated and src.last_updated != "Never" else ""
            records_str = f" | {src.records_count} records" if src.records_count > 0 else ""
            missing_str = f" — {src.missing_reason}" if src.missing_reason and src.status != SourceStatus.available else ""
            lines.append(
                f"  [{src.status.value.upper():11s}] {icon} {src.name}{records_str}{updated_str}{conf_str}{missing_str}"
            )

        if self.findings:
            lines.append("")
            lines.append("KEY FINDINGS:")
            for f in self.findings:
                conf_tag = f"{f.confidence_pct * 100:.0f}%" if f.confidence_pct else f.confidence.value
                abnormal = " ⚠ ABNORMAL" if f.is_abnormal else ""
                trend_tag = f" {f.trend.value}" if f.trend != TrendDirection.unknown else ""
                notes_tag = f" — {f.notes}" if f.notes else ""
                val_str = f": {f.value}" if f.value else " — No data"
                lines.append(
                    f"  • {f.label}{val_str}{abnormal}{trend_tag}"
                    f" [Source: {f.source_name} | {f.timestamp_label} | Confidence: {conf_tag}]{notes_tag}"
                )

        if self.conflicts:
            lines.append("")
            lines.append("CONTRADICTIONS DETECTED:")
            for c in self.conflicts:
                lines.append(f"  ⚡ {c.metric}: {c.source_a} shows {c.value_a} BUT {c.source_b} shows {c.value_b}")
                if c.possible_reasons:
                    lines.append(f"     Possible reasons: {'; '.join(c.possible_reasons)}")
                lines.append(f"     Recommendation: {c.recommendation}")

        if self.missing_data:
            lines.append("")
            lines.append("MISSING DATA GAPS (be transparent about these in your response):")
            for gap in self.missing_data:
                lines.append(f"  ⚠ {gap}")

        lines.append("=== END EVIDENCE BUNDLE ===")
        return "\n".join(lines)

    def get_available_sources(self) -> List[EvidenceSource]:
        return [s for s in self.sources if s.status == SourceStatus.available]

    def get_missing_sources(self) -> List[EvidenceSource]:
        return [s for s in self.sources if s.status != SourceStatus.available]

    def get_findings_by_source(self, source_type: str) -> List[EvidenceFinding]:
        return [f for f in self.findings if f.source_type == source_type]

    def to_evidence_items(self) -> List[Any]:
        """Convert findings into EvidenceItem schema objects for PHKG correlation."""
        from healthbot_v4.shared.models.evidence_schema import EvidenceItem, ReliabilityLevel, TrendType
        items = []
        for f in self.findings:
            items.append(EvidenceItem(
                itemId=f.finding_id,
                source=f.source_name,
                dataType=f.source_type,
                value=f.value,
                unit=None,
                confidence=f.confidence_pct or 0.85,
                reliability=ReliabilityLevel.HIGH if f.confidence.value == "high" else ReliabilityLevel.MEDIUM,
                trend=TrendType.STABLE,
                loinc_code=None,
                snomed_code=None,
                is_abnormal=f.is_abnormal,
                notes=f.notes or f.label,
                raw_payload=f.raw_data,
            ))
        return items
