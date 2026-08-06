"""
healthbot_v4/apps/brain/safety/explainability.py
Explainability & Clinical Audit Trail Engine for VitalHealth v6.0 Enterprise.
Generates machine-readable audit trail certificates mapping decision rationale to clinical evidence.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.safety.confidence_calculator import ConfidenceBreakdown
from healthbot_v4.shared.logger.logger import logger


class ExplainabilityAuditCertificate(BaseModel):
    audit_id: str = Field(default_factory=lambda: f"aud-{uuid.uuid4().hex[:10]}")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    patient_id: str
    classified_intent: str
    query_text: str
    
    decision_summary: str
    evidence_sources: List[str] = Field(default_factory=list)
    confidence_breakdown: Dict[str, Any] = Field(default_factory=dict)
    clinical_reasons: List[str] = Field(default_factory=list)
    safety_guardrails_passed: bool = True
    disclaimer_enforced: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "audit_id": self.audit_id,
            "timestamp": self.timestamp.isoformat(),
            "patient_id": self.patient_id,
            "intent": self.classified_intent,
            "query": self.query_text,
            "summary": self.decision_summary,
            "evidence": self.evidence_sources,
            "confidence": self.confidence_breakdown,
            "clinical_reasons": self.clinical_reasons,
            "safety_passed": self.safety_guardrails_passed,
        }


class ExplainabilityAuditEngine:
    """
    Generates structured audit trail certificates for clinical governance & explainability.
    """

    @staticmethod
    def generate_certificate(
        patient_id: str,
        intent: str,
        query: str,
        summary: str,
        evidence_sources: List[str],
        confidence: ConfidenceBreakdown,
        clinical_reasons: List[str],
        safety_passed: bool = True
    ) -> ExplainabilityAuditCertificate:
        cert = ExplainabilityAuditCertificate(
            patient_id=patient_id,
            classified_intent=intent,
            query_text=query,
            decision_summary=summary,
            evidence_sources=evidence_sources or ["VitalHealth FHIR EHR", "Clinical Guidelines RAG"],
            confidence_breakdown=confidence.to_dict(),
            clinical_reasons=clinical_reasons,
            safety_guardrails_passed=safety_passed
        )
        logger.info(f"📜 Generated Explainability Audit Certificate [{cert.audit_id}] for patient {patient_id}")
        return cert
