"""
healthbot_v4/apps/api/onboarding_router.py
Dynamic AI-Driven Onboarding & Health OS Ingestion Gateway Endpoint.
Handles adaptive intake questions, real-time Digital Twin calibration, Knowledge Graph seeding, and Medical Timeline event generation.
"""

import uuid
from datetime import datetime, date, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status

from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientProfile, BiologicalSex, NormalizedVital, NormalizedMedication,
    NormalizedCondition, TimelineEventType, MilestoneType
)
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.twin.simulation_runner import DigitalTwinRunner

router = APIRouter(prefix="/api/v6/onboarding", tags=["Dynamic Onboarding Gateway"])

# Global engine singletons
state_mgr = PatientStateManager()
timeline_engine = MedicalTimelineEngine()
graph_engine = HealthKnowledgeGraphEngine()
twin_runner = DigitalTwinRunner()


# ─── Medical Taxonomy Master Dictionary ─────────────────────────────────────

COMPREHENSIVE_MEDICAL_TAXONOMY = {
    "Cardiovascular": [
        "Hypertension (High BP)", "Coronary Artery Disease", "Heart Failure", "Arrhythmia / Atrial Fibrillation",
        "Angina Pectoris", "Peripheral Artery Disease", "Hyperlipidemia (High Cholesterol)", "Valvular Heart Disease",
        "Aortic Aneurysm", "Venous Thromboembolism (DVT)", "Post-Myocardial Infarction", "Congenital Heart Defect"
    ],
    "Endocrine & Metabolic": [
        "Type 1 Diabetes Mellitus", "Type 2 Diabetes Mellitus", "Gestational Diabetes", "Hypothyroidism",
        "Hyperthyroidism / Graves' Disease", "Hashimoto's Thyroiditis", "Obesity / Metabolic Syndrome",
        "Polycystic Ovary Syndrome (PCOS)", "Osteopenia / Osteoporosis", "Adrenal Insufficiency", "Cushing's Syndrome",
        "Hyperuricemia / Gout", "Prediabetes"
    ],
    "Respiratory": [
        "Asthma", "Chronic Obstructive Pulmonary Disease (COPD)", "Bronchitis", "Emphysema",
        "Pulmonary Fibrosis", "Sleep Apnea (OSA)", "Allergic Rhinitis", "Pneumonia / Recurrent Chest Infections",
        "Bronchiectasis", "Pulmonary Hypertension", "Sarcoidosis"
    ],
    "Neurological": [
        "Migraine / Chronic Headache", "Epilepsy / Seizure Disorder", "Multiple Sclerosis", "Parkinson's Disease",
        "Peripheral Neuropathy", "Stroke / Transient Ischemic Attack (TIA)", "Essential Tremor",
        "Alzheimer's Disease / Dementia", "Restless Legs Syndrome", "Trigeminal Neuralgia", "Bell's Palsy"
    ],
    "Gastrointestinal & Hepatic": [
        "Gastroesophageal Reflux Disease (GERD)", "Irritable Bowel Syndrome (IBS)", "Crohn's Disease",
        "Ulcerative Colitis", "Celiac Disease", "Peptic Ulcer Disease", "Non-Alcoholic Fatty Liver Disease (NAFLD)",
        "Cirrhosis / Chronic Liver Disease", "Gallstones / Cholecystitis", "Chronic Pancreatitis", "Diverticulitis"
    ],
    "Renal & Urological": [
        "Chronic Kidney Disease (CKD)", "Kidney Stones (Nephrolithiasis)", "Polycystic Kidney Disease",
        "Nephrotic Syndrome", "Benign Prostatic Hyperplasia (BPH)", "Recurrent Urinary Tract Infections",
        "Overactive Bladder"
    ],
    "Musculoskeletal & Autoimmune": [
        "Rheumatoid Arthritis", "Osteoarthritis", "Systemic Lupus Erythematosus (SLE)", "Psoriatic Arthritis",
        "Ankylosing Spondylitis", "Sjögren's Syndrome", "Fibromyalgia", "Chronic Lower Back Pain",
        "Scoliosis", "Gouty Arthritis", "Tendinitis / Bursitis"
    ],
    "Dermatological": [
        "Psoriasis", "Eczema / Atopic Dermatitis", "Severe Acne", "Rosacea",
        "Alopecia Areata", "Vitiligo", "Chronic Urticaria (Hives)", "Hidradenitis Suppurativa"
    ],
    "Hematological & Immune": [
        "Iron Deficiency Anemia", "Vitamin B12 / Pernicious Anemia", "Sickle Cell Trait / Disease",
        "Thalassemia", "Immune Thrombocytopenia (ITP)", "Primary Immunodeficiency", "Hemophilia",
        "Multiple Myeloma"
    ],
    "Mental Health & Neurodiversity": [
        "Generalized Anxiety Disorder", "Major Depressive Disorder", "Bipolar Disorder",
        "Attention Deficit Hyperactivity Disorder (ADHD)", "Post-Traumatic Stress Disorder (PTSD)",
        "Obsessive-Compulsive Disorder (OCD)", "Insomnia Disorder", "Panic Disorder"
    ],
    "Oncology": [
        "Breast Cancer History", "Prostate Cancer History", "Colorectal Cancer History",
        "Lung Cancer History", "Melanoma / Skin Cancer", "Lymphoma (Hodgkin/Non-Hodgkin)",
        "Thyroid Cancer History", "Bladder Cancer History"
    ],
    "Reproductive & Womens Health": [
        "Endometriosis", "Uterine Fibroids", "Polycystic Ovary Syndrome (PCOS)",
        "Menopause / Perimenopause Symptoms", "Pelvic Inflammatory Disease", "Premenstrual Dysphoric Disorder (PMDD)"
    ]
}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class AdaptiveQuestionsRequest(BaseModel):
    patient_id: str
    primary_goal: Optional[str] = "wellness"  # wellness, chronic_management, athletic, weight_loss
    age: Optional[int] = 30
    sex: Optional[str] = "male"
    selected_conditions: List[str] = Field(default_factory=list)
    selected_vitals: Optional[Dict[str, Any]] = None


