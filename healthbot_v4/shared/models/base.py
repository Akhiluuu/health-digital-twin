"""
healthbot_v4/shared/models/base.py
Canonical domain models for VitalHealth v5.0 Health Brain architecture.
Extended with Health Journey Engine domain models.
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
    # Existing event types (unchanged)
    medication_added = "medication_added"
    medication_taken = "medication_taken"
    medication_missed = "medication_missed"
    vital_logged = "vital_logged"
    lab_report_uploaded = "lab_report_uploaded"
    ocr_processed = "ocr_processed"
    risk_flagged = "risk_flagged"
    symptom_logged = "symptom_logged"
    twin_simulated = "twin_simulated"
    consultation_completed = "consultation_completed"
    # Journey Engine event types
    journey_milestone_reached = "journey_milestone_reached"
    goal_created = "goal_created"
    goal_updated = "goal_updated"
    goal_completed = "goal_completed"
    health_score_changed = "health_score_changed"
    daily_briefing_generated = "daily_briefing_generated"
    insight_detected = "insight_detected"
    condition_diagnosed = "condition_diagnosed"
    doctor_visit = "doctor_visit"
    weight_logged = "weight_logged"
    sleep_logged = "sleep_logged"
    activity_logged = "activity_logged"
    hydration_logged = "hydration_logged"


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


# ─── Health Journey Engine Domain Models ──────────────────────────────────────

class GoalStatus(str, Enum):
    active = "active"
    completed = "completed"
    paused = "paused"
    failed = "failed"


class GoalTrend(str, Enum):
    improving = "improving"
    stable = "stable"
    declining = "declining"
    unknown = "unknown"


class MilestoneType(str, Enum):
    first_diagnosis = "first_diagnosis"
    medication_started = "medication_started"
    medication_completed = "medication_completed"
    weight_loss = "weight_loss"
    bp_controlled = "bp_controlled"
    hba1c_improved = "hba1c_improved"
    adherence_streak = "adherence_streak"
    exercise_streak = "exercise_streak"
    risk_reduction = "risk_reduction"
    goal_completed = "goal_completed"
    onboarding_complete = "onboarding_complete"


class InsightType(str, Enum):
    improvement = "improvement"
    worsening = "worsening"
    adherence = "adherence"
    risk_change = "risk_change"
    goal_progress = "goal_progress"
    missed_followup = "missed_followup"
    lab_change = "lab_change"
    weight_change = "weight_change"


class HealthGoal(BaseModel):
    goal_id: str
    patient_id: str
    title: str
    description: str
    category: str  # "labs", "lifestyle", "medications", "weight", "vitals"
    metric_name: str
    target_value: float
    current_value: float
    unit: str
    progress_pct: float = 0.0  # 0-100
    trend: GoalTrend = GoalTrend.unknown
    status: GoalStatus = GoalStatus.active
    confidence: float = 0.8  # 0.0-1.0
    recommendations: List[str] = Field(default_factory=list)
    expected_completion_date: Optional[date] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class HealthMilestone(BaseModel):
    milestone_id: str
    patient_id: str
    milestone_type: MilestoneType
    title: str
    description: str
    impact_score: float = 1.0  # clinical significance 0.0-5.0
    achieved_at: datetime = Field(default_factory=datetime.utcnow)
    payload: Dict[str, Any] = Field(default_factory=dict)


class JourneyInsight(BaseModel):
    insight_id: str
    patient_id: str
    insight_type: InsightType
    title: str
    body: str
    severity: RiskLevel = RiskLevel.low
    metric_name: Optional[str] = None
    old_value: Optional[float] = None
    new_value: Optional[float] = None
    unit: Optional[str] = None
    actionable_recommendation: str = ""
    detected_at: datetime = Field(default_factory=datetime.utcnow)


class MetricProgress(BaseModel):
    metric_name: str
    current_value: float
    target_value: Optional[float] = None
    unit: str
    progress_pct: float  # 0-100
    trend: GoalTrend = GoalTrend.unknown
    period_label: str = "7-day"


class JourneyProgressReport(BaseModel):
    patient_id: str
    medication_adherence_rate: float = 0.0  # 0-100
    lifestyle_adherence_score: float = 0.0  # 0-100
    exercise_progress: MetricProgress
    weight_trend: Optional[MetricProgress] = None
    bp_trend: Optional[MetricProgress] = None
    glucose_trend: Optional[MetricProgress] = None
    sleep_trend: Optional[MetricProgress] = None
    overall_goal_completion_pct: float = 0.0
    active_goals_count: int = 0
    completed_goals_count: int = 0
    computed_at: datetime = Field(default_factory=datetime.utcnow)


class DailyBriefingV2(BaseModel):
    """Extended daily briefing produced by the JourneyAI engine."""
    patient_id: str
    briefing_date: str
    greeting: str
    health_score: float
    health_score_display: str
    health_status: str  # "Excellent", "Good", "Fair", "Needs Attention"
    status_color: str  # "green", "amber", "red"
    todays_priorities: List[str] = Field(default_factory=list)
    potential_risks: List[str] = Field(default_factory=list)
    medication_reminders: List[str] = Field(default_factory=list)
    health_insights: List[str] = Field(default_factory=list)
    goal_progress_summary: List[str] = Field(default_factory=list)
    twin_prediction: str = ""
    motivational_message: str = ""
    whats_new: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class JourneySnapshot(BaseModel):
    """Compressed view consumed by the Journey Dashboard home screen."""
    patient_id: str
    health_score: float
    health_status: str
    status_color: str
    whats_changed_today: str
    todays_top_priority: str
    active_risk_count: int
    active_risks: List[str] = Field(default_factory=list)
    twin_insight: str
    active_goals_count: int
    completed_milestones_count: int
    latest_milestone: Optional[str] = None
    medication_adherence_pct: float
    recent_insights: List[JourneyInsight] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

