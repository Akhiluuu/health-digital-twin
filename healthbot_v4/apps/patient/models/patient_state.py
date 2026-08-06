"""
healthbot_v4/apps/patient/models/patient_state.py
FHIR R4-aligned Canonical Unified Patient State Model for VitalHealth v6.0 Enterprise.
Represents the single source of truth for all patient clinical, physiological, and behavioral data.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class FHIRPatientDemographics(BaseModel):
    patient_id: str
    name: str = "VitalHealth User"
    age: int = 50
    gender: str = "unspecified"
    blood_type: str = "Unknown"
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    bmi: Optional[float] = None
    emergency_contacts: List[Dict[str, str]] = Field(default_factory=list)


class FHIRCondition(BaseModel):
    condition_id: str
    icd10_code: str
    name: str
    clinical_status: str = "active"  # active, recurrence, relapse, inactive, remission, resolved
    onset_date: Optional[str] = None
    severity: str = "moderate"      # mild, moderate, severe
    notes: Optional[str] = None


class FHIRMedicationRequest(BaseModel):
    medication_id: str
    rxnorm_code: Optional[str] = None
    name: str
    dose: str
    route: str = "oral"
    frequency: str = "QD"
    status: str = "active"
    compliance_rate: float = 1.0  # 0.0 - 1.0
    prescribed_by: Optional[str] = None
    start_date: Optional[str] = None


class FHIRObservationVital(BaseModel):
    vital_id: str
    loinc_code: Optional[str] = None
    metric_name: str  # Heart Rate, Blood Pressure, SpO2, Temperature, Glucose
    value: Any
    unit: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "NORMAL"  # NORMAL, WATCH, ACTION_REQUIRED


class FHIRObservationLab(BaseModel):
    lab_id: str
    loinc_code: Optional[str] = None
    biomarker_name: str
    value: float
    unit: str
    reference_range: str
    target_value: Optional[str] = None
    status: str = "NORMAL"  # OPTIMAL, ELEVATED, CRITICAL, LOW
    trend: str = "STABLE"    # IMPROVING, STABLE, DECLINING
    date_tested: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FHIRAllergyIntolerance(BaseModel):
    allergy_id: str
    substance: str
    reaction: str
    severity: str = "severe"  # mild, moderate, severe, anaphylactic


class DigitalTwinState(BaseModel):
    engine_name: str = "BioGears_v5.4"
    last_simulated: Optional[datetime] = None
    cardiovascular_score: float = 90.0
    mean_arterial_pressure_mmhg: float = 85.0
    cardiac_output_l_min: float = 5.0
    predicted_glucose_2h: Optional[float] = None
    simulation_notes: str = "Optimal perfusion"


class ClinicalRiskMatrix(BaseModel):
    ascvd_10yr_risk_percent: float = 5.0
    ckd_progression_risk: str = "LOW"
    diabetes_complication_risk: str = "MODERATE"
    arrhythmia_risk: str = "LOW"
    active_red_flags: List[str] = Field(default_factory=list)


class UnifiedPatientState(BaseModel):
    """
    Canonical Unified Patient State.
    Single, immutable-in-turn in-memory clinical snapshot backing all VitalHealth microservices.
    """
    state_version: int = 1
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    patient_id: str
    
    demographics: FHIRPatientDemographics
    conditions: List[FHIRCondition] = Field(default_factory=list)
    active_regimen: List[FHIRMedicationRequest] = Field(default_factory=list)
    latest_vitals: List[FHIRObservationVital] = Field(default_factory=list)
    lab_trends: List[FHIRObservationLab] = Field(default_factory=list)
    allergies: List[FHIRAllergyIntolerance] = Field(default_factory=list)
    
    digital_twin: DigitalTwinState = Field(default_factory=DigitalTwinState)
    risk_matrix: ClinicalRiskMatrix = Field(default_factory=ClinicalRiskMatrix)
    
    recent_symptoms: List[Dict[str, Any]] = Field(default_factory=list)
    health_goals: List[Dict[str, Any]] = Field(default_factory=list)

    def get_condition_names(self) -> List[str]:
        return [c.name for c in self.conditions if c.clinical_status == "active"]

    def get_active_medication_names(self) -> List[str]:
        return [f"{m.name} {m.dose} ({m.frequency})" for m in self.active_regimen if m.status == "active"]

    def get_allergy_names(self) -> List[str]:
        return [f"{a.substance} ({a.reaction})" for a in self.allergies]

    def has_condition(self, keyword: str) -> bool:
        kw = keyword.lower()
        return any(kw in c.name.lower() or kw in c.icd10_code.lower() for c in self.conditions)

    def has_allergy(self, substance_kw: str) -> bool:
        kw = substance_kw.lower()
        return any(kw in a.substance.lower() for a in self.allergies)