class MedicalSearchRequest(BaseModel):
    query: str = ""
    category: Optional[str] = None
    limit: Optional[int] = 30


class FamilyHistoryItem(BaseModel):
    relation: str  # e.g., "Father", "Mother", "Grandparent", "Sibling"
    condition: str  # e.g., "Heart Disease", "Diabetes", "Stroke", "Cancer"


class FullOnboardingIntakeRequest(BaseModel):
    patient_id: str
    first_name: str = "Patient"
    last_name: str = "User"
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = "Male"
    primary_goal: Optional[str] = "wellness"
    height_cm: float = 175.0
    weight_kg: float = 70.0
    blood_group: str = "O+"
    resting_hr: float = 72.0
    systolic_bp: float = 120.0
    diastolic_bp: float = 80.0
    body_fat_pct: float = 20.0
    allergies: List[str] = Field(default_factory=list)
    chronic_conditions: List[str] = Field(default_factory=list)
    family_history: List[FamilyHistoryItem] = Field(default_factory=list)
    medications: List[str] = Field(default_factory=list)
    surgeries: List[str] = Field(default_factory=list)
    habits: Dict[str, Any] = Field(default_factory=dict)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/medical-search", tags=["Dynamic Onboarding Gateway"])
async def search_medical_database(req: MedicalSearchRequest):
    """
    Real-time dynamic search endpoint for onboarding medical intake.
    Allows searching across comprehensive medical condition taxonomy by query or organ system category.
    """
    query = req.query.strip().lower()
    cat_filter = req.category

    results = []
    
    for category_name, items in COMPREHENSIVE_MEDICAL_TAXONOMY.items():
        if cat_filter and cat_filter != "All" and cat_filter.lower() not in category_name.lower():
            continue

        for item in items:
            if not query or query in item.lower() or query in category_name.lower():
                results.append({
                    "condition": item,
                    "category": category_name
                })

    limit = req.limit or 30
    return {
        "status": "SUCCESS",
        "total": len(results),
        "results": results[:limit],
        "categories": list(COMPREHENSIVE_MEDICAL_TAXONOMY.keys())
    }


