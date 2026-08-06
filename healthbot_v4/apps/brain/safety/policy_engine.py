"""
healthbot_v4/apps/brain/safety/policy_engine.py
Decoupled Clinical Policy Engine for VitalHealth v6.0 Enterprise.
Evaluates clinical safety rules and policy constraints independently of LLM weights.
"""

from typing import Dict, Any, List
from pydantic import BaseModel, Field
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.shared.logger.logger import logger


class PolicyViolation(BaseModel):
    rule_id: str
    severity: str  # CRITICAL, HIGH, MODERATE, WARNING
    description: str
    remediation: str


class PolicyEvaluationResult(BaseModel):
    passed: bool
    violations: List[PolicyViolation] = Field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "violations_count": len(self.violations),
            "violations": [v.model_dump() for v in self.violations]
        }


class ClinicalPolicyEngine:
    """
    Decoupled Clinical & Governance Policy Engine.
    Executes rules against UnifiedPatientState and proposed AI recommendations.
    """

    @classmethod
    def evaluate_policies(cls, state: UnifiedPatientState, proposed_response: str) -> PolicyEvaluationResult:
        violations: List[PolicyViolation] = []
        resp_low = proposed_response.lower()

        # Rule 1: Pediatric Aspirin Restriction (Reye's Syndrome)
        if state.demographics.age < 18 and "aspirin" in resp_low:
            violations.append(PolicyViolation(
                rule_id="RULE-PED-001",
                severity="CRITICAL",
                description="Aspirin recommendation detected for pediatric patient under 18 years of age.",
                remediation="Prohibit aspirin in pediatric populations due to fatal Reye's Syndrome risk."
            ))

        # Rule 2: ACE Inhibitor in Pregnancy Contraindication
        if state.demographics.gender == "female" and state.has_condition("pregnancy"):
            if any(ace in resp_low for ace in ["lisinopril", "enalapril", "ramipril", "benazepril"]):
                violations.append(PolicyViolation(
                    rule_id="RULE-OB-002",
                    severity="CRITICAL",
                    description="ACE Inhibitor recommended to pregnant patient.",
                    remediation="ACE Inhibitors are Category D teratogenic in 2nd/3rd trimesters. Switch to Labetalol or Methyldopa."
                ))

        # Rule 3: Acetaminophen Max Dose Safety Ceiling
        if "acetaminophen" in resp_low or "paracetamol" in resp_low or "tylenol" in resp_low:
            if state.has_condition("cirrhosis") or state.has_condition("liver disease"):
                if any(dose in resp_low for dose in ["4000mg", "4g", "3000mg"]):
                    violations.append(PolicyViolation(
                        rule_id="RULE-HEP-003",
                        severity="HIGH",
                        description="Acetaminophen dose >2000mg recommended to patient with underlying liver disease.",
                        remediation="Cap total daily acetaminophen to maximum 2000mg/day in hepatic impairment."
                    ))

        # Rule 4: Potassium Hypokalemia Alert
        for lab in state.lab_trends:
            if "potassium" in lab.biomarker_name.lower() and lab.value < 3.5:
                if any(diuretic in resp_low for diuretic in ["furosemide", "lasix", "hydrochlorothiazide"]):
                    violations.append(PolicyViolation(
                        rule_id="RULE-CARD-004",
                        severity="HIGH",
                        description="Loop/Thiazide diuretic suggested while patient is hypokalemic (Potassium <3.5 mEq/L).",
                        remediation="Verify potassium supplementation prior to initiating non-potassium-sparing diuretics."
                    ))

        passed = len(violations) == 0
        if not passed:
            logger.warning(f"⚠️ Clinical Policy Engine flagged {len(violations)} violation(s)")

        return PolicyEvaluationResult(passed=passed, violations=violations)
