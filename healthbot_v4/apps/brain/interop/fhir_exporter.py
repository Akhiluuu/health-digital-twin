"""
healthbot_v4/apps/brain/interop/fhir_exporter.py
HL7 FHIR R4 Hospital EMR Interoperability Exporter for VitalHealth v5.0 Health Brain.
Converts patient state, labs (LOINC), meds (RxNorm), vitals, and AI CarePlans
into standard FHIR R4 JSON bundles compatible with Epic, Cerner, and hospital EMRs.
"""

import time
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.models.base import PatientState
from healthbot_v4.shared.logger.logger import logger


class FHIRR4Exporter(HealthBrainSubsystem):
    """
    HL7 FHIR R4 Hospital EMR Exporter.
    Generates standard FHIR R4 JSON bundles for hospital interoperability.
    """

    def __init__(self):
        super().__init__("fhir_r4_exporter")
        self.bundles_exported: int = 0

    async def initialize(self) -> None:
        logger.info("🏥 HL7 FHIR R4 Hospital EMR Exporter initialized (Epic & Cerner R4 standard)")

    def export_patient_bundle(
        self,
        state: PatientState,
        care_plan_actions: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Converts PatientState into a valid HL7 FHIR R4 Bundle.
        """
        start = time.time()
        pid = state.patient_id
        now_iso = datetime.now(timezone.utc).isoformat()

        sex_val = getattr(state.profile, "biological_sex", "unknown")
        gender_str = sex_val.value if hasattr(sex_val, "value") and not isinstance(sex_val, str) else str(sex_val)

        # 1. FHIR Patient Resource
        patient_resource = {
            "resourceType": "Patient",
            "id": pid,
            "identifier": [
                {
                    "system": "urn:oid:2.16.840.1.113883.4.1",
                    "value": pid
                }
            ],
            "active": True,
            "name": [
                {
                    "use": "official",
                    "family": "Patient",
                    "given": [pid]
                }
            ],
            "gender": gender_str
        }

        entries = [
            {
                "fullUrl": f"urn:uuid:patient-{pid}",
                "resource": patient_resource
            }
        ]

        # 2. FHIR Observations (Labs)
        for idx, lab in enumerate(state.recent_labs):
            lab_id = getattr(lab, "lab_id", f"lab_{idx}")
            lab_name = getattr(lab, "lab_name", getattr(lab, "canonical_name", "Lab"))
            loinc = getattr(lab, "loinc_code", "4548-4") or "4548-4"

            obs = {
                "resourceType": "Observation",
                "id": f"obs-{lab_id}",
                "status": "final",
                "category": [
                    {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                "code": "laboratory",
                                "display": "Laboratory"
                            }
                        ]
                    }
                ],
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": loinc,
                            "display": lab_name
                        }
                    ],
                    "text": lab_name
                },
                "subject": {"reference": f"Patient/{pid}"},
                "valueQuantity": {
                    "value": lab.value,
                    "unit": lab.unit,
                    "system": "http://unitsofmeasure.org",
                    "code": lab.unit
                },
                "effectiveDateTime": lab.timestamp.isoformat() if hasattr(lab.timestamp, "isoformat") else str(lab.timestamp)
            }
            entries.append({"fullUrl": f"urn:uuid:obs-{lab_id}", "resource": obs})

        # 3. FHIR MedicationStatements
        for idx, med in enumerate(state.active_medications):
            med_id = getattr(med, "med_id", f"med_{idx}")
            med_name = getattr(med, "name", getattr(med, "med_name", "Medication"))
            rxnorm = getattr(med, "rxnorm_code", "6809") or "6809"

            med_stmt = {
                "resourceType": "MedicationStatement",
                "id": f"med-{med_id}",
                "status": "active",
                "medicationCodeableConcept": {
                    "coding": [
                        {
                            "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                            "code": rxnorm,
                            "display": med_name
                        }
                    ],
                    "text": med_name
                },
                "subject": {"reference": f"Patient/{pid}"},
                "dosage": [
                    {
                        "text": f"{getattr(med, 'dose_quantity', '')} {getattr(med, 'dosage_form', '')} {getattr(med, 'frequency', '')}".strip()
                    }
                ]
            }
            entries.append({"fullUrl": f"urn:uuid:med-{med_id}", "resource": med_stmt})

        # 4. FHIR CarePlan (AI Proactive Action Items)
        if care_plan_actions:
            activities = []
            for act in care_plan_actions:
                activities.append({
                    "detail": {
                        "category": {
                            "coding": [
                                {
                                    "system": "http://hl7.org/fhir/care-plan-activity-category",
                                    "code": act.get("category", "other"),
                                    "display": act.get("title", "Action Item")
                                }
                            ]
                        },
                        "description": act.get("description", ""),
                        "status": "in-progress"
                    }
                })

            care_plan = {
                "resourceType": "CarePlan",
                "id": f"careplan-{pid}",
                "status": "active",
                "intent": "plan",
                "subject": {"reference": f"Patient/{pid}"},
                "title": "VitalHealth AI Clinical CarePlan",
                "period": {"start": now_iso},
                "activity": activities
            }
            entries.append({"fullUrl": f"urn:uuid:careplan-{pid}", "resource": care_plan})

        # FHIR R4 Bundle Construction
        bundle = {
            "resourceType": "Bundle",
            "id": f"bundle-vitalhealth-{pid}",
            "type": "collection",
            "timestamp": now_iso,
            "total": len(entries),
            "entry": entries
        }

        self.bundles_exported += 1
        elapsed_ms = (time.time() - start) * 1000.0
        logger.info(f"🏥 Exported FHIR R4 Bundle ({len(entries)} resources) for patient {pid} in {elapsed_ms:.2f}ms")

        return bundle

    def get_stats(self) -> Dict[str, Any]:
        """Returns FHIR Exporter telemetry."""
        return {
            "bundles_exported": self.bundles_exported,
            "fhir_version": "R4 (4.0.1)",
            "status": "ACTIVE_EMR_INTEROP"
        }