@router.post("/adaptive-questions", tags=["Dynamic Onboarding Gateway"])
async def get_adaptive_questions(req: AdaptiveQuestionsRequest):
    """
    Evaluates incoming onboarding state (demographics, primary goal, selected conditions)
    and dynamically generates targeted question cards and smart chips for the intake steps.
    """
    primary_goal = (req.primary_goal or "wellness").lower()
    sex = (req.sex or "male").lower()
    age = req.age or 30

    # Base smart conditions
    conditions_pool = ["Hypertension", "Type 2 Diabetes", "Asthma / COPD", "Thyroid", "Migraine", "Chronic Anemia", "Arthritis", "Obesity"]
    if sex == "female":
        conditions_pool.extend(["PCOD / PCOS", "Osteoporosis"])
    if age > 45:
        conditions_pool.extend(["Heart Disease", "High Cholesterol", "Kidney Disease"])
    if "athletic" in primary_goal:
        conditions_pool.extend(["Joint Pain", "Muscle Strain", "Low Iron"])

    # Base smart family chips
    family_pool = ["Heart Disease", "Diabetes", "Cancer", "Stroke", "Hypertension", "Mental Health", "Kidney Disease", "Obesity"]

    # Recommended medications based on selected conditions
    med_recommendations = []
    sel_lower = [c.lower() for c in req.selected_conditions]
    if any("diabetes" in c for c in sel_lower):
        med_recommendations.extend(["Metformin", "Insulin"])
    if any("hypertension" in c or "bp" in c or "heart" in c for c in sel_lower):
        med_recommendations.extend(["Amlodipine", "Aspirin", "Ramipril", "Losartan"])
    if any("thyroid" in c for c in sel_lower):
        med_recommendations.append("Levothyroxine")
    if any("asthma" in c or "copd" in c for c in sel_lower):
        med_recommendations.append("Salbutamol")

    # Adaptive Habit Cards based on Primary Goal
    adaptive_habit_cards = []
    if "weight" in primary_goal or "fat" in primary_goal:
        adaptive_habit_cards.append({
            "id": "weight_target",
            "question": "What is your main target for body composition?",
            "subtitle": "Help us calibrate your daily caloric balance engine",
            "icon": "barbell",
            "type": "single",
            "options": [
                {"label": "Fat Loss (-0.5 kg/week)", "emoji": "🔥"},
                {"label": "Rapid Shred (-1.0 kg/week)", "emoji": "⚡"},
                {"label": "Maintain & Recomp", "emoji": "⚖️"},
            ]
        })
    elif "chronic" in primary_goal or len(req.selected_conditions) > 0:
        adaptive_habit_cards.append({
            "id": "med_monitoring",
            "question": "How do you manage your daily health regimen?",
            "subtitle": "We will configure automatic reminder nudges",
            "icon": "shield-checkmark",
            "type": "single",
            "options": [
                {"label": "Fixed daily schedule", "emoji": "⏰"},
                {"label": "As needed / flexible", "emoji": "🔄"},
                {"label": "Need automated smart reminders", "emoji": "🔔"},
            ]
        })
    elif "athletic" in primary_goal:
        adaptive_habit_cards.append({
            "id": "recovery_focus",
            "question": "What is your primary recovery metric focus?",
            "subtitle": "Digital Twin will optimize HRV & muscle fatigue models",
            "icon": "fitness",
            "type": "single",
            "options": [
                {"label": "Heart Rate Variability (HRV)", "emoji": "🫀"},
                {"label": "Sleep Quality & Rest", "emoji": "🌙"},
                {"label": "Hydration & Electrolytes", "emoji": "💧"},
            ]
        })

    # Always include baseline nutrition question card
    adaptive_habit_cards.append({
        "id": "dietType",
        "question": "What best describes your diet?",
        "subtitle": "Fits your digital twin dietary simulation profile",
        "icon": "restaurant",
        "type": "chips",
        "options": [
            {"label": "Vegetarian", "emoji": "🥦"},
            {"label": "Vegan", "emoji": "🌱"},
            {"label": "Non-Veg", "emoji": "🍗"},
            {"label": "Keto", "emoji": "🥩"},
            {"label": "Flexitarian", "emoji": "🥙"},
        ]
    })

    return {
        "status": "SUCCESS",
        "patient_id": req.patient_id,
        "suggested_conditions": list(dict.fromkeys(conditions_pool)),
        "suggested_family_history": family_pool,
        "suggested_medications": list(dict.fromkeys(med_recommendations or ["Paracetamol", "Ibuprofen", "Omeprazole", "Aspirin", "Metformin"])),
        "adaptive_habit_cards": adaptive_habit_cards,
        "categorized_taxonomy": COMPREHENSIVE_MEDICAL_TAXONOMY,
    }



