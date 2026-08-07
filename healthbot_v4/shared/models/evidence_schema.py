"""
healthbot_v4/shared/models/evidence_schema.py

Standardized EvidenceItem schema and clinical metadata specifications for the
Personal Health Operating System (PHOS) Reasoning Engine.
Enforces HL7 FHIR / SNOMED / LOINC interoperability standards.
"""

from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReliabilityLevel(str, Enum):
    HIGH = "high"       # Clinical lab test, calibrated medical hardware, physician note
    MEDIUM = "medium"   # Consumer wearable, self-report journal
    LOW = "low"         # Unverified user entry, historical memory


class TrendType(str, Enum):
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    UNSTABLE = "unstable"
    UNKNOWN = "unknown"


class EvidenceItem(BaseModel):
    """
    Standardized EvidenceItem contract for PHOS reasoning pipeline.
    All data sources (EHR, Wearables, BioGears Twin, Labs, Journals) emit items
    conforming strictly to this schema.
    """
    itemId: str = Field(..., description="Unique evidence item identifier")
    source: str = Field(..., description="Source provenance e.g. FHIR:Observation/123, Wearable:Fitbit, BioGears:TwinSim")
    dataType: str = Field(..., description="Data category e.g. vitalSign, labResult, symptom, condition, medication")
    timestamp: datetime = Field(default_factory=utc_now, description="ISO8601 UTC timestamp when recorded")
    value: Any = Field(..., description="Measured value (numeric, string, dict, or boolean)")
    unit: Optional[str] = Field(None, description="Clinical unit e.g. bpm, mmHg, mg/dL")
    confidence: float = Field(default=0.95, ge=0.0, le=1.0, description="Data certainty score (0.0 - 1.0)")
    freshness: float = Field(default=0.0, ge=0.0, description="Age of data in hours since capture")
    reliability: ReliabilityLevel = Field(default=ReliabilityLevel.HIGH, description="Qualitative source reliability")
    trend: TrendType = Field(default=TrendType.STABLE, description="Derived temporal direction")
    importance: float = Field(default=0.8, ge=0.0, le=1.0, description="Heuristic relevance weight (0.0 - 1.0)")
    loinc_code: Optional[str] = Field(None, description="LOINC code if lab or vital sign")
    snomed_code: Optional[str] = Field(None, description="SNOMED CT code if condition or symptom")
    is_abnormal: bool = Field(default=False, description="Whether value exceeds clinical baseline")
    notes: Optional[str] = Field(None, description="Clinical interpretation notes")
    raw_payload: Dict[str, Any] = Field(default_factory=dict, description="Original source payload")

    def to_json_contract(self) -> Dict[str, Any]:
        """Renders exact JSON contract required by PHOS spec."""
        return {
            "itemId": self.itemId,
            "source": self.source,
            "dataType": self.dataType,
            "timestamp": self.timestamp.isoformat(),
            "value": self.value,
            "unit": self.unit,
            "confidence": self.confidence,
            "freshness": self.freshness,
            "reliability": self.reliability.value,
            "trend": self.trend.value,
            "importance": self.importance,
            "loinc_code": self.loinc_code,
            "snomed_code": self.snomed_code,
            "is_abnormal": self.is_abnormal,
            "notes": self.notes,
        }

    @classmethod
    def from_fhir_observation(cls, fhir_obs: Dict[str, Any]) -> "EvidenceItem":
        """Factory creating EvidenceItem from HL7 FHIR Observation resource."""
        obs_id = fhir_obs.get("id", "fhir-obs-unknown")
        code_coding = fhir_obs.get("code", {}).get("coding", [{}])[0]
        loinc = code_coding.get("code")
        label = code_coding.get("display", "Observation")
        val_qty = fhir_obs.get("valueQuantity", {})
        val = val_qty.get("value", fhir_obs.get("valueString", "N/A"))
        unit = val_qty.get("unit")
        effective_dt = fhir_obs.get("effectiveDateTime")
        ts = datetime.fromisoformat(effective_dt.replace("Z", "+00:00")) if effective_dt else utc_now()

        return cls(
            itemId=f"fhir-obs-{obs_id}",
            source=f"FHIR:Observation/{obs_id}",
            dataType="vitalSign" if "vital" in label.lower() else "labResult",
            timestamp=ts,
            value=val,
            unit=unit,
            confidence=0.98,
            reliability=ReliabilityLevel.HIGH,
            loinc_code=loinc,
            notes=f"FHIR Observation: {label}",
            raw_payload=fhir_obs,
        )
