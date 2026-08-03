"""
healthbot_v4/shared/models/base.py
Canonical domain models for VitalHealth v5.0 Health Brain architecture.
"""

from enum import Enum
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class BiologicalSex(str, Enum):
    male = "male"
    female = "female"
    other = "other"


class RiskLevel(str, Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class TimelineEventType(str, Enum):
    medication_added = "medication_added"
    medication_taken = "medication_taken"
    medication_missed = "medication_missed"
    vital_logged = "vital_logged"
    lab_report_uploaded = "lab_report_uploaded"
    ocr_processed = "ocr_processed"
    risk_flagged = "risk_flagged"
    symptom_logged = "symptom_logged"
    twin_simulated = "twin_simulated"


class PatientProfile(BaseModel):
    patient_id: str
    first_name: str = "Anonymous"
    last_name: str = "User"
    date_of_birth: Optional[date] = None
    age: int = 40
    biological_sex: BiologicalSex = BiologicalSex.male
    blood_type: str = "O+"
    height_cm: float = 175.0
    weight_kg: float = 70.0
    allergies: List[str] = Field(default_factory=list)
    chronic_conditions: List[str] = Field(default_factory=list)


class NormalizedMedication(BaseModel):
    name: str
    rxnorm_code: Optional[str] = None
    dose_quantity: float = 500.0
    dosage_form: str = "mg"
    frequency: str = "daily"
    route: str = "oral"
    prescribed_date: Optional[date] = None
    is_active: bool = True


class NormalizedLab(BaseModel):
    canonical_name: str
    loinc_code: Optional[str] = None
    value: float
    unit: str
    reference_range: str = "Normal"
    classification: str = "normal"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class NormalizedVital(BaseModel):
    vital_type: str
    value_primary: float
    value_secondary: Optional[float] = None
    unit: str = "mmHg"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class NormalizedCondition(BaseModel):
    condition_name: str
    snomed_code: Optional[str] = None
    icd10_code: Optional[str] = None
    diagnosed_date: Optional[date] = None
    status: str = "active"


class RiskFlag(BaseModel):
    risk_id: str
    level: RiskLevel
    title: str
    description: str
    recommended_action: str
    triggered_at: datetime = Field(default_factory=datetime.utcnow)


class PatientState(BaseModel):
    patient_id: str
    profile: PatientProfile
    active_medications: List[NormalizedMedication] = Field(default_factory=list)
    current_conditions: List[NormalizedCondition] = Field(default_factory=list)
    recent_labs: List[NormalizedLab] = Field(default_factory=list)
    recent_vitals: List[NormalizedVital] = Field(default_factory=list)
    active_risks: List[RiskFlag] = Field(default_factory=list)
    current_health_score: float = 100.0
    overall_confidence: float = 0.85
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class TimelineEvent(BaseModel):
    event_id: str
    patient_id: str
    event_type: TimelineEventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    title: str
    description: str
    payload: Dict[str, Any] = Field(default_factory=dict)