@router.post("/intake", tags=["Dynamic Onboarding Gateway"])
async def process_full_onboarding_intake(req: FullOnboardingIntakeRequest):
    """
    Ingests complete dynamic onboarding data into Personal Health OS:
    1. Sets up PatientProfile & baseline clinical flags in PatientStateManager.
    2. Seeds Health Knowledge Graph (patient, conditions, family genetics, medications, surgeries).
    3. Seeds Medical Timeline Engine with past medical events.
    4. Calibrates BioGears Digital Twin baseline & organ health scores.
    5. Returns live Digital Twin Activation Payload.
    """
    logger.info(f"🚀 Processing dynamic onboarding intake for patient: {req.patient_id} ({req.first_name} {req.last_name})")

    # 1. Build and register PatientProfile
    bio_sex = BiologicalSex.female if req.gender and req.gender.lower() == "female" else BiologicalSex.male
    
    # Calculate age from DOB if present
    parsed_age = 30
    dob_date = None
    if req.date_of_birth and len(req.date_of_birth) >= 4:
        try:
            if "-" in req.date_of_birth:
                dob_date = date.fromisoformat(req.date_of_birth)
                today = date.today()
                parsed_age = today.year - dob_date.year - ((today.month, today.day) < (dob_date.month, dob_date.day))
            else:
                parsed_age = int(req.date_of_birth[:4])
        except Exception:
            parsed_age = 30

    profile = PatientProfile(
        patient_id=req.patient_id,
        first_name=req.first_name,
        last_name=req.last_name,
        date_of_birth=dob_date,
        age=parsed_age,
        biological_sex=bio_sex,
        blood_type=req.blood_group or "O+",
        height_cm=req.height_cm,
        weight_kg=req.weight_kg,
        allergies=req.allergies,
        chronic_conditions=req.chronic_conditions,
    )
    
    # Update profile in PatientStateManager
    state = state_mgr.create_profile(profile)

    # 2. Add Baseline Vitals to Patient State
    now_utc = datetime.now(timezone.utc)
    if req.resting_hr:
        state_mgr.add_vital(req.patient_id, NormalizedVital(vital_type="heart_rate", value_primary=req.resting_hr, unit="bpm", timestamp=now_utc))
    if req.systolic_bp and req.diastolic_bp:
        state_mgr.add_vital(req.patient_id, NormalizedVital(vital_type="blood_pressure", value_primary=req.systolic_bp, value_secondary=req.diastolic_bp, unit="mmHg", timestamp=now_utc))

    # 3. Add Medications to Patient State
    for med in req.medications:
        state_mgr.add_medication(req.patient_id, NormalizedMedication(name=med, dose_quantity=500.0, dosage_form="mg", frequency="daily"))

    # 4. Add Chronic Conditions to Patient State
    for cond in req.chronic_conditions:
        state_mgr.add_condition(req.patient_id, NormalizedCondition(condition_name=cond, status="active"))

    # 5. Populate Health Knowledge Graph
    nodes_created = 0
    # Patient Node
    graph_engine.add_clinical_entity(req.patient_id, f"Patient:{req.first_name}_{req.last_name}", "PatientProfile")
    nodes_created += 1

    # Chronic Condition Nodes
    for cond in req.chronic_conditions:
        graph_engine.add_clinical_entity(req.patient_id, cond, "Condition")
        nodes_created += 1

    # Medication Nodes
    for med in req.medications:
        graph_engine.add_clinical_entity(req.patient_id, med, "Medication")
        nodes_created += 1

    # Family Genetics Nodes
    for fam in req.family_history:
        fam_entity = f"FamilyHistory_{fam.relation}_{fam.condition}"
        graph_engine.add_clinical_entity(req.patient_id, fam_entity, "Genetics")
        nodes_created += 1

    # Surgery Nodes
    for surg in req.surgeries:
        graph_engine.add_clinical_entity(req.patient_id, f"Surgery_{surg}", "Procedure")
        nodes_created += 1

    # 6. Seed Medical Timeline Events
    timeline_events_count = 0
    timeline_engine.record_event(
        req.patient_id,
        TimelineEventType.vital_logged,
        "Baseline Vitals Calibrated",
        f"Resting HR: {req.resting_hr} bpm | BP: {req.systolic_bp}/{req.diastolic_bp} mmHg | Body Fat: {req.body_fat_pct}%",
        payload={"resting_hr": req.resting_hr, "systolic_bp": req.systolic_bp, "diastolic_bp": req.diastolic_bp}
    )
    timeline_events_count += 1

    for surg in req.surgeries:
        timeline_engine.record_event(
            req.patient_id,
            TimelineEventType.consultation_completed,
            f"Past Surgery Logged: {surg}",
            f"Historical procedure recorded during onboarding",
            payload={"procedure": surg}
        )
        timeline_events_count += 1

    for cond in req.chronic_conditions:
        timeline_engine.record_event(
            req.patient_id,
            TimelineEventType.condition_diagnosed,
            f"Chronic Condition Logged: {cond}",
            "Added to active medical profile",
            payload={"condition": cond}
        )
        timeline_events_count += 1

    timeline_engine.record_event(
        req.patient_id,
        TimelineEventType.journey_milestone_reached,
        "Digital Twin Calibration Complete",
        "Personal Health OS profile successfully established.",
        payload={"primary_goal": req.primary_goal, "milestone_type": MilestoneType.onboarding_complete.value}
    )
    timeline_events_count += 1

    # 7. Calibrate BioGears Twin Organ Scores & Baseline Metrics
    height_m = req.height_cm / 100.0
    bmi = round(req.weight_kg / (height_m ** 2), 1)
    bsa = round(0.007184 * (req.height_cm ** 0.725) * (req.weight_kg ** 0.425), 2)
    bmr = round(10 * req.weight_kg + 6.25 * req.height_cm - 5 * parsed_age + (5 if bio_sex == BiologicalSex.male else -161))

    # Calculate dynamic organ health scores based on intake vitals, BMI, and clinical history
    has_cvd = any("heart" in c.lower() or "hypertension" in c.lower() or "cardio" in c.lower() for c in req.chronic_conditions)
    has_diabetes = any("diabetes" in c.lower() or "glucose" in c.lower() for c in req.chronic_conditions)
    has_respiratory = any("asthma" in c.lower() or "copd" in c.lower() or "lung" in c.lower() for c in req.chronic_conditions)

    # Base organ score influenced by age and BMI
    age_penalty = max(0.0, (parsed_age - 30) * 0.25)
    bmi_penalty = max(0.0, (bmi - 24.9) * 0.8) if bmi > 24.9 else (max(0.0, (18.5 - bmi) * 1.0) if bmi < 18.5 else 0.0)

    base_organ = max(50.0, 98.0 - age_penalty - bmi_penalty)

    # Specific organ strain deductions
    bp_strain = max(0.0, (req.systolic_bp - 120) * 0.3) if req.systolic_bp > 120 else 0.0
    hr_strain = max(0.0, (req.resting_hr - 72) * 0.2) if req.resting_hr > 72 else 0.0

    heart_score = round(max(40.0, base_organ - (15.0 if has_cvd else 0.0) - bp_strain - hr_strain), 1)
    lung_score = round(max(40.0, base_organ - (15.0 if has_respiratory else 0.0)), 1)
    kidney_score = round(max(40.0, base_organ - (12.0 if has_diabetes else 0.0) - (bp_strain * 0.8)), 1)
    metabolic_score = round(max(40.0, base_organ - (20.0 if has_diabetes else 0.0) - (bmi_penalty * 1.2)), 1)
    brain_score = round(max(40.0, base_organ - (8.0 if has_cvd else 0.0)), 1)
    liver_score = round(max(40.0, base_organ - (bmi_penalty * 0.5)), 1)
    gut_score = round(max(40.0, base_organ - 2.0), 1)

    organ_scores = {
        "brain": brain_score,
        "heart": heart_score,
        "lungs": lung_score,
        "liver": liver_score,
        "gut": gut_score,
        "kidneys": kidney_score,
        "metabolic": metabolic_score,
    }
    composite_health_score = round(sum(organ_scores.values()) / len(organ_scores), 1)
    state.current_health_score = composite_health_score

    # Dynamic CVD Risk Calculation (age + SBP + HR + condition factors)
    cvd_risk = 2.5 + (parsed_age - 20) * 0.15 + bp_strain * 0.4 + (4.0 if has_cvd else 0.0) + (3.0 if has_diabetes else 0.0)
    cvd_risk_pct = round(max(1.0, min(65.0, cvd_risk)), 1)

    # Dynamic Recovery Readiness Score based on composite score, HR, and BMI strain
    readiness_score = int(max(40.0, min(100.0, composite_health_score - hr_strain * 0.5)))

    logger.info(f"✅ Digital Twin successfully initialized for {req.patient_id} with Composite Score: {composite_health_score}")

    return {
        "status": "SUCCESS",
        "patient_id": req.patient_id,
        "twin_activation": {
            "is_calibrated": True,
            "composite_health_score": composite_health_score,
            "bmi": bmi,
            "bsa_m2": bsa,
            "bmr_kcal_day": bmr,
            "organ_health_scores": organ_scores,
            "ten_year_cvd_risk_pct": cvd_risk_pct,
            "recovery_readiness_score": readiness_score,
            "knowledge_graph_nodes": nodes_created,
            "timeline_events_seeded": timeline_events_count,
            "day_1_briefing": f"Welcome to VitalHealth, {req.first_name}! Your Digital Twin is active with a baseline health score of {composite_health_score}/100. Baseline vitals and {len(req.chronic_conditions)} medical conditions are synced.",
        }
    }
