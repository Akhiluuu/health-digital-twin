"""
healthbot_v4/apps/brain/reasoning/patient_persona.py

Patient Persona Subsystem for VitalHealth v5.0.
Analyzes query sentiment, health literacy level, active conditions, medications,
vitals anomalies, age cohort, and profile attributes to construct a 6-vector PatientPersona for hyper-personalized AI synthesis.
"""

from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from healthbot_v4.shared.logger.logger import logger


class HealthLiteracy(str, Enum):
    NOVICE        = "NOVICE"         # Plain English, zero jargon, clear analogies
    INTERMEDIATE  = "INTERMEDIATE"   # Standard medical terms, clear explanations
    EXPERT        = "EXPERT"         # Clinical terminology, biomarker reference ranges, physiological mechanisms


class EmotionalSentiment(str, Enum):
    ANXIOUS   = "ANXIOUS"     # Worried, frightened -> Calm, reassuring, validating tone
    MOTIVATED = "MOTIVATED"   # Goal-oriented, positive -> Encouraging, benchmark-focused tone
    CONFUSED  = "CONFUSED"    # Uncertain -> Structured, step-by-step clarifying tone
    ROUTINE   = "ROUTINE"     # Neutral, factual -> Warm, direct, professional tone


class AgeCohort(str, Enum):
    PEDIATRIC = "PEDIATRIC"  # Age < 18
    ADULT     = "ADULT"      # Age 18-64
    GERIATRIC = "GERIATRIC"  # Age 65+


class PolypharmacyRiskLevel(str, Enum):
    LOW      = "LOW"       # 0-1 medications
    MODERATE = "MODERATE"  # 2-3 medications
    HIGH     = "HIGH"      # 4+ medications (Polypharmacy alert)


class PatientPersona(BaseModel):
    name: str = "VitalHealth User"
    first_name: str = "Friend"
    age: int = 40
    biological_sex: str = "male"
    literacy_level: HealthLiteracy = HealthLiteracy.INTERMEDIATE
    emotional_sentiment: EmotionalSentiment = EmotionalSentiment.ROUTINE
    age_cohort: AgeCohort = AgeCohort.ADULT
    polypharmacy_risk: PolypharmacyRiskLevel = PolypharmacyRiskLevel.LOW
    is_hyper_acute_vitals: bool = False
    hyper_acute_details: List[str] = Field(default_factory=list)
    pediatric_caregiver: bool = False
    chronic_conditions: List[str] = Field(default_factory=list)
    active_medications: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    active_goals: List[str] = Field(default_factory=list)

    def to_summary_block(self) -> str:
        conditions_str = ", ".join(self.chronic_conditions) if self.chronic_conditions else "None documented"
        meds_str = ", ".join(self.active_medications) if self.active_medications else "None active"
        allergies_str = ", ".join(self.allergies) if self.allergies else "None reported"
        goals_str = ", ".join(self.active_goals) if self.active_goals else "General health maintenance"
        acute_str = "; ".join(self.hyper_acute_details) if self.is_hyper_acute_vitals else "Vitals normal"

        return (
            f"• Patient: {self.first_name} ({self.age}y {self.biological_sex} | Cohort: {self.age_cohort.value})\n"
            f"• Health Literacy: {self.literacy_level.value}\n"
            f"• Sentiment: {self.emotional_sentiment.value}\n"
            f"• Polypharmacy Risk: {self.polypharmacy_risk.value} ({len(self.active_medications)} active meds)\n"
            f"• Hyper-Acute Alert: {self.is_hyper_acute_vitals} ({acute_str})\n"
            f"• Conditions: {conditions_str}\n"
            f"• Regimen: {meds_str}\n"
            f"• Allergies: {allergies_str}\n"
            f"• Active Goals: {goals_str}"
        )


