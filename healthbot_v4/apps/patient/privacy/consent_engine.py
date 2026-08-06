"""
healthbot_v4/apps/patient/privacy/consent_engine.py
Attribute-Based Access Control (ABAC) Consent & Data Privacy Engine for VitalHealth v6.0 Enterprise.
Enforces fine-grained patient consent rules across roles, data categories, expiration dates, and emergency overrides.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from healthbot_v4.shared.logger.logger import logger


class PatientConsentPolicy(BaseModel):
    policy_id: str
    patient_id: str
    granted_to_role: str  # PRACTITIONER, PATIENT, CAREGIVER, RESEARCHER, EMERGENCY
    permitted_categories: List[str] = Field(default_factory=lambda: ["VITALS", "MEDICATION", "LABS"])
    restricted_categories: List[str] = Field(default_factory=lambda: ["MENTAL_HEALTH", "GENETICS"])
    is_active: bool = True
    expires_at: Optional[datetime] = None
    allow_emergency_breakglass: bool = True


class AccessRequest(BaseModel):
    request_id: str
    patient_id: str
    requester_id: str
    requester_role: str  # PRACTITIONER, PATIENT, CAREGIVER, RESEARCHER, EMERGENCY
    target_category: str  # VITALS, MEDICATION, LABS, MENTAL_HEALTH, GENETICS
    is_emergency_breakglass: bool = False
    justification: str = ""


class AccessDecision(BaseModel):
    allowed: bool
    reason: str
    breakglass_triggered: bool = False
    policy_evaluated: Optional[str] = None


class ABACConsentEngine:
    """
    ABAC Privacy & Consent Engine enforcing granular HIPAA / GDPR patient privacy rules.
    """

    def __init__(self):
        # In-memory store for active consent policies
        self._policies: Dict[str, List[PatientConsentPolicy]] = {}

    def register_policy(self, policy: PatientConsentPolicy) -> None:
        if policy.patient_id not in self._policies:
            self._policies[policy.patient_id] = []
        self._policies[policy.patient_id].append(policy)
        logger.info(f"🔒 Registered Consent Policy [{policy.policy_id}] for patient {policy.patient_id} (Role: {policy.granted_to_role})")

    def evaluate_access(self, request: AccessRequest) -> AccessDecision:
        """
        Evaluates ABAC access request against active patient consent policies.
        """
        # 1. Patient self-access is always permitted
        if request.requester_role == "PATIENT" or request.requester_id == request.patient_id:
            return AccessDecision(allowed=True, reason="Patient self-access granted")

        # 2. Emergency Break-Glass override logic
        if request.is_emergency_breakglass:
            logger.warning(f"🚨 EMERGENCY BREAK-GLASS TRIGGERED by {request.requester_id} ({request.requester_role}) for patient {request.patient_id}!")
            return AccessDecision(
                allowed=True,
                reason=f"Emergency Break-Glass Override Granted. Audit Log Created. Justification: {request.justification}",
                breakglass_triggered=True
            )

        # 3. Retrieve patient policies
        patient_policies = self._policies.get(request.patient_id, [])
        if not patient_policies:
            # Default Deny if no explicit consent policy exists for external roles
            return AccessDecision(allowed=False, reason="No active consent policy found for patient. Default deny enforced.")

        now = datetime.now(timezone.utc)

        for policy in patient_policies:
            if not policy.is_active:
                continue

            # Check expiration
            if policy.expires_at and now > policy.expires_at:
                continue

            # Check role match
            if policy.granted_to_role == request.requester_role or policy.granted_to_role == "ALL":
                # Check restricted categories
                if request.target_category.upper() in [c.upper() for c in policy.restricted_categories]:
                    return AccessDecision(
                        allowed=False,
                        reason=f"Access denied: Category '{request.target_category}' is explicitly restricted by patient policy [{policy.policy_id}].",
                        policy_evaluated=policy.policy_id
                    )

                # Check permitted categories
                if request.target_category.upper() in [c.upper() for c in policy.permitted_categories] or "ALL" in policy.permitted_categories:
                    return AccessDecision(
                        allowed=True,
                        reason=f"Access granted under policy [{policy.policy_id}].",
                        policy_evaluated=policy.policy_id
                    )

        return AccessDecision(allowed=False, reason="Access request did not satisfy active consent policy criteria.")
