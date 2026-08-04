"""
VitalHealth Validation Laboratory - Persona Factory
Generates 12 realistic clinical patient personas for end-to-end simulation.
"""

from typing import Dict, Any, List
import json

class PersonaFactory:
    """Factory for generating clinical patient personas for validation lab scenarios."""

    PERSONAS: Dict[str, Dict[str, Any]] = {
        "healthy_adult": {
            "name": "Healthy Adult",
            "age": 28,
            "gender": "Female",
            "conditions": [],
            "medications": [],
            "vitals": {"bp_systolic": 118, "bp_diastolic": 76, "hr": 68, "spo2": 99, "glucose": 88, "weight": 62.0, "height": 168},
            "timeline": ["Annual physical - Normal"],
            "reports": ["CBC - Normal", "Lipid Panel - Optimal"],
            "labs": {"hba1c": 5.2, "cholesterol": 175, "creatinine": 0.8},
            "twin_state": {"cardiovascular": "optimal", "metabolic": "optimal", "renal": "optimal"},
            "memory": {"allergies": [], "diet": "balanced"},
            "goals": ["Maintain 10,000 steps daily", "Hydration 2.5L"]
        },
        "type2_diabetes": {
            "name": "Type 2 Diabetes",
            "age": 54,
            "gender": "Male",
            "conditions": ["Type 2 Diabetes Mellitus", "Dyslipidemia"],
            "medications": [
                {"name": "Metformin", "dose": "500mg", "frequency": "twice daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 128, "bp_diastolic": 82, "hr": 72, "spo2": 98, "glucose": 142, "weight": 84.5, "height": 175},
            "timeline": ["Endocrinology consult", "Eye exam - Clear"],
            "reports": ["Comprehensive Metabolic Panel", "HbA1c Report"],
            "labs": {"hba1c": 7.4, "cholesterol": 215, "glucose_fasting": 138, "creatinine": 1.0},
            "twin_state": {"cardiovascular": "mild_strain", "metabolic": "impaired", "renal": "normal"},
            "memory": {"allergies": ["Penicillin"], "diet": "low-carb"},
            "goals": ["HbA1c < 7.0%", "30 min post-meal walk"]
        },
        "hypertension": {
            "name": "Hypertension",
            "age": 61,
            "gender": "Female",
            "conditions": ["Essential Hypertension", "Mild Hypercholesterolemia"],
            "medications": [
                {"name": "Lisinopril", "dose": "10mg", "frequency": "once daily", "time": "09:00"}
            ],
            "vitals": {"bp_systolic": 144, "bp_diastolic": 92, "hr": 78, "spo2": 97, "glucose": 95, "weight": 73.0, "height": 162},
            "timeline": ["Cardiology follow-up", "BP log review"],
            "reports": ["Lipid Panel", "ECG Normal Sinus"],
            "labs": {"hba1c": 5.5, "cholesterol": 230, "ldl": 145, "hdl": 48},
            "twin_state": {"cardiovascular": "elevated_pressure", "metabolic": "normal", "renal": "normal"},
            "memory": {"allergies": [], "diet": "DASH diet"},
            "goals": ["BP < 130/80 mmHg", "Reduce daily sodium < 2000mg"]
        },
        "ckd_stage3": {
            "name": "CKD Stage 3",
            "age": 67,
            "gender": "Male",
            "conditions": ["Chronic Kidney Disease Stage 3a", "Hypertension"],
            "medications": [
                {"name": "Losartan", "dose": "50mg", "frequency": "once daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 134, "bp_diastolic": 84, "hr": 70, "spo2": 97, "glucose": 102, "weight": 78.0, "height": 172},
            "timeline": ["Nephrology follow-up", "eGFR monitoring"],
            "reports": ["Renal Panel", "Urine Protein/Creatinine Ratio"],
            "labs": {"egfr": 52, "creatinine": 1.6, "bun": 26, "potassium": 4.6},
            "twin_state": {"cardiovascular": "mild_strain", "metabolic": "normal", "renal": "stage_3_impairment"},
            "memory": {"allergies": ["NSAIDs"], "diet": "low-protein, low-potassium"},
            "goals": ["Preserve eGFR > 50", "Avoid NSAIDs"]
        },
        "asthma": {
            "name": "Asthma",
            "age": 22,
            "gender": "Female",
            "conditions": ["Moderate Persistent Asthma", "Seasonal Allergies"],
            "medications": [
                {"name": "Albuterol Inhaler", "dose": "90mcg", "frequency": "as needed", "time": "PRN"},
                {"name": "Fluticasone", "dose": "110mcg", "frequency": "twice daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 116, "bp_diastolic": 74, "hr": 82, "spo2": 96, "glucose": 90, "weight": 58.0, "height": 165},
            "timeline": ["Pulmonology visit", "Peak Flow monitoring"],
            "reports": ["Spirometry Test", "Allergy Panel"],
            "labs": {"fev1": 82, "ige": 210},
            "twin_state": {"pulmonary": "airway_reactivity", "cardiovascular": "normal", "metabolic": "normal"},
            "memory": {"allergies": ["Dust mites", "Pollen"], "diet": "normal"},
            "goals": ["Maintain peak flow > 80%", "Zero emergency room visits"]
        },
        "pregnancy": {
            "name": "Pregnancy",
            "age": 31,
            "gender": "Female",
            "conditions": ["Pregnancy 24 Weeks", "Gestational Anemia"],
            "medications": [
                {"name": "Prenatal Multivitamin", "dose": "1 Tablet", "frequency": "once daily", "time": "09:00"},
                {"name": "Ferrous Sulfate", "dose": "325mg", "frequency": "once daily", "time": "12:00"}
            ],
            "vitals": {"bp_systolic": 112, "bp_diastolic": 70, "hr": 84, "spo2": 99, "glucose": 86, "weight": 69.5, "height": 166},
            "timeline": ["OB/GYN Ultrasound 20W", "Glucose Tolerance Test"],
            "reports": ["Obstetric Ultrasound", "CBC Hemoglobin 10.8"],
            "labs": {"hemoglobin": 10.8, "ferritin": 14, "gtt_1hr": 125},
            "twin_state": {"cardiovascular": "increased_cardiac_output", "metabolic": "gestational_adaptation", "fetal": "normal_growth"},
            "memory": {"allergies": [], "diet": "prenatal nutrition"},
            "goals": ["Iron supplementation intake", "Kick counts daily"]
        },
        "heart_failure": {
            "name": "Heart Failure",
            "age": 72,
            "gender": "Male",
            "conditions": ["Heart Failure (NYHA Class II)", "Coronary Artery Disease"],
            "medications": [
                {"name": "Carvedilol", "dose": "12.5mg", "frequency": "twice daily", "time": "08:00"},
                {"name": "Furosemide", "dose": "40mg", "frequency": "once daily morning", "time": "08:00"},
                {"name": "Entresto", "dose": "24/26mg", "frequency": "twice daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 110, "bp_diastolic": 68, "hr": 62, "spo2": 95, "glucose": 98, "weight": 82.0, "height": 178},
            "timeline": ["Echocardiogram LVEF 38%", "Cardiology Clinic"],
            "reports": ["Echocardiogram Report", "NT-proBNP Lab"],
            "labs": {"nt_probnp": 1150, "ef_percentage": 38, "potassium": 4.2},
            "twin_state": {"cardiovascular": "reduced_ejection_fraction", "fluid": "mild_retention", "renal": "perfused"},
            "memory": {"allergies": ["Sulfa"], "diet": "low-sodium < 1500mg"},
            "goals": ["Daily morning weight monitoring", "Sodium < 1.5g/day"]
        },
        "copd": {
            "name": "COPD",
            "age": 69,
            "gender": "Male",
            "conditions": ["Chronic Obstructive Pulmonary Disease (GOLD II)", "Chronic Bronchitis"],
            "medications": [
                {"name": "Spiriva Respimat", "dose": "2.5mcg", "frequency": "once daily", "time": "08:00"},
                {"name": "Symbicort", "dose": "160/4.5mcg", "frequency": "twice daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 126, "bp_diastolic": 78, "hr": 76, "spo2": 93, "glucose": 92, "weight": 71.0, "height": 170},
            "timeline": ["Pulmonary Rehab", "Spirometry"],
            "reports": ["PFT Spirometry", "Chest X-Ray"],
            "labs": {"fev1_fvc_ratio": 62, "pao2": 72},
            "twin_state": {"pulmonary": "airflow_limitation", "cardiovascular": "stable"},
            "memory": {"allergies": [], "diet": "high-calorie"},
            "goals": ["SpO2 >= 92%", "30 min walking daily"]
        },
        "obesity": {
            "name": "Obesity",
            "age": 41,
            "gender": "Female",
            "conditions": ["Class II Obesity (BMI 36.5)", "Prediabetes"],
            "medications": [],
            "vitals": {"bp_systolic": 126, "bp_diastolic": 80, "hr": 74, "spo2": 98, "glucose": 108, "weight": 98.0, "height": 164},
            "timeline": ["Nutritionist Consultation", "Bariatric Evaluation"],
            "reports": ["Lipid Panel", "Fasting Blood Glucose"],
            "labs": {"bmi": 36.4, "hba1c": 5.9, "triglycerides": 195},
            "twin_state": {"metabolic": "caloric_excess", "cardiovascular": "normal_load"},
            "memory": {"allergies": [], "diet": "caloric deficit 1800kcal"},
            "goals": ["5% weight loss over 3 months", "Log food daily"]
        },
        "polypharmacy": {
            "name": "Polypharmacy",
            "age": 79,
            "gender": "Female",
            "conditions": ["Hypertension", "Osteoarthritis", "GERD", "Insomnia", "Type 2 Diabetes"],
            "medications": [
                {"name": "Amlodipine", "dose": "5mg", "frequency": "once daily", "time": "08:00"},
                {"name": "Metformin", "dose": "500mg", "frequency": "twice daily", "time": "08:00"},
                {"name": "Omeprazole", "dose": "20mg", "frequency": "once daily morning", "time": "07:30"},
                {"name": "Acetaminophen", "dose": "500mg", "frequency": "as needed", "time": "PRN"},
                {"name": "Melatonin", "dose": "3mg", "frequency": "nightly", "time": "21:30"}
            ],
            "vitals": {"bp_systolic": 128, "bp_diastolic": 76, "hr": 68, "spo2": 96, "glucose": 115, "weight": 64.0, "height": 158},
            "timeline": ["Geriatric Medication Reconciliation", "Primary Care Visit"],
            "reports": ["Full Pharmacy Reconciliation", "Comprehensive Metabolic Panel"],
            "labs": {"creatinine": 1.1, "alt": 22, "ast": 24},
            "twin_state": {"metabolic": "polypharmacy_monitored", "hepatic": "normal"},
            "memory": {"allergies": ["Codeine"], "diet": "soft diet"},
            "goals": ["100% medication adherence", "Pill organizer verification"]
        },
        "pediatric": {
            "name": "Pediatric",
            "age": 9,
            "gender": "Male",
            "conditions": ["Pediatric Mild Intermittent Asthma"],
            "medications": [
                {"name": "Albuterol Pediatric Inhaler", "dose": "90mcg", "frequency": "as needed", "time": "PRN"}
            ],
            "vitals": {"bp_systolic": 102, "bp_diastolic": 64, "hr": 88, "spo2": 99, "glucose": 84, "weight": 31.0, "height": 134},
            "timeline": ["Pediatric Wellness Exam", "School Asthma Action Plan"],
            "reports": ["Pediatric Growth Chart", "Asthma Action Plan"],
            "labs": {"igE": 85},
            "twin_state": {"pediatric_growth": "normal_95th_percentile", "pulmonary": "intermittent_bronchospasm"},
            "memory": {"allergies": ["Peanuts"], "diet": "peanut-free"},
            "goals": ["Spacer use with inhaler", "Active outdoor play"]
        },
        "older_adult": {
            "name": "Older Adult",
            "age": 85,
            "gender": "Male",
            "conditions": ["Mild Cognitive Impairment", "Benign Prostatic Hyperplasia", "Osteopenia"],
            "medications": [
                {"name": "Donepezil", "dose": "5mg", "frequency": "nightly", "time": "21:00"},
                {"name": "Tamsulosin", "dose": "0.4mg", "frequency": "once daily", "time": "20:00"},
                {"name": "Calcium + Vitamin D3", "dose": "600mg/400IU", "frequency": "twice daily", "time": "08:00"}
            ],
            "vitals": {"bp_systolic": 122, "bp_diastolic": 72, "hr": 64, "spo2": 96, "glucose": 94, "weight": 70.0, "height": 168},
            "timeline": ["Geriatrician Assessment", "DXA Bone Density Scan"],
            "reports": ["MoCA Cognitive Assessment Score 23/30", "DXA Scan T-Score -1.8"],
            "labs": {"vitamin_d": 32, "psa": 2.4, "t_score": -1.8},
            "twin_state": {"neurological": "mild_mca", "bone": "osteopenia", "cardiovascular": "normal"},
            "memory": {"allergies": [], "diet": "Mediterranean diet"},
            "goals": ["Caregiver-assisted pill logging", "Fall prevention exercises"]
        }
    }

    @classmethod
    def get_persona(cls, persona_id: str) -> Dict[str, Any]:
        """Retrieve persona dictionary by key or fallback to healthy adult."""
        return cls.PERSONAS.get(persona_id.lower(), cls.PERSONAS["healthy_adult"])

    @classmethod
    def list_persona_ids(cls) -> List[str]:
        """Return all available persona IDs."""
        return list(cls.PERSONAS.keys())