class PatientPersonaEngine:
    """
    Constructs a multi-vector PatientPersona from PatientState and query analysis,
    including hyper-acute vitals detection, age cohort analysis, and polypharmacy audits.
    """

    @staticmethod
    def detect_sentiment(query: str) -> EmotionalSentiment:
        q_lower = query.strip().lower()
        
        anxious_kws = ["scared", "terrified", "worried", "panic", "anxious", "afraid", "freaking", "freaked", "freak", "help me", "dangerous", "cancer", "dying", "heart attack"]
        if any(kw in q_lower for kw in anxious_kws):
            return EmotionalSentiment.ANXIOUS

        motivated_kws = ["goal", "improve", "best way", "optimize", "build muscle", "lose weight", "streak", "better", "hba1c target", "fit", "marathon"]
        if any(kw in q_lower for kw in motivated_kws):
            return EmotionalSentiment.MOTIVATED

        confused_kws = ["don't understand", "what does this mean", "confused", "why is", "how come", "unclear", "explain why", "difference between"]
        if any(kw in q_lower for kw in confused_kws):
            return EmotionalSentiment.CONFUSED

        return EmotionalSentiment.ROUTINE

    @staticmethod
    def detect_literacy(query: str) -> HealthLiteracy:
        q_lower = query.strip().lower()

        # Expert indicators (biomarker names, physiological mechanisms)
        expert_kws = ["hba1c", "egfr", "systolic", "diastolic", "pharmacokinetics", "bioavailability", "mechanism of action", "snomed", "loinc", "arrhythmia", "troponin", "lipid panel"]
        if any(kw in q_lower for kw in expert_kws):
            return HealthLiteracy.EXPERT

        # Novice indicators (simple terms, basic questions)
        novice_kws = ["simple words", "explain simply", "like I'm 5", "easy terms", "what is a", "why do I feel"]
        if any(kw in q_lower for kw in novice_kws):
            return HealthLiteracy.NOVICE

        return HealthLiteracy.INTERMEDIATE

    @staticmethod
    def detect_age_cohort(age: int, query: str) -> tuple[AgeCohort, bool]:
        q_lower = query.lower()
        pediatric_kws = ["my baby", "my kid", "my toddler", "my son", "my daughter", "my child", "pediatric"]
        is_pediatric_inquiry = age < 18 or any(kw in q_lower for kw in pediatric_kws)
        
        if is_pediatric_inquiry:
            return AgeCohort.PEDIATRIC, True
        elif age >= 65:
            return AgeCohort.GERIATRIC, False
        else:
            return AgeCohort.ADULT, False

    @staticmethod
    def detect_polypharmacy_risk(med_count: int) -> PolypharmacyRiskLevel:
        if med_count >= 4:
            return PolypharmacyRiskLevel.HIGH
        elif med_count >= 2:
            return PolypharmacyRiskLevel.MODERATE
        return PolypharmacyRiskLevel.LOW

    @staticmethod
    def check_hyper_acute_vitals(state: Optional[Any]) -> tuple[bool, List[str]]:
        if not state or not hasattr(state, "recent_vitals") or not state.recent_vitals:
            return False, []

        details = []
        for v in state.recent_vitals:
            v_type = getattr(v, "vital_type", "").lower()
            val_p = getattr(v, "value_primary", None)
            val_s = getattr(v, "value_secondary", None)

            if val_p is None:
                continue

            if "blood_pressure" in v_type or "bp" in v_type:
                if val_p >= 180:
                    details.append(f"Hypertensive Crisis (Systolic BP: {val_p} mmHg)")
                elif val_p <= 85:
                    details.append(f"Severe Hypotension (Systolic BP: {val_p} mmHg)")
                if val_s and val_s >= 120:
                    details.append(f"Hypertensive Emergency (Diastolic BP: {val_s} mmHg)")

            elif "heart_rate" in v_type or "hr" in v_type or "pulse" in v_type:
                if val_p >= 140:
                    details.append(f"Extreme Tachycardia (Heart Rate: {val_p} bpm)")
                elif val_p <= 45:
                    details.append(f"Severe Bradycardia (Heart Rate: {val_p} bpm)")

            elif "spo2" in v_type or "oxygen" in v_type:
                if val_p < 90:
                    details.append(f"Critical Hypoxia (SpO2: {val_p}%)")

            elif "glucose" in v_type or "blood_sugar" in v_type:
                if val_p >= 300:
                    details.append(f"Severe Hyperglycemia (Glucose: {val_p} mg/dL)")
                elif val_p <= 55:
                    details.append(f"Severe Hypoglycemia (Glucose: {val_p} mg/dL)")

        return len(details) > 0, details

    def build_persona(self, state: Optional[Any], query: str) -> PatientPersona:
        sentiment = self.detect_sentiment(query)
        literacy = self.detect_literacy(query)

        if not state:
            age_cohort, pediatric_caregiver = self.detect_age_cohort(40, query)
            return PatientPersona(
                literacy_level=literacy,
                emotional_sentiment=sentiment,
                age_cohort=age_cohort,
                pediatric_caregiver=pediatric_caregiver,
            )

        # Extract profile facts safely
        profile = getattr(state, "profile", None)
        first_name = getattr(profile, "first_name", "Friend") if profile else "Friend"
        if first_name.lower() in ("anonymous", "user", "patient", ""):
            first_name = "Friend"

        full_name = f"{first_name} {getattr(profile, 'last_name', '')}".strip() if profile else "VitalHealth User"
        age = getattr(profile, "age", 40) if profile else 40
        sex = str(getattr(profile, "biological_sex", "male")).replace("BiologicalSex.", "") if profile else "male"
        allergies = getattr(profile, "allergies", []) if profile else []

        # Age cohort & Pediatric check
        age_cohort, pediatric_caregiver = self.detect_age_cohort(age, query)

        # Extract conditions & medications
        conditions = []
        if hasattr(state, "current_conditions") and state.current_conditions:
            for c in state.current_conditions:
                c_name = getattr(c, "condition_name", str(c))
                if c_name:
                    conditions.append(c_name)

        medications = []
        if hasattr(state, "active_medications") and state.active_medications:
            for m in state.active_medications:
                m_name = getattr(m, "name", str(m))
                if m_name:
                    medications.append(m_name)

        poly_risk = self.detect_polypharmacy_risk(len(medications))
        is_hyper_acute, acute_details = self.check_hyper_acute_vitals(state)

        persona = PatientPersona(
            name=full_name or "VitalHealth User",
            first_name=first_name,
            age=age,
            biological_sex=sex,
            literacy_level=literacy,
            emotional_sentiment=sentiment,
            age_cohort=age_cohort,
            polypharmacy_risk=poly_risk,
            is_hyper_acute_vitals=is_hyper_acute,
            hyper_acute_details=acute_details,
            pediatric_caregiver=pediatric_caregiver,
            chronic_conditions=conditions,
            active_medications=medications,
            allergies=allergies,
        )

        logger.info(f"👤 Persona Built: [{persona.first_name}] Cohort={persona.age_cohort.value}, Polypharmacy={persona.polypharmacy_risk.value}, HyperAcute={persona.is_hyper_acute_vitals}")
        return persona
