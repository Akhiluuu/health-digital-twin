"""
healthbot_v4/apps/brain/normalization/normalizer.py
Clinical Normalization Subsystem for LOINC, RxNorm, and SNOMED-CT.
"""

from typing import Optional
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import NormalizedLab, NormalizedMedication


class ClinicalNormalizer(HealthBrainSubsystem):
    """Normalizes raw vitals, labs, and medications to standard clinical codes."""

    def __init__(self):
        super().__init__("clinical_normalization")

    async def initialize(self) -> None:
        logger.info("🔬 Clinical Normalization Engine initialized")

    def normalize_lab(self, raw_name: str, val: float, unit: str) -> NormalizedLab:
        name_lower = raw_name.lower()
        if "hba1c" in name_lower:
            loinc = "4548-4"
            canonical = "HbA1c (Glycated Hemoglobin)"
            classification = "high" if val >= 6.5 else "normal"
        elif "fasting blood sugar" in name_lower or "glucose" in name_lower:
            loinc = "1558-6"
            canonical = "Fasting Blood Glucose"
            classification = "high" if val >= 100.0 else "normal"
        else:
            loinc = "9999-9"
            canonical = raw_name.title()
            classification = "normal"

        return NormalizedLab(
            canonical_name=canonical,
            loinc_code=loinc,
            value=val,
            unit=unit,
            classification=classification,
        )

    def normalize_medication(self, raw_name: str, dose: float, freq: str) -> NormalizedMedication:
        name_lower = raw_name.lower()
        if "metformin" in name_lower:
            rxnorm = "6809"
            canonical = "Metformin"
        elif "lisinopril" in name_lower:
            rxnorm = "29046"
            canonical = "Lisinopril"
        else:
            rxnorm = "000000"
            canonical = raw_name.title()

        return NormalizedMedication(
            name=canonical,
            rxnorm_code=rxnorm,
            dose_quantity=dose,
            dosage_form="mg",
            frequency=freq,
        )
