"""
healthbot_v4/apps/ocr/engine/record_builder.py
Smart OCR Parsing Pipeline for VitalHealth v5.0.
Extracts clinical entities (labs, medications, conditions) from unstructured report text.
"""

import re
import uuid
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone
from pydantic import BaseModel, Field

from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import NormalizedLab, NormalizedMedication, NormalizedCondition


class StructuredMedicalRecord(BaseModel):
    record_id: str
    patient_id: str
    document_name: str
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    doctor_name: Optional[str] = None
    extracted_labs: List[NormalizedLab] = Field(default_factory=list)
    extracted_medications: List[NormalizedMedication] = Field(default_factory=list)
    extracted_conditions: List[NormalizedCondition] = Field(default_factory=list)
    page_count: int = 1
    processing_status: str = "COMPLETED"


_ocr_job_store: Dict[str, Dict[str, Any]] = {}


# ── Lab extraction patterns ─────────────────────────────────────────────────
# Format: (canonical_name, loinc_code, regex_pattern, unit, ref_range, high_threshold, low_threshold)
_LAB_PATTERNS: List[Tuple] = [
    # Glycaemic
    ("HbA1c (Glycated Hemoglobin)", "4548-4",
     r"(?:HbA1c|Glycated\s+H(?:ae|e)moglobin|A1C)[\s:]*(\d+\.?\d*)\s*%?", "%", "4.0-5.6%", 6.5, None),
    ("Fasting Blood Glucose", "1558-6",
     r"(?:Fasting\s+(?:Blood\s+)?(?:Glucose|Sugar|BS)|FBG)[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "70-99 mg/dL", 100, 70),
    ("Random Blood Glucose", "2345-7",
     r"(?:Random|Post-?\s*prandial|PP)\s*(?:Blood\s+)?(?:Glucose|Sugar|BS)[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "<140 mg/dL", 140, None),
    # CBC
    ("Hemoglobin", "718-7",
     r"H(?:ae|e)moglobin[\s:]*(\d+\.?\d*)\s*(?:g/dL)?", "g/dL", "13.5-17.5 g/dL", 17.5, 13.5),
    ("WBC Count", "6690-2",
     r"(?:WBC|White\s+Blood\s+(?:Cell|Count))[\s:]*(\d+\.?\d*)\s*(?:k/uL|×10³/μL|10\^3)?", "k/uL", "4.5-11.0 k/uL", 11.0, 4.5),
    ("Platelet Count", "777-3",
     r"(?:Platelet|PLT)[\s:]*(\d+\.?\d*)\s*(?:k/uL|×10³|lakh)?", "k/uL", "150-400 k/uL", 400, 150),
    ("RBC Count", "789-8",
     r"RBC[\s:]*(\d+\.?\d*)\s*(?:M/uL|million)?", "M/uL", "4.5-5.9 M/uL", 5.9, 4.5),
    ("Hematocrit", "4544-3",
     r"(?:Hematocrit|HCT|PCV)[\s:]*(\d+\.?\d*)\s*%?", "%", "41-53%", 53, 41),
    ("MCV", "787-2",
     r"MCV[\s:]*(\d+\.?\d*)\s*(?:fL)?", "fL", "80-100 fL", 100, 80),
    # Lipid panel
    ("Total Cholesterol", "2093-3",
     r"(?:Total\s+)?Cholesterol[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "<200 mg/dL", 200, None),
    ("LDL Cholesterol", "13457-7",
     r"(?:LDL|LDL-C|Low\s+Density\s+Lipoprotein)[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "<100 mg/dL", 100, None),
    ("HDL Cholesterol", "2085-9",
     r"(?:HDL|HDL-C|High\s+Density\s+Lipoprotein)[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", ">40 mg/dL", None, 40),
    ("Triglycerides", "2571-8",
     r"Triglyceride[s]?[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "<150 mg/dL", 150, None),
    # Renal
    ("Creatinine", "2160-0",
     r"(?:Serum\s+)?Creatinine[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "0.7-1.2 mg/dL", 1.2, 0.7),
    ("Blood Urea Nitrogen", "3094-0",
     r"(?:BUN|Blood\s+Urea\s+Nitrogen|Urea)[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "7-25 mg/dL", 25, 7),
    ("eGFR", "33914-3",
     r"(?:eGFR|Estimated\s+GFR|GFR)[\s:]*(\d+\.?\d*)\s*(?:mL/min)?", "mL/min/1.73m²", ">60", None, 60),
    # Liver
    ("ALT", "1742-6",
     r"(?:ALT|SGPT|Alanine\s+Aminotransferase)[\s:]*(\d+\.?\d*)\s*(?:U/L|IU/L)?", "U/L", "7-56 U/L", 56, None),
    ("AST", "1920-8",
     r"(?:AST|SGOT|Aspartate\s+Aminotransferase)[\s:]*(\d+\.?\d*)\s*(?:U/L|IU/L)?", "U/L", "10-40 U/L", 40, None),
    ("Alkaline Phosphatase", "6768-6",
     r"(?:ALP|Alkaline\s+Phosphatase)[\s:]*(\d+\.?\d*)\s*(?:U/L)?", "U/L", "44-147 U/L", 147, 44),
    ("Total Bilirubin", "1975-2",
     r"Total\s+Bilirubin[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "0.1-1.2 mg/dL", 1.2, None),
    # Thyroid
    ("TSH", "3016-3",
     r"TSH[\s:]*(\d+\.?\d*)\s*(?:mIU/L|uIU/mL)?", "mIU/L", "0.4-4.0 mIU/L", 4.0, 0.4),
    ("T3", "3051-0",
     r"\bT3\b[\s:]*(\d+\.?\d*)\s*(?:ng/dL)?", "ng/dL", "80-200 ng/dL", 200, 80),
    ("T4", "3054-4",
     r"\bT4\b[\s:]*(\d+\.?\d*)\s*(?:μg/dL|ug/dL)?", "μg/dL", "5.0-12.0 μg/dL", 12.0, 5.0),
    # Electrolytes
    ("Sodium", "2951-2",
     r"(?:Sodium|Na\+?)[\s:]*(\d+\.?\d*)\s*(?:mEq/L|mmol/L)?", "mEq/L", "136-145 mEq/L", 145, 136),
    ("Potassium", "2823-3",
     r"(?:Potassium|K\+?)[\s:]*(\d+\.?\d*)\s*(?:mEq/L|mmol/L)?", "mEq/L", "3.5-5.0 mEq/L", 5.0, 3.5),
    # Vitamins
    ("Vitamin D", "62292-8",
     r"(?:Vitamin\s+D|25-OH\s+Vitamin)[\s:]*(\d+\.?\d*)\s*(?:ng/mL)?", "ng/mL", "30-100 ng/mL", 100, 30),
    ("Vitamin B12", "2132-9",
     r"(?:Vitamin\s+B12|B12)[\s:]*(\d+\.?\d*)\s*(?:pg/mL)?", "pg/mL", "200-900 pg/mL", 900, 200),
    # Iron studies
    ("Serum Iron", "2498-4",
     r"(?:Serum\s+)?Iron[\s:]*(\d+\.?\d*)\s*(?:μg/dL|mcg/dL)?", "μg/dL", "60-170 μg/dL", 170, 60),
    ("Ferritin", "2276-4",
     r"Ferritin[\s:]*(\d+\.?\d*)\s*(?:ng/mL)?", "ng/mL", "12-300 ng/mL", 300, 12),
    # Blood pressure (special case — stored as lab for context)
    ("Systolic Blood Pressure", "8480-6",
     r"(?:BP|Blood\s+Pressure)[\s:]*(\d{2,3})/\d{2,3}\s*(?:mmHg)?", "mmHg", "90-120 mmHg", 140, 90),
    ("Diastolic Blood Pressure", "8462-4",
     r"(?:BP|Blood\s+Pressure)[\s:]*\d{2,3}/(\d{2,3})\s*(?:mmHg)?", "mmHg", "60-80 mmHg", 90, 60),
    # Uric Acid
    ("Uric Acid", "3084-1",
     r"Uric\s+Acid[\s:]*(\d+\.?\d*)\s*(?:mg/dL)?", "mg/dL", "3.5-7.2 mg/dL", 7.2, 3.5),
    # PSA
    ("PSA", "10508-0",
     r"PSA[\s:]*(\d+\.?\d*)\s*(?:ng/mL)?", "ng/mL", "<4.0 ng/mL", 4.0, None),
]

# ── Medication patterns ─────────────────────────────────────────────────────
_MED_PATTERNS = [
    ("Metformin", "6809"),
    ("Lisinopril", "29046"),
    ("Atorvastatin", "83367"),
    ("Amlodipine", "17767"),
    ("Aspirin", "1191"),
    ("Losartan", "202421"),
    ("Omeprazole", "7646"),
    ("Pantoprazole", "40790"),
    ("Glimepiride", "25789"),
    ("Glipizide", "4815"),
    ("Empagliflozin", "1545653"),
    ("Levothyroxine", "10582"),
    ("Insulin", "5856"),
    ("Rosuvastatin", "301542"),
    ("Telmisartan", "73494"),
    ("Bisoprolol", "19484"),
    ("Carvedilol", "20352"),
    ("Furosemide", "4603"),
    ("Spironolactone", "9997"),
    ("Warfarin", "11289"),
    ("Clopidogrel", "32968"),
    ("Amoxicillin", "723"),
    ("Azithromycin", "18631"),
    ("Ciprofloxacin", "2551"),
    ("Doxycycline", "3640"),
    ("Prednisolone", "8638"),
    ("Paracetamol", "161"),
    ("Ibuprofen", "5640"),
    ("Pantoprazole", "40790"),
    ("Cetirizine", "20480"),
]

# ── Condition patterns ──────────────────────────────────────────────────────
_CONDITION_PATTERNS = [
    (r"type\s*[12]\s*diabet", "Diabetes Mellitus"),
    (r"hypertension|high\s+blood\s+pressure", "Hypertension"),
    (r"hypothyroid", "Hypothyroidism"),
    (r"hyperthyroid", "Hyperthyroidism"),
    (r"coronary\s+artery|CAD", "Coronary Artery Disease"),
    (r"chronic\s+kidney|CKD", "Chronic Kidney Disease"),
    (r"anaemia|anemia", "Anaemia"),
    (r"dyslipidaemia|dyslipidemia|hypercholesterol", "Dyslipidaemia"),
    (r"obesity|obese", "Obesity"),
    (r"asthma", "Asthma"),
    (r"COPD|chronic\s+obstructive", "COPD"),
    (r"fatty\s+liver|NAFLD", "Non-Alcoholic Fatty Liver Disease"),
    (r"osteoporosis", "Osteoporosis"),
    (r"vitamin\s+D\s+deficien", "Vitamin D Deficiency"),
    (r"vitamin\s+B12\s+deficien", "Vitamin B12 Deficiency"),
    (r"iron\s+deficien|IDA", "Iron Deficiency Anaemia"),
]


class SmartOCRPipeline:
    """Multi-stage OCR parsing engine — handles comprehensive full-body lab reports."""

    def submit_async_ocr_job(self, patient_id: str, document_name: str, raw_text: str) -> str:
        job_id = f"ocr_job_{uuid.uuid4().hex[:8]}"
        _ocr_job_store[job_id] = {
            "job_id": job_id, "patient_id": patient_id,
            "document_name": document_name, "status": "PROCESSING",
            "progress_pct": 10.0,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "result": None,
        }
        return job_id

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        return _ocr_job_store.get(job_id, {"job_id": job_id, "status": "NOT_FOUND", "progress_pct": 0.0})

    def process_raw_text(self, patient_id: str, raw_text: str, document_name: str = "doc.pdf") -> StructuredMedicalRecord:
        logger.info(f"SmartOCR processing '{document_name}' for patient {patient_id} ({len(raw_text)} chars)")

        pages = raw_text.split("---PAGE---") if "---PAGE---" in raw_text else [raw_text]
        page_count = max(1, len(pages))

        doctor_match = re.search(r"(?:Doctor|Physician|Dr\.?)[\s:]+([A-Z][a-zA-Z\s\.]+)", raw_text)
        doctor_name = doctor_match.group(1).strip() if doctor_match else "Unknown Physician"

        extracted_labs = self._extract_labs(patient_id, raw_text)
        extracted_meds = self._extract_medications(raw_text)
        extracted_conds = self._extract_conditions(raw_text)

        logger.info(
            f"SmartOCR result: {len(extracted_labs)} labs, "
            f"{len(extracted_meds)} meds, {len(extracted_conds)} conditions "
            f"from '{document_name}' ({page_count} pages)"
        )

        return StructuredMedicalRecord(
            record_id=f"rec_{uuid.uuid4().hex[:10]}",
            patient_id=patient_id,
            document_name=document_name,
            doctor_name=doctor_name,
            extracted_labs=extracted_labs,
            extracted_medications=extracted_meds,
            extracted_conditions=extracted_conds,
            page_count=page_count,
            processing_status="COMPLETED",
        )

    def _extract_labs(self, patient_id: str, text: str) -> List[NormalizedLab]:
        labs = []
        seen = set()
        for canonical_name, loinc, pattern, unit, ref_range, high_thresh, low_thresh in _LAB_PATTERNS:
            try:
                match = re.search(pattern, text, re.IGNORECASE)
                if match and canonical_name not in seen:
                    val = float(match.group(1))
                    if high_thresh and low_thresh:
                        classification = "High" if val > high_thresh else ("Low" if val < low_thresh else "Normal")
                    elif high_thresh:
                        classification = "High" if val > high_thresh else "Normal"
                    elif low_thresh:
                        classification = "Low" if val < low_thresh else "Normal"
                    else:
                        classification = "Normal"
                    labs.append(NormalizedLab(
                        canonical_name=canonical_name,
                        loinc_code=loinc,
                        value=val,
                        unit=unit,
                        reference_range=ref_range,
                        classification=classification,
                        timestamp=datetime.now(timezone.utc),
                    ))
                    seen.add(canonical_name)
            except (ValueError, AttributeError):
                pass
        return labs

    def _extract_medications(self, text: str) -> List[NormalizedMedication]:
        meds = []
        seen = set()
        for med_name, rxnorm in _MED_PATTERNS:
            if med_name.lower() not in seen and re.search(med_name, text, re.IGNORECASE):
                dose_match = re.search(rf"{med_name}\s*(\d+)\s*mg", text, re.IGNORECASE)
                dose = float(dose_match.group(1)) if dose_match else 500.0
                freq_match = re.search(
                    rf"{med_name}[^.{{}}]*?(once|twice|thrice|daily|BD|TDS|OD|SOS|weekly)",
                    text, re.IGNORECASE
                )
                freq = freq_match.group(1) if freq_match else "daily"
                meds.append(NormalizedMedication(
                    name=med_name, rxnorm_code=rxnorm,
                    dose_quantity=dose, dosage_form=f"{int(dose)}mg",
                    frequency=freq, is_active=True,
                ))
                seen.add(med_name.lower())
        return meds

    def _extract_conditions(self, text: str) -> List[NormalizedCondition]:
        conditions = []
        seen = set()
        for pattern, condition_name in _CONDITION_PATTERNS:
            if condition_name not in seen and re.search(pattern, text, re.IGNORECASE):
                conditions.append(NormalizedCondition(
                    condition_name=condition_name,
                    icd10_code="Z99",
                    status="active",
                ))
                seen.add(condition_name)
        return conditions
