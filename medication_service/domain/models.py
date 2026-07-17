"""
medication_service/domain/models.py
Pydantic domain models — the canonical shape of every entity in the system.
"""
from __future__ import annotations
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class MedicationStatus(str, Enum):
    active = "active"
    paused = "paused"
    discontinued = "discontinued"
    archived = "archived"
    completed = "completed"

class DoseStatus(str, Enum):
    pending = "pending"
    taken = "taken"
    missed = "missed"
    skipped = "skipped"
    late = "late"
    rescheduled = "rescheduled"
    deleted = "deleted"

class FrequencyType(str, Enum):
    once = "once"
    daily = "daily"
    twice_daily = "twice_daily"
    three_times = "three_times"
    every_x_hours = "every_x_hours"
    weekly = "weekly"
    monthly = "monthly"
    prn = "prn"
    custom_rrule = "custom_rrule"

class InteractionSeverity(str, Enum):
    none = "none"
    minor = "minor"
    moderate = "moderate"
    major = "major"
    contraindicated = "contraindicated"

class PriorityLevel(str, Enum):
    critical = "critical"
    important = "important"
    optional = "optional"

class DosageForm(str, Enum):
    tablet = "tablet"
    capsule = "capsule"
    injection = "injection"
    drops = "drops"
    inhaler = "inhaler"
    syrup = "syrup"
    patch = "patch"
    cream = "cream"
    suppository = "suppository"
    powder = "powder"
    solution = "solution"

class CaregiverPermission(str, Enum):
    read_only = "read_only"
    log_doses = "log_doses"
    full_access = "full_access"
    emergency_only = "emergency_only"

class ReportFormat(str, Enum):
    pdf = "pdf"
    csv = "csv"
    fhir_json = "fhir_json"
    hl7_v2 = "hl7_v2"
    excel = "excel"


# ─── Doctor ───────────────────────────────────────────────────────────────────

class DoctorCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    specialty: Optional[str] = None
    hospital: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    npi_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class DoctorOut(DoctorCreate):
    id: UUID
    user_id: str
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True


# ─── Medicine ─────────────────────────────────────────────────────────────────

class MedicineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    brand_name: Optional[str] = None
    generic_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: DosageForm = DosageForm.tablet
    dose_quantity: str = Field(..., min_length=1)
    dose_unit: str = "tablet"
    frequency: FrequencyType = FrequencyType.daily
    rrule: Optional[str] = None
    scheduled_time: Optional[str] = None  # "HH:MM"
    meal_relation: str = "after"
    start_date: date = Field(default_factory=date.today)
    end_date: Optional[date] = None
    is_ongoing: bool = True
    priority: PriorityLevel = PriorityLevel.important
    doctor_id: Optional[UUID] = None
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    purpose: Optional[str] = None
    side_effects: Optional[str] = None
    warnings: Optional[str] = None
    storage_conditions: Optional[str] = None
    color: Optional[str] = None
    shape: Optional[str] = None
    disease_linked: Optional[str] = None
    biogears_linked: bool = False
    reminder_enabled: bool = True
    inventory_count: int = Field(default=30, ge=0)
    refill_count: int = Field(default=3, ge=0)
    barcode: Optional[str] = None
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("meal_relation")
    @classmethod
    def validate_meal(cls, v: str) -> str:
        if v not in ("before", "after", "with", "empty_stomach"):
            raise ValueError("meal_relation must be before/after/with/empty_stomach")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "MedicineCreate":
        if self.end_date and not self.is_ongoing:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be >= start_date")
        return self


class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[DosageForm] = None
    dose_quantity: Optional[str] = None
    frequency: Optional[FrequencyType] = None
    scheduled_time: Optional[str] = None
    meal_relation: Optional[str] = None
    end_date: Optional[date] = None
    is_ongoing: Optional[bool] = None
    status: Optional[MedicationStatus] = None
    priority: Optional[PriorityLevel] = None
    purpose: Optional[str] = None
    biogears_linked: Optional[bool] = None
    reminder_enabled: Optional[bool] = None
    custom_metadata: Optional[Dict[str, Any]] = None


class MedicineOut(BaseModel):
    id: UUID
    user_id: str
    name: str
    brand_name: Optional[str]
    generic_name: Optional[str]
    strength: Optional[str]
    dosage_form: DosageForm
    dose_quantity: str
    dose_unit: str
    frequency: FrequencyType
    scheduled_time: Optional[str]
    meal_relation: str
    start_date: date
    end_date: Optional[date]
    is_ongoing: bool
    status: MedicationStatus
    priority: PriorityLevel
    doctor_name: Optional[str]
    hospital: Optional[str]
    purpose: Optional[str]
    side_effects: Optional[str]
    warnings: Optional[str]
    storage_conditions: Optional[str]
    color: Optional[str]
    shape: Optional[str]
    disease_linked: Optional[str]
    biogears_linked: bool
    reminder_enabled: bool
    inventory_count: int
    refill_count: int
    custom_metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    version: int
    class Config:
        from_attributes = True


# ─── Dose ─────────────────────────────────────────────────────────────────────

class DoseLogRequest(BaseModel):
    medicine_id: UUID
    status: DoseStatus
    taken_at: Optional[datetime] = None
    skip_reason: Optional[str] = None
    notes: Optional[str] = None
    delay_minutes: Optional[int] = None

class DoseOut(BaseModel):
    id: UUID
    medicine_id: UUID
    user_id: str
    scheduled_at: datetime
    taken_at: Optional[datetime]
    status: DoseStatus
    delay_minutes: Optional[int]
    skip_reason: Optional[str]
    notes: Optional[str]
    biogears_sim_id: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True


