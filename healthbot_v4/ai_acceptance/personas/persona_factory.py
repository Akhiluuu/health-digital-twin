"""
VitalHealth AI Acceptance Testing Platform — Persona Factory
Defines 20 realistic, clinically rich patient personas covering all demographics,
chronic conditions, polypharmacy, digital twin baselines, and family caregiver dynamics.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

@dataclass
class PatientPersona:
    id: str
    name: str
    age: int
    gender: str
    category: str
    medical_history: List[str]
    active_medications: List[Dict[str, str]]
    lifestyle: Dict[str, Any]
    goals: List[str]
    vitals_baseline: Dict[str, Any]
    lab_baseline: Dict[str, Any]
    timeline_events: List[Dict[str, str]]
    family_history: List[str]
    biogears_sim: Dict[str, Any]
    conversation_history: List[Dict[str, str]] = field(default_factory=list)

class PersonaFactory:
    """Factory creating 20 production-grade realistic patient personas."""

    @staticmethod
    def get_all_personas() -> Dict[str, PatientPersona]:
        personas = {}

        # 1. Healthy Adult
        p1 = PatientPersona(
            id="p_healthy",
            name="Alex Turner",
            age=28,
            gender="Male",
            category="Healthy Adult",
            medical_history=[],
            active_medications=[],
            lifestyle={"diet": "Balanced Whole Food", "exercise": "Cardio 4x/week", "sleep_hours": 8.0, "smoker": False, "alcohol": "Occasional"},
            goals=["Maintain fitness", "Optimize sleep recovery", "Prevent seasonal illness"],
            vitals_baseline={"heart_rate": 64, "bp_systolic": 116, "bp_diastolic": 76, "spo2": 99.0, "temperature": 36.8},
            lab_baseline={"hba1c": 5.2, "fasting_glucose": 88, "creatinine": 0.9, "egfr": 110, "cholesterol": 175},
            timeline_events=[{"date": "2026-01-10", "event": "Annual Wellness Exam — All clear"}],
            family_history=["Father: Hypertension at age 60"],
            biogears_sim={"hr": 64, "bp": "116/76", "map": 89.3, "cardiac_output": 5.2, "organ_scores": {"cardiovascular": 98, "renals": 98, "metabolic": 96}}
        )
        personas[p1.id] = p1

        # 2. Type 1 Diabetes
        p2 = PatientPersona(
            id="p_t1d",
            name="Chloe Bennett",
            age=24,
            gender="Female",
            category="Type 1 Diabetes",
            medical_history=["Type 1 Diabetes Mellitus (Diagnosed age 12)", "Hypoglycemic Episodes"],
            active_medications=[{"name": "Insulin Lispro", "dose": "Slide Scale before meals"}, {"name": "Insulin Glargine", "dose": "22 units bedtime"}],
            lifestyle={"diet": "Carb Counting (45g/meal)", "exercise": "Running 3x/week", "sleep_hours": 7.5, "smoker": False},
            goals=["Maintain HbA1c < 6.8%", "Prevent nocturnal hypoglycemia"],
            vitals_baseline={"heart_rate": 72, "bp_systolic": 118, "bp_diastolic": 78, "spo2": 98.5, "temperature": 37.0},
            lab_baseline={"hba1c": 6.7, "fasting_glucose": 135, "creatinine": 0.8, "egfr": 105},
            timeline_events=[{"date": "2026-02-01", "event": "Mild hypoglycemia episode resolved with juice"}],
            family_history=["Mother: Hashimoto Thyroiditis"],
            biogears_sim={"hr": 72, "bp": "118/78", "map": 91.3, "cardiac_output": 5.0, "organ_scores": {"metabolic": 82, "renals": 94, "cardiovascular": 95}}
        )
        personas[p2.id] = p2

        # 3. Type 2 Diabetes
        p3 = PatientPersona(
            id="p_t2d",
            name="Robert Vance",
            age=58,
            gender="Male",
            category="Type 2 Diabetes",
            medical_history=["Type 2 Diabetes Mellitus", "Hyperlipidemia"],
            active_medications=[{"name": "Metformin", "dose": "1000mg twice daily"}, {"name": "Empagliflozin", "dose": "10mg daily"}],
            lifestyle={"diet": "Low Glycemic", "exercise": "Walking 20 mins daily", "sleep_hours": 6.8, "smoker": False},
            goals=["Reduce fasting glucose < 120", "Weight loss 5kg"],
            vitals_baseline={"heart_rate": 76, "bp_systolic": 128, "bp_diastolic": 82, "spo2": 97.5},
            lab_baseline={"hba1c": 7.4, "fasting_glucose": 142, "creatinine": 1.1, "egfr": 82},
            timeline_events=[{"date": "2026-01-15", "event": "Endocrinology Visit — Added SGLT2 inhibitor"}],
            family_history=["Father: Type 2 Diabetes, Coronary Artery Disease"],
            biogears_sim={"hr": 76, "bp": "128/82", "map": 97.3, "cardiac_output": 4.8, "organ_scores": {"metabolic": 78, "cardiovascular": 88, "renals": 90}}
        )
        personas[p3.id] = p3

        # 4. Hypertension Stage 2
        p4 = PatientPersona(
            id="p_hypertension",
            name="David Miller",
            age=62,
            gender="Male",
            category="Hypertension",
            medical_history=["Essential Stage 2 Hypertension", "Mild Left Ventricular Hypertrophy"],
            active_medications=[{"name": "Lisinopril", "dose": "20mg daily"}, {"name": "Amlodipine", "dose": "5mg daily"}],
            lifestyle={"diet": "DASH Diet (<2000mg sodium)", "exercise": "Light walking", "sleep_hours": 7.0, "smoker": False},
            goals=["Keep Systolic BP < 130", "Reduce stress"],
            vitals_baseline={"heart_rate": 78, "bp_systolic": 138, "bp_diastolic": 88, "spo2": 97.0},
            lab_baseline={"hba1c": 5.6, "fasting_glucose": 95, "creatinine": 1.2, "egfr": 76, "potassium": 4.4},
            timeline_events=[{"date": "2026-02-10", "event": "BP check 138/88 in clinic"}],
            family_history=["Mother: Stroke at age 71"],
            biogears_sim={"hr": 78, "bp": "138/88", "map": 104.6, "cardiac_output": 4.6, "organ_scores": {"cardiovascular": 79, "renals": 85, "metabolic": 92}}
        )
        personas[p4.id] = p4

        # 5. Chronic Kidney Disease Stage 3
        p5 = PatientPersona(
            id="p_ckd",
            name="Eleanor Wright",
            age=68,
            gender="Female",
            category="CKD",
            medical_history=["CKD Stage 3a (eGFR 48)", "Hypertension", "Anemia of CKD"],
            active_medications=[{"name": "Losartan", "dose": "50mg daily"}, {"name": "Furosemide", "dose": "20mg daily"}],
            lifestyle={"diet": "Renal Restriction (Low Sodium, Low Potassium)", "exercise": "Gentle stretching", "sleep_hours": 7.2},
            goals=["Stabilize eGFR", "Avoid NSAIDs & nephrotoxic drugs"],
            vitals_baseline={"heart_rate": 74, "bp_systolic": 132, "bp_diastolic": 80, "spo2": 96.5},
            lab_baseline={"hba1c": 5.8, "creatinine": 1.6, "egfr": 48, "potassium": 4.8, "bun": 28},
            timeline_events=[{"date": "2026-01-20", "event": "Nephrology consult — eGFR stable at 48"}],
            family_history=["Brother: Polycystic Kidney Disease"],
            biogears_sim={"hr": 74, "bp": "132/80", "map": 97.3, "cardiac_output": 4.5, "organ_scores": {"renals": 64, "cardiovascular": 82, "metabolic": 85}}
        )
        personas[p5.id] = p5

        # 6. Heart Failure
        p6 = PatientPersona(
            id="p_chf",
            name="George Harris",
            age=72,
            gender="Male",
            category="Heart Failure",
            medical_history=["Heart Failure with Reduced Ejection Fraction (HFrEF, EF 35%)", "Ischemic Cardiomyopathy"],
            active_medications=[{"name": "Entresto (Sacubitril/Valsartan)", "dose": "49/51mg twice daily"}, {"name": "Metoprolol Succinate", "dose": "50mg daily"}, {"name": "Spironolactone", "dose": "25mg daily"}],
            lifestyle={"diet": "Fluid Restriction < 2L/day, Low Sodium < 1500mg", "exercise": "Heart Rehab walking", "sleep_hours": 6.5},
            goals=["Avoid fluid overload readmission", "Daily weight tracking"],
            vitals_baseline={"heart_rate": 68, "bp_systolic": 112, "bp_diastolic": 72, "spo2": 95.5},
            lab_baseline={"bnp": 450, "creatinine": 1.4, "egfr": 56, "potassium": 4.6},
            timeline_events=[{"date": "2026-02-05", "event": "Cardiology rehab visit — EF 35%"}],
            family_history=["Father: Heart attack at age 58"],
            biogears_sim={"hr": 68, "bp": "112/72", "map": 85.3, "cardiac_output": 3.6, "organ_scores": {"cardiovascular": 60, "renals": 75, "respiratory": 82}}
        )
        personas[p6.id] = p6

        # 7. Pregnancy 24 Weeks
        p7 = PatientPersona(
            id="p_pregnant",
            name="Emma Watson",
            age=31,
            gender="Female",
            category="Pregnancy",
            medical_history=["G1P0, 24 Weeks Gestation", "Mild Gestational Nausea (1st trimester)"],
            active_medications=[{"name": "Prenatal Vitamin", "dose": "1 tab daily"}, {"name": "Iron Supplement", "dose": "325mg Ferrous Sulfate"}],
            lifestyle={"diet": "Pregnancy Safe (High folate, no raw fish/unpasteurized cheese)", "exercise": "Prenatal Yoga 3x/week", "sleep_hours": 8.5},
            goals=["Healthy full-term delivery", "Maintain target glucose on OGTT"],
            vitals_baseline={"heart_rate": 82, "bp_systolic": 114, "bp_diastolic": 74, "spo2": 99.0},
            lab_baseline={"hemoglobin": 11.2, "fasting_glucose": 84, "ogtt_1hr": 128},
            timeline_events=[{"date": "2026-01-28", "event": "24-week Anatomy Ultrasound — Normal fetal development"}],
            family_history=["Mother: Preeclampsia"],
            biogears_sim={"hr": 82, "bp": "114/74", "map": 87.3, "cardiac_output": 6.2, "organ_scores": {"metabolic": 94, "cardiovascular": 92, "renals": 95}}
        )
        personas[p7.id] = p7

        # 8. Asthma Moderate Persistent
        p8 = PatientPersona(
            id="p_asthma",
            name="Hannah Davis",
            age=19,
            gender="Female",
            category="Asthma",
            medical_history=["Moderate Persistent Asthma", "Environmental Allergies (Pollen, Mold)"],
            active_medications=[{"name": "Fluticasone/Salmeterol (Advair)", "dose": "250/50 mcg 1 puff twice daily"}, {"name": "Albuterol Inhaler", "dose": "2 puffs as needed"}],
            lifestyle={"diet": "Standard", "exercise": "Indoor swimming", "sleep_hours": 7.8},
            goals=["Zero night-time awakenings", "FEV1 > 85% predicted"],
            vitals_baseline={"heart_rate": 74, "bp_systolic": 112, "bp_diastolic": 72, "spo2": 98.0},
            lab_baseline={"fev1": 84.0, "igE": 210},
            timeline_events=[{"date": "2026-02-12", "event": "Peak flow reading 420 L/min (Green Zone)"}],
            family_history=["Father: Asthma, Eczema"],
            biogears_sim={"hr": 74, "bp": "112/72", "map": 85.3, "cardiac_output": 5.1, "organ_scores": {"respiratory": 80, "cardiovascular": 96, "immune": 85}}
        )
        personas[p8.id] = p8

        # 9. COPD Stage II
        p9 = PatientPersona(
            id="p_copd",
            name="James Coleman",
            age=66,
            gender="Male",
            category="COPD",
            medical_history=["COPD GOLD Stage II (Moderate)", "Former Tobacco Use (40 pack-years, quit 2022)"],
            active_medications=[{"name": "Tiotropium (Spiriva)", "dose": "18mcg inhaled daily"}, {"name": "Budasonide/Formoterol (Symbicort)", "dose": "160/4.5 2 puffs twice daily"}],
            lifestyle={"diet": "High Protein Low Carb", "exercise": "Pulmonary Rehab walking", "sleep_hours": 6.8, "smoker": False},
            goals=["Prevent COPD acute exacerbation", "Maintain SpO2 > 93% on room air"],
            vitals_baseline={"heart_rate": 78, "bp_systolic": 126, "bp_diastolic": 80, "spo2": 94.0},
            lab_baseline={"fev1_fvc_ratio": 62.0, "fev1_pct": 58.0},
            timeline_events=[{"date": "2026-01-08", "event": "Spirometry showing FEV1 58% predicted"}],
            family_history=["Father: COPD, Emphysema"],
            biogears_sim={"hr": 78, "bp": "126/80", "map": 95.3, "cardiac_output": 4.7, "organ_scores": {"respiratory": 68, "cardiovascular": 85, "metabolic": 88}}
        )
        personas[p9.id] = p9

        # 10. Cancer Survivor Remission
        p10 = PatientPersona(
            id="p_cancer_survivor",
            name="Patricia Scott",
            age=52,
            gender="Female",
            category="Cancer Survivor",
            medical_history=["Invasive Ductal Carcinoma Breast Cancer (Stage II, ER+/PR+, HER2-)", "Lumpectomy + Radiation (2023)", "Five-year Remission Surveillance"],
            active_medications=[{"name": "Anastrozole (Arimidex)", "dose": "1mg daily"}],
            lifestyle={"diet": "Anti-inflammatory Mediterranean", "exercise": "Pilates & Walking", "sleep_hours": 7.5},
            goals=["Prevent recurrence", "Manage aromatase inhibitor joint stiffness"],
            vitals_baseline={"heart_rate": 70, "bp_systolic": 120, "bp_diastolic": 76, "spo2": 98.5},
            lab_baseline={"ca_15_3": 14.2, "dexa_t_score": -1.4, "mammogram": "Clear (Nov 2025)"},
            timeline_events=[{"date": "2025-11-14", "event": "Annual Mammogram clear — No sign of recurrence"}],
            family_history=["Maternal Aunt: Breast Cancer"],
            biogears_sim={"hr": 70, "bp": "120/76", "map": 90.6, "cardiac_output": 5.0, "organ_scores": {"immune": 90, "cardiovascular": 94, "musculoskeletal": 82}}
        )
        personas[p10.id] = p10

        # 11. Post-Op Total Knee Replacement
        p11 = PatientPersona(
            id="p_post_op",
            name="Charles King",
            age=64,
            gender="Male",
            category="Post Surgery",
            medical_history=["Post Right Total Knee Arthroplasty (Day 14 Post-Op)", "Severe Osteoarthritis"],
            active_medications=[{"name": "Rivaroxaban (Xarelto)", "dose": "10mg daily (DVT prophylaxis)"}, {"name": "Acetaminophen", "dose": "1000mg TID"}, {"name": "Tramadol", "dose": "50mg PRN severe pain"}],
            lifestyle={"diet": "High Protein & Calcium", "exercise": "Physical Therapy 3x/week", "sleep_hours": 6.5},
            goals=["Achieve 110 degree knee flexion", "Wean off opioids by Week 3"],
            vitals_baseline={"heart_rate": 76, "bp_systolic": 124, "bp_diastolic": 78, "spo2": 98.0},
            lab_baseline={"crp": 8.5, "esr": 22},
            timeline_events=[{"date": "2026-01-22", "event": "Right TKA Surgery completed successfully"}],
            family_history=["Mother: Severe Osteoarthritis"],
            biogears_sim={"hr": 76, "bp": "124/78", "map": 93.3, "cardiac_output": 4.9, "organ_scores": {"musculoskeletal": 65, "cardiovascular": 92, "immune": 88}}
        )
        personas[p11.id] = p11

        # 12. Pediatric Query (6M)
        p12 = PatientPersona(
            id="p_pediatric",
            name="Lucas Ramirez (Parent: Sofia)",
            age=6,
            gender="Male",
            category="Pediatric",
            medical_history=["Mild Atopic Dermatitis", "Recurrent Otitis Media (Aged 3-4)"],
            active_medications=[{"name": "Hydrocortisone 1% Cream", "dose": "Apply sparingly PRN flareups"}],
            lifestyle={"diet": "Balanced Kid Diet", "exercise": "Active play 2+ hours daily", "sleep_hours": 10.0},
            goals=["Parent seeking guidance on fever and cough rash management"],
            vitals_baseline={"heart_rate": 95, "bp_systolic": 98, "bp_diastolic": 62, "spo2": 99.0, "temperature": 37.2},
            lab_baseline={"growth_percentile_weight": 55, "growth_percentile_height": 60},
            timeline_events=[{"date": "2025-10-05", "event": "6-Year Well Child Check — Vaccines updated"}],
            family_history=["Mother: Seasonal Allergies"],
            biogears_sim={"hr": 95, "bp": "98/62", "map": 74.0, "cardiac_output": 3.2, "organ_scores": {"immune": 94, "respiratory": 96, "metabolic": 98}}
        )
        personas[p12.id] = p12

        # 13. Teenager (16M)
        p13 = PatientPersona(
            id="p_teenager",
            name="Ethan Brooks",
            age=16,
            gender="Male",
            category="Teenager",
            medical_history=["Acne Vulgaris", "Mild Exercise-Induced Bronchospasm"],
            active_medications=[{"name": "Tretinoin 0.05% Gel", "dose": "Apply bedtime"}, {"name": "Albuterol Inhaler", "dose": "2 puffs 15 mins before sports"}],
            lifestyle={"diet": "High Calorie High Protein", "exercise": "High School Basketball Team", "sleep_hours": 7.0},
            goals=["Clear skin", "Improve athletic endurance"],
            vitals_baseline={"heart_rate": 68, "bp_systolic": 114, "bp_diastolic": 72, "spo2": 99.0},
            lab_baseline={"hemoglobin": 14.8, "ferritin": 55},
            timeline_events=[{"date": "2025-09-01", "event": "Sports Physical Clearance — Passed"}],
            family_history=["Father: Male Pattern Baldness"],
            biogears_sim={"hr": 68, "bp": "114/72", "map": 86.0, "cardiac_output": 5.8, "organ_scores": {"musculoskeletal": 98, "cardiovascular": 96, "metabolic": 98}}
        )
        personas[p13.id] = p13

        # 14. Young Adult (22F)
        p14 = PatientPersona(
            id="p_young_adult",
            name="Maya Patel",
            age=22,
            gender="Female",
            category="Young Adult",
            medical_history=["Polycystic Ovary Syndrome (PCOS)", "Iron Deficiency Anemia"],
            active_medications=[{"name": "Combined Oral Contraceptive (Ethinyl Estradiol/Drospirenone)", "dose": "1 tab daily"}, {"name": "Ferrous Gluconate", "dose": "324mg daily"}],
            lifestyle={"diet": "Low Glycemic Index", "exercise": "HIIT & Strength 4x/week", "sleep_hours": 7.5},
            goals=["Regulate menstrual cycle", "Improve energy levels"],
            vitals_baseline={"heart_rate": 72, "bp_systolic": 110, "bp_diastolic": 70, "spo2": 99.0},
            lab_baseline={"hemoglobin": 11.5, "ferritin": 18, "lh_fsh_ratio": 2.2, "fasting_insulin": 12},
            timeline_events=[{"date": "2026-01-05", "event": "Gynecology Visit — PCOS ultrasound confirmed"}],
            family_history=["Mother: Hypothyroidism"],
            biogears_sim={"hr": 72, "bp": "110/70", "map": 83.3, "cardiac_output": 5.0, "organ_scores": {"metabolic": 85, "cardiovascular": 96, "renals": 98}}
        )
        personas[p14.id] = p14

        # 15. Older Adult Mild Cognitive Decline (79M)
        p15 = PatientPersona(
            id="p_older_adult",
            name="Arthur Pendelton",
            age=79,
            gender="Male",
            category="Older Adult",
            medical_history=["Mild Cognitive Impairment (MCI)", "Benign Prostatic Hyperplasia (BPH)", "Osteoarthritis"],
            active_medications=[{"name": "Donepezil (Aricept)", "dose": "10mg bedtime"}, {"name": "Tamsulosin (Flomax)", "dose": "0.4mg daily"}, {"name": "Meloxicam", "dose": "7.5mg daily"}],
            lifestyle={"diet": "MIND Diet", "exercise": "Daily garden walk 15 mins", "sleep_hours": 6.5},
            goals=["Maintain cognitive independence", "Prevent falls"],
            vitals_baseline={"heart_rate": 66, "bp_systolic": 128, "bp_diastolic": 76, "spo2": 96.5},
            lab_baseline={"moca_score": 23.0, "vitamin_b12": 420, "tsh": 2.1},
            timeline_events=[{"date": "2026-01-30", "event": "Neurology Memory Clinic — MoCA 23/30"}],
            family_history=["Sister: Alzheimer's Disease"],
            biogears_sim={"hr": 66, "bp": "128/76", "map": 93.3, "cardiac_output": 4.1, "organ_scores": {"nervous": 72, "musculoskeletal": 75, "cardiovascular": 86}}
        )
        personas[p15.id] = p15

        # 16. Polypharmacy (74F)
        p16 = PatientPersona(
            id="p_polypharmacy",
            name="Margaret Jenkins",
            age=74,
            gender="Female",
            category="Polypharmacy",
            medical_history=["Hypertension", "Type 2 Diabetes", "Osteoporosis", "GERD", "Atrial Fibrillation"],
            active_medications=[
                {"name": "Apixaban (Eliquis)", "dose": "5mg twice daily"},
                {"name": "Metformin", "dose": "500mg BID"},
                {"name": "Metoprolol Tartrate", "dose": "25mg BID"},
                {"name": "Omeprazole", "dose": "20mg daily"},
                {"name": "Alendronate (Fosamax)", "dose": "70mg weekly"},
                {"name": "Atorvastatin", "dose": "20mg daily"},
                {"name": "Calcium + Vit D3", "dose": "600mg/400IU BID"},
                {"name": "Levothyroxine", "dose": "75mcg daily"}
            ],
            lifestyle={"diet": "Low Salt Low Acid", "exercise": "Short neighborhood walks", "sleep_hours": 6.0},
            goals=["Avoid drug-drug interactions", "Simplify pill schedule"],
            vitals_baseline={"heart_rate": 64, "bp_systolic": 126, "bp_diastolic": 74, "spo2": 97.0},
            lab_baseline={"inr": 1.1, "hba1c": 6.9, "creatinine": 1.1, "egfr": 58},
            timeline_events=[{"date": "2026-02-02", "event": "Comprehensive Medication Review with Pharmacist"}],
            family_history=["Father: Stroke at 76"],
            biogears_sim={"hr": 64, "bp": "126/74", "map": 91.3, "cardiac_output": 4.2, "organ_scores": {"cardiovascular": 80, "renals": 78, "metabolic": 82}}
        )
        personas[p16.id] = p16

        # 17. Mental Health Anxiety & Insomnia (29M)
        p17 = PatientPersona(
            id="p_mental_health",
            name="Julian Vance",
            age=29,
            gender="Male",
            category="Mental Health",
            medical_history=["Generalized Anxiety Disorder (GAD)", "Onset Insomnia", "Somatic Panic Symptoms"],
            active_medications=[{"name": "Sertraline (Zoloft)", "dose": "50mg morning"}, {"name": "Hydroxyzine", "dose": "25mg PRN acute anxiety"}],
            lifestyle={"diet": "Caffeine Restricted (<100mg/day)", "exercise": "Yoga & Gym 3x/week", "sleep_hours": 5.5},
            goals=["Reduce panic attack frequency", "Improve sleep latency < 20 mins"],
            vitals_baseline={"heart_rate": 84, "bp_systolic": 122, "bp_diastolic": 80, "spo2": 99.0},
            lab_baseline={"gad7_score": 14.0, "phq9_score": 6.0},
            timeline_events=[{"date": "2026-01-18", "event": "Psychotherapy Session — Cognitive Behavioral Therapy"}],
            family_history=["Mother: Major Depressive Disorder"],
            biogears_sim={"hr": 84, "bp": "122/80", "map": 94.0, "cardiac_output": 5.4, "organ_scores": {"nervous": 75, "cardiovascular": 92, "metabolic": 96}}
        )
        personas[p17.id] = p17

        # 18. Obesity Class II (41M)
        p18 = PatientPersona(
            id="p_obesity",
            name="Marcus Holloway",
            age=41,
            gender="Male",
            category="Obesity",
            medical_history=["Class II Obesity (BMI 37.5)", "Non-Alcoholic Fatty Liver Disease (NAFLD)", "Obstructive Sleep Apnea (OSA)"],
            active_medications=[{"name": "Semaglutide (Wegovy)", "dose": "1.0mg weekly injection"}],
            lifestyle={"diet": "Caloric Deficit (-500 kcal/day)", "exercise": "Swimming & Walking 4x/week", "sleep_hours": 7.0, "cpap_user": True},
            goals=["Lose 15% body weight", "Reverse NAFLD hepatic steatosis"],
            vitals_baseline={"heart_rate": 78, "bp_systolic": 130, "bp_diastolic": 84, "spo2": 96.0},
            lab_baseline={"alt": 54, "ast": 42, "triglycerides": 210, "hba1c": 5.9},
            timeline_events=[{"date": "2026-01-12", "event": "Weight Management Clinic — Initiated GLP-1 agonist"}],
            family_history=["Father: Type 2 Diabetes, NASH Cirrhosis"],
            biogears_sim={"hr": 78, "bp": "130/84", "map": 99.3, "cardiac_output": 5.6, "organ_scores": {"hepatic": 74, "metabolic": 76, "cardiovascular": 85}}
        )
        personas[p18.id] = p18

        # 19. Athlete Endurance (27M)
        p19 = PatientPersona(
            id="p_athlete",
            name="Liam Gallagher",
            age=27,
            gender="Male",
            category="Athlete",
            medical_history=["Athletic Sinus Bradycardia (Resting HR 42 bpm)", "Patellar Tendonitis"],
            active_medications=[],
            lifestyle={"diet": "High Calorie (3,500 kcal/day, Carb Loading)", "exercise": "Marathon & Triathlon Training (12 hrs/week)", "sleep_hours": 9.0},
            goals=["Sub-3 hour marathon timing", "Optimize VO2 max & lactic threshold"],
            vitals_baseline={"heart_rate": 42, "bp_systolic": 108, "bp_diastolic": 68, "spo2": 99.5},
            lab_baseline={"vo2_max": 64.5, "hematocrit": 46.0, "ferritin": 85},
            timeline_events=[{"date": "2026-02-08", "event": "Sports Performance Lab — VO2 Max 64.5 mL/kg/min"}],
            family_history=["Father: Collegiate Runner"],
            biogears_sim={"hr": 42, "bp": "108/68", "map": 81.3, "cardiac_output": 5.8, "organ_scores": {"cardiovascular": 99, "musculoskeletal": 94, "respiratory": 98}}
        )
        personas[p19.id] = p19

        # 20. Family Caregiver (45F Caregiver)
        p20 = PatientPersona(
            id="p_caregiver",
            name="Sarah Lin (Caregiver for mother Helen, 82)",
            age=45,
            gender="Female",
            category="Family Caregiver",
            medical_history=["Caregiver Burnout", "Mild Tension Headaches"],
            active_medications=[{"name": "Multivitamin", "dose": "1 tab daily"}],
            lifestyle={"diet": "Quick Convenience", "exercise": "Intermittent walking", "sleep_hours": 6.0},
            goals=["Safely manage elderly mother's 6 daily medications", "Prevent caregiver exhaustion"],
            vitals_baseline={"heart_rate": 74, "bp_systolic": 118, "bp_diastolic": 76, "spo2": 98.5},
            lab_baseline={"cortisol_morning": 18.5, "fasting_glucose": 92},
            timeline_events=[{"date": "2026-01-25", "event": "Assisted mother with hospital discharge notes"}],
            family_history=["Mother: Moderate Dementia, Vascular Disease"],
            biogears_sim={"hr": 74, "bp": "118/76", "map": 90.0, "cardiac_output": 5.0, "organ_scores": {"nervous": 88, "cardiovascular": 94, "metabolic": 95}}
        )
        personas[p20.id] = p20

        return personas
