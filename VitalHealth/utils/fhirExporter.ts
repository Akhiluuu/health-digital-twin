// utils/fhirExporter.ts
// HL7 FHIR R4 Standard Clinical Data Bundle Exporter
// Generates standardized FHIR R4 JSON resources for seamless integration into EHR systems (Epic, Cerner, Allscripts).

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SummaryDataPayload } from './doctorSummaryPdfBuilder';
import { log } from './logger';

export interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: any;
}

export interface FHIRBundleEntry {
  fullUrl: string;
  resource: FHIRResource;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  id: string;
  meta: {
    lastUpdated: string;
    profile: string[];
  };
  type: 'collection' | 'document';
  timestamp: string;
  identifier: {
    system: string;
    value: string;
  };
  total: number;
  entry: FHIRBundleEntry[];
}

/**
 * Standard LOINC Codes for Vitals & Labs
 */
const LOINC_CODES = {
  HEART_RATE: { code: '8867-4', display: 'Heart rate', unit: 'bpm', system: 'http://loinc.org' },
  SYSTOLIC_BP: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', system: 'http://loinc.org' },
  DIASTOLIC_BP: { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', system: 'http://loinc.org' },
  OXYGEN_SAT: { code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry', unit: '%', system: 'http://loinc.org' },
  BLOOD_GLUCOSE: { code: '2339-0', display: 'Glucose [Mass/volume] in Blood', unit: 'mg/dL', system: 'http://loinc.org' },
  BODY_WEIGHT: { code: '29463-7', display: 'Body weight', unit: 'kg', system: 'http://loinc.org' },
  CARDIAC_OUTPUT: { code: '8738-9', display: 'Cardiac output', unit: 'L/min', system: 'http://loinc.org' },
  RESPIRATION_RATE: { code: '9279-1', display: 'Respiratory rate', unit: '/min', system: 'http://loinc.org' },
};

/**
 * Builds an HL7 FHIR R4 Bundle from VitalHealth Summary Payload
 */
export function buildFhirR4Bundle(data: SummaryDataPayload): FHIRBundle {
  const timestamp = new Date().toISOString();
  const bundleId = `urn:uuid:vth-bundle-${Math.random().toString(36).substring(2, 10)}`;
  const patientId = data.patient.mrn || `vth-patient-${Math.random().toString(36).substring(2, 8)}`;
  const patientRef = `Patient/${patientId}`;

  const entries: FHIRBundleEntry[] = [];

  // 1. Patient Resource
  const nameParts = (data.patient.fullName || 'Patient').split(' ');
  const familyName = nameParts.length > 1 ? nameParts.pop() || '' : nameParts[0] || 'Unknown';
  const givenNames = nameParts.length > 0 ? nameParts : ['Patient'];

  let genderCode: 'male' | 'female' | 'other' | 'unknown' = 'unknown';
  const gLower = (data.patient.gender || '').toLowerCase();
  if (gLower.includes('male')) genderCode = 'male';
  else if (gLower.includes('female')) genderCode = 'female';
  else if (gLower.includes('other')) genderCode = 'other';

  const patientResource: FHIRResource = {
    resourceType: 'Patient',
    id: patientId,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
    },
    identifier: [
      {
        use: 'official',
        system: 'urn:oid:2.16.840.1.113883.2.4.6.3',
        value: data.patient.mrn,
      },
    ],
    active: true,
    name: [
      {
        use: 'official',
        family: familyName,
        given: givenNames,
        text: data.patient.fullName,
      },
    ],
    gender: genderCode,
    birthDate: data.patient.dob !== 'Not Recorded' ? data.patient.dob : undefined,
    telecom: [
      {
        system: 'phone',
        value: data.patient.phone,
        use: 'mobile',
      },
    ],
    contact: data.patient.emergencyContact !== 'Not Recorded' ? [
      {
        relationship: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'C',
                display: 'Emergency Contact',
              },
            ],
          },
        ],
        name: {
          text: data.patient.emergencyContact,
        },
      },
    ] : undefined,
    generalPractitioner: [
      {
        display: data.patient.primaryDoctor,
      },
    ],
  };

  entries.push({
    fullUrl: `urn:uuid:${patientId}`,
    resource: patientResource,
  });

  // 2. MedicationStatement Resources
  (data.medications || []).forEach((med, idx) => {
    const medId = `med-statement-${idx + 1}`;
    const medResource: FHIRResource = {
      resourceType: 'MedicationStatement',
      id: medId,
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/MedicationStatement'],
      },
      status: med.status.toLowerCase().includes('active') ? 'active' : 'completed',
      category: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/medication-statement-category',
            code: 'community',
            display: 'Community',
          },
        ],
      },
      medicationCodeableConcept: {
        text: med.name,
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            display: med.generic || med.brand || med.name,
          },
        ],
      },
      subject: {
        reference: patientRef,
        display: data.patient.fullName,
      },
      effectiveDateTime: timestamp,
      dateAsserted: timestamp,
      informationSource: {
        reference: patientRef,
        display: data.patient.fullName,
      },
      dosage: [
        {
          text: `${med.dose} - ${med.frequency}`,
          timing: {
            repeat: {
              frequency: med.frequency.toLowerCase().includes('twice') ? 2 : 1,
              period: 1,
              periodUnit: 'd',
            },
          },
        },
      ],
      note: [
        {
          text: `Prescriber: ${med.doctor} | Purpose: ${med.purpose} | 30-Day Adherence: ${med.adherencePct}% | Remaining Pills: ${med.inventoryCount}`,
        },
      ],
    };

    entries.push({
      fullUrl: `urn:uuid:${medId}`,
      resource: medResource,
    });
  });

  // 3. Observation Resources (Vitals & Biomarkers)
  const addObservation = (
    obsId: string,
    loinc: typeof LOINC_CODES['HEART_RATE'],
    value: number | null | undefined,
    statusText?: string
  ) => {
    if (value === null || value === undefined || value <= 0) return;

    const obsResource: FHIRResource = {
      resourceType: 'Observation',
      id: obsId,
      meta: {
        profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
      },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: loinc.system,
            code: loinc.code,
            display: loinc.display,
          },
        ],
        text: loinc.display,
      },
      subject: {
        reference: patientRef,
        display: data.patient.fullName,
      },
      effectiveDateTime: timestamp,
      valueQuantity: {
        value: value,
        unit: loinc.unit,
        system: 'http://unitsofmeasure.org',
        code: loinc.unit,
      },
      note: statusText ? [{ text: statusText }] : undefined,
    };

    entries.push({
      fullUrl: `urn:uuid:${obsId}`,
      resource: obsResource,
    });
  };

  // Add individual vital observations
  if (data.vitals) {
    addObservation('obs-hr', LOINC_CODES.HEART_RATE, data.vitals.heartRate?.avg, data.vitals.heartRate?.status);
    addObservation('obs-spo2', LOINC_CODES.OXYGEN_SAT, data.vitals.spO2?.avg, data.vitals.spO2?.status);
    addObservation('obs-glucose', LOINC_CODES.BLOOD_GLUCOSE, data.vitals.bloodGlucose?.avg, data.vitals.bloodGlucose?.status);
    addObservation('obs-weight', LOINC_CODES.BODY_WEIGHT, data.vitals.weight?.current);

    // Blood Pressure Panel
    if (data.vitals.bloodPressure && data.vitals.bloodPressure.sys > 0) {
      const bpObsResource: FHIRResource = {
        resourceType: 'Observation',
        id: 'obs-bp-panel',
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '85354-9',
              display: 'Blood pressure panel with all children optional',
            },
          ],
          text: 'Blood Pressure Panel',
        },
        subject: {
          reference: patientRef,
          display: data.patient.fullName,
        },
        effectiveDateTime: timestamp,
        component: [
          {
            code: {
              coding: [
                {
                  system: LOINC_CODES.SYSTOLIC_BP.system,
                  code: LOINC_CODES.SYSTOLIC_BP.code,
                  display: LOINC_CODES.SYSTOLIC_BP.display,
                },
              ],
            },
            valueQuantity: {
              value: data.vitals.bloodPressure.sys,
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
            },
          },
          {
            code: {
              coding: [
                {
                  system: LOINC_CODES.DIASTOLIC_BP.system,
                  code: LOINC_CODES.DIASTOLIC_BP.code,
                  display: LOINC_CODES.DIASTOLIC_BP.display,
                },
              ],
            },
            valueQuantity: {
              value: data.vitals.bloodPressure.dia,
              unit: 'mmHg',
              system: 'http://unitsofmeasure.org',
              code: 'mm[Hg]',
            },
          },
        ],
        note: [{ text: `Clinical Status: ${data.vitals.bloodPressure.status}` }],
      };

      entries.push({
        fullUrl: 'urn:uuid:obs-bp-panel',
        resource: bpObsResource,
      });
    }
  }

  // 4. Condition Resources (Symptoms)
  (data.symptoms || []).forEach((sym, idx) => {
    const condId = `condition-${idx + 1}`;
    const condResource: FHIRResource = {
      resourceType: 'Condition',
      id: condId,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: sym.status.toLowerCase().includes('active') ? 'active' : 'resolved',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'unconfirmed',
          },
        ],
      },
      severity: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: sym.severity >= 7 ? '24484000' : '6736007',
            display: sym.severity >= 7 ? 'Severe' : 'Moderate',
          },
        ],
        text: `Severity ${sym.severity}/10`,
      },
      code: {
        text: sym.name,
      },
      subject: {
        reference: patientRef,
        display: data.patient.fullName,
      },
      onsetDateTime: sym.startedAt,
      note: [
        {
          text: sym.notes || 'Logged via VitalHealth mobile application.',
        },
      ],
    };

    entries.push({
      fullUrl: `urn:uuid:${condId}`,
      resource: condResource,
    });
  });

  // 5. DiagnosticReport Resource (BioGears Digital Twin & Clinical Summary)
  const reportId = 'diag-report-vth-twin';
  const diagnosticReport: FHIRResource = {
    resourceType: 'DiagnosticReport',
    id: reportId,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'OTH',
            display: 'Other',
          },
        ],
      },
    ],
    code: {
      text: 'BioGears Digital Twin Physiological Assessment & Adherence Summary',
    },
    subject: {
      reference: patientRef,
      display: data.patient.fullName,
    },
    effectiveDateTime: timestamp,
    issued: timestamp,
    result: entries
      .filter((e) => e.resource.resourceType === 'Observation')
      .map((e) => ({ reference: `urn:uuid:${e.resource.id}`, display: e.resource.code?.text })),
    conclusion: `Overall 30-Day Medication Adherence: ${data.adherencePct}% (${data.adherenceGrade}). Digital Twin Status: ${data.biogearsSim?.status || 'Active'}. Red Flags Identified: ${data.redFlags.length}`,
  };

  entries.push({
    fullUrl: `urn:uuid:${reportId}`,
    resource: diagnosticReport,
  });

  // Return Complete FHIR Bundle
  return {
    resourceType: 'Bundle',
    id: bundleId,
    meta: {
      lastUpdated: timestamp,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
    },
    type: 'collection',
    timestamp,
    identifier: {
      system: 'urn:oid:vitalhealth:fhir:bundle',
      value: bundleId,
    },
    total: entries.length,
    entry: entries,
  };
}

/**
 * Serializes and exports the HL7 FHIR R4 Bundle as a downloadable JSON file.
 */
export async function exportFhirR4Json(data: SummaryDataPayload): Promise<string> {
  try {
    log('[FHIR Exporter] Building HL7 FHIR R4 Clinical Bundle...');
    const fhirBundle = buildFhirR4Bundle(data);
    const jsonString = JSON.stringify(fhirBundle, null, 2);

    const safeName = (data.patient.fullName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `VitalHealth_FHIR_R4_${safeName}.json`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    log(`[FHIR Exporter] HL7 FHIR Bundle exported to: ${fileUri}`);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export HL7 FHIR R4 Clinical Bundle (JSON)',
        UTI: 'public.json',
      });
    }

    return fileUri;
  } catch (err) {
    log('[FHIR Exporter] Error exporting FHIR JSON:', err);
    throw err;
  }
}