# ─── Interaction Check ─────────────────────────────────────────────────────────

class InteractionCheckRequest(BaseModel):
    medicine_ids: List[UUID] = Field(..., min_length=2, max_length=10)

class InteractionResult(BaseModel):
    drug_a: str
    drug_b: str
    severity: InteractionSeverity
    mechanism: Optional[str]
    clinical_effect: Optional[str]
    management: Optional[str]
    contraindicated: bool
    confidence_score: float
    reference_sources: List[str]

class InteractionCheckResponse(BaseModel):
    checked_medicines: List[str]
    interactions: List[InteractionResult]
    highest_severity: InteractionSeverity
    has_contraindication: bool
    summary: str


# ─── Prescription ─────────────────────────────────────────────────────────────

class PrescriptionCreate(BaseModel):
    doctor_name: Optional[str] = None
    hospital: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    summary: Optional[str] = None

class PrescriptionOut(PrescriptionCreate):
    id: UUID
    user_id: str
    status: str
    ocr_confidence: Optional[float]
    file_name: Optional[str]
    file_url: Optional[str]
    is_verified: bool
    created_at: datetime
    class Config:
        from_attributes = True


# ─── Inventory ────────────────────────────────────────────────────────────────

class InventoryUpdate(BaseModel):
    current_count: Optional[int] = Field(default=None, ge=0)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    storage_location: Optional[str] = None
    reorder_threshold: Optional[int] = None
    unit_cost_usd: Optional[float] = None
    pharmacy_name: Optional[str] = None
    pharmacy_phone: Optional[str] = None

class InventoryOut(BaseModel):
    id: UUID
    medicine_id: UUID
    user_id: str
    current_count: int
    unit: str
    batch_number: Optional[str]
    expiry_date: Optional[date]
    storage_location: Optional[str]
    reorder_threshold: int
    unit_cost_usd: Optional[float]
    is_generic: bool
    brand_cost_usd: Optional[float]
    pharmacy_name: Optional[str]
    last_refill_at: Optional[datetime]
    next_refill_pred: Optional[datetime]
    consumption_rate: Optional[float]
    is_low: bool = False
    days_remaining: Optional[int] = None
    class Config:
        from_attributes = True


# ─── Compliance ───────────────────────────────────────────────────────────────

class ComplianceReport(BaseModel):
    user_id: str
    period: str
    period_start: date
    period_end: date
    total_scheduled: int
    total_taken: int
    total_missed: int
    total_skipped: int
    total_late: int
    adherence_pct: float
    avg_delay_minutes: float
    streak_days: int
    score: float
    grade: str
    trend: str
    insights: List[str]


# ─── Reminder ─────────────────────────────────────────────────────────────────

class ReminderSnoozeRequest(BaseModel):
    reminder_id: UUID
    snooze_minutes: int = Field(default=10, ge=1, le=120)

class ReminderAckRequest(BaseModel):
    reminder_id: UUID

class ReminderSettingsUpdate(BaseModel):
    voice_alarms_enabled: Optional[bool] = None
    biometric_confirm: Optional[bool] = None
    caregiver_escalation: Optional[bool] = None
    escalation_delay_minutes: Optional[int] = None
    travel_mode: Optional[bool] = None
    timezone: Optional[str] = None
    snooze_limit: Optional[int] = None
    cloud_sync_enabled: Optional[bool] = None
    notification_sound: Optional[str] = None
    reminder_advance_minutes: Optional[int] = None
    low_stock_threshold: Optional[int] = None


# ─── Emergency ────────────────────────────────────────────────────────────────

class EmergencyProfileUpdate(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[List[str]] = None
    medical_conditions: Optional[List[str]] = None
    emergency_contacts: Optional[List[Dict[str, Any]]] = None
    critical_medicine_ids: Optional[List[UUID]] = None

class EmergencyProfileOut(BaseModel):
    user_id: str
    blood_group: Optional[str]
    allergies: List[str]
    critical_medicines: List[Dict[str, Any]]
    medical_conditions: List[str]
    emergency_contacts: List[Dict[str, Any]]
    qr_token: str
    last_updated: datetime


# ─── Caregiver ────────────────────────────────────────────────────────────────

class CaregiverAdd(BaseModel):
    caregiver_user_id: str
    caregiver_name: Optional[str] = None
    relationship: Optional[str] = None
    permission: CaregiverPermission = CaregiverPermission.read_only


# ─── Report Request ───────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    report_type: str = Field(..., pattern="^(clinical|monthly_compliance|fhir|hl7|emergency|inventory|full)$")
    format: ReportFormat = ReportFormat.pdf
    period_start: Optional[date] = None
    period_end: Optional[date] = None


# ─── AI Chat ──────────────────────────────────────────────────────────────────

class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context_medicine_ids: Optional[List[UUID]] = None
    conversation_id: Optional[str] = None


class AIChatResponse(BaseModel):
    reply: str
    conversation_id: str
    clinical_citations: List[str] = []
    suggested_actions: List[str] = []
    risk_flags: List[str] = []


# ─── BioGears Sync ────────────────────────────────────────────────────────────

class MedicationSimRequest(BaseModel):
    medicine_id: UUID
    dose_id: Optional[UUID] = None
    substance_name: str
    dose_value: float
    dose_unit: str = "mg"
    pre_vitals: Optional[Dict[str, Any]] = None


# ─── Pagination ───────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    data: List[Any]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool


# ─── Standard API Response ────────────────────────────────────────────────────

class APIResponse(BaseModel):
    success: bool = True
    message: str = "OK"
    data: Optional[Any] = None
    errors: Optional[List[str]] = None
    request_id: Optional[str] = None
