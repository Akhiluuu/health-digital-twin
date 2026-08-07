// utils/doctorSummaryPdfBuilder.ts
// Clinician-Grade Doctor Summary Document Generator
// Formats patient context, medications, vitals, symptoms, drug interactions, and digital twin state into a professional clinical PDF document.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { log } from './logger';
import { downloadReport } from '../services/medicationVaultAPI';

export interface DoctorSummaryOptions {
  timeframeDays: number; // 7, 30, 90
  includedSections: {
    demographics: boolean;
    snapshot: boolean;
    medications: boolean;
    interactions: boolean;
    vitals: boolean;
    symptoms: boolean;
    biogearsSim: boolean;
    physicianOrders: boolean;
  };
}

export interface SummaryDataPayload {
  patient: {
    fullName: string;
    dob: string;
    age: number;
    gender: string;
    mrn: string;
    phone: string;
    emergencyContact: string;
    primaryDoctor: string;
  };
  adherencePct: number;
  adherenceGrade: string;
  redFlags: string[];
  medications: Array<{
    name: string;
    brand: string;
    generic: string;
    dose: string;
    frequency: string;
    status: string;
    doctor: string;
    purpose: string;
    adherencePct: number;
    missedCount: number;
    inventoryCount: number;
  }>;
  interactions: Array<{
    drugA: string;
    drugB: string;
    severity: string;
    mechanism: string;
    management: string;
  }>;
  vitals: {
    heartRate: { avg: number; min: number; max: number; unit: string; status: string };
    bloodPressure: { sys: number; dia: number; unit: string; status: string };
    spO2: { avg: number; min: number; unit: string; status: string };
    bloodGlucose: { avg: number; min: number; max: number; unit: string; status: string };
    weight: { current: number; unit: string };
  };
  symptoms: Array<{
    name: string;
    severity: number;
    startedAt: string;
    notes: string;
    status: string;
  }>;
  biogearsSim: {
    status: string;
    cardiacOutput: string;
    respiratoryRate: string;
    metabolicClearance: string;
    notes: string;
  };
}

export function generateClinicalHtmlDocument(
  data: SummaryDataPayload,
  options: DoctorSummaryOptions
): string {
  const generatedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { includedSections } = options;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VitalHealth Clinical Doctor Summary</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 20px;
      font-size: 13px;
      line-height: 1.5;
    }
    .header-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #1e40af;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .brand-subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-meta {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .section-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .demo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .demo-item {
      font-size: 12px;
    }
    .demo-label {
      color: #64748b;
      font-weight: 600;
      display: block;
      font-size: 10px;
      text-transform: uppercase;
    }
    .demo-value {
      color: #0f172a;
      font-weight: 700;
      font-size: 13px;
    }
    .alert-box {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      padding: 10px 14px;
      border-radius: 4px;
      margin-bottom: 14px;
    }
    .alert-title {
      color: #991b1b;
      font-weight: 700;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .alert-list {
      margin: 0;
      padding-left: 18px;
      color: #b91c1c;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    th {
      background-color: #e2e8f0;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tr:nth-child(even) {
      background-color: #ffffff;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: #fee2e2; color: #991b1b; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 6px;
    }
    .vital-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .vital-val {
      font-size: 18px;
      font-weight: 800;
      color: #1e293b;
      margin: 4px 0;
    }
    .vital-sub {
      font-size: 10px;
      color: #64748b;
    }
    .signature-area {
      margin-top: 30px;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      padding: 16px;
      background: #fafafa;
      page-break-inside: avoid;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      margin-top: 24px;
    }
    .sig-line {
      border-bottom: 1.5px solid #475569;
      margin-bottom: 4px;
      height: 30px;
    }
    .sig-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .footer-text {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      margin-top: 24px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>

  <!-- Header Banner -->
  <div class="header-banner">
    <div>
      <h1 class="brand-title">VitalHealth Twin™</h1>
      <div class="brand-subtitle">Clinical Doctor Summary & Risk Assessment</div>
    </div>
    <div class="doc-meta">
      <div><strong>Export Date:</strong> ${generatedDate}</div>
      <div><strong>Reporting Window:</strong> Past ${options.timeframeDays} Days</div>
      <div><strong>Document ID:</strong> VTH-CLIN-${Math.floor(100000 + Math.random() * 900000)}</div>
    </div>
  </div>

  ${
    includedSections.demographics
      ? `
  <!-- Patient Demographics -->
  <div class="section-card">
    <h2 class="section-title">👤 Patient Demographics & Identification</h2>
    <div class="demo-grid">
      <div class="demo-item"><span class="demo-label">Full Patient Name</span><span class="demo-value">${data.patient.fullName}</span></div>
      <div class="demo-item"><span class="demo-label">Date of Birth / Age</span><span class="demo-value">${data.patient.dob} (${data.patient.age} yrs)</span></div>
      <div class="demo-item"><span class="demo-label">Biological Sex</span><span class="demo-value">${data.patient.gender}</span></div>
      <div class="demo-item"><span class="demo-label">Patient Profile ID / MRN</span><span class="demo-value">${data.patient.mrn}</span></div>
      <div class="demo-item"><span class="demo-label">Attending Physician</span><span class="demo-value">${data.patient.primaryDoctor}</span></div>
      <div class="demo-item"><span class="demo-label">Emergency Contact</span><span class="demo-value">${data.patient.emergencyContact}</span></div>
    </div>
  </div>
  `
      : ''
  }

  ${
    includedSections.snapshot
      ? `
  <!-- Executive Clinical Snapshot -->
  <div class="section-card">
    <h2 class="section-title">⚡ Executive Clinical Snapshot</h2>
    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 12px;">
      <div style="flex: 1; background: #ffffff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; text-align: center;">
        <span class="demo-label">30-Day Medication Adherence</span>
        <div style="font-size: 26px; font-weight: 800; color: ${data.adherencePct >= 85 ? '#166534' : '#991b1b'}; margin: 2px 0;">
          ${data.adherencePct}%
        </div>
        <span class="badge ${data.adherencePct >= 85 ? 'badge-success' : 'badge-critical'}">${data.adherenceGrade}</span>
      </div>
      <div style="flex: 2;">
        ${
          data.redFlags.length > 0
            ? `
          <div class="alert-box">
            <div class="alert-title">⚠️ Key Clinical Red Flags Identified</div>
            <ul class="alert-list">
              ${data.redFlags.map((flag) => `<li>${flag}</li>`).join('')}
            </ul>
          </div>
        `
            : `
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 10px; border-radius: 4px; color: #15803d; font-size: 12px;">
            <strong>✓ No Critical Safety Flags:</strong> Patient profile and medication logs are currently within target therapeutic safety parameters.
          </div>
        `
        }
      </div>
    </div>
  </div>
  `
      : ''
  }

  ${
    includedSections.medications && data.medications.length > 0
      ? `
  <!-- Active Regimen Matrix -->
  <div class="section-card">
    <h2 class="section-title">💊 Active Medication Regimen & Compliance</h2>
    <table>
      <thead>
        <tr>
          <th>Medication (Brand/Generic)</th>
          <th>Dose & Form</th>
          <th>Frequency</th>
          <th>Indication</th>
          <th>Prescriber</th>
          <th>30D Adherence</th>
          <th>Inventory</th>
        </tr>
      </thead>
      <tbody>
        ${data.medications
          .map(
            (med) => `
          <tr>
            <td><strong>${med.name}</strong><br><span style="font-size: 10px; color: #64748b;">${med.generic || med.brand}</span></td>
            <td>${med.dose}</td>
            <td>${med.frequency}</td>
            <td>${med.purpose || 'General Therapy'}</td>
            <td>${med.doctor}</td>
            <td>
              <span class="badge ${med.adherencePct >= 80 ? 'badge-success' : 'badge-warning'}">${med.adherencePct}%</span>
              <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Missed: ${med.missedCount}</div>
            </td>
            <td>${med.inventoryCount} pills</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>
  `
      : ''
  }

  ${
    includedSections.interactions && data.interactions.length > 0
      ? `
  <!-- Drug Interactions Audit -->
  <div class="section-card">
    <h2 class="section-title">🧪 Drug Interaction & Risk Matrix</h2>
    <table>
      <thead>
        <tr>
          <th>Interacting Pair</th>
          <th>Severity Level</th>
          <th>Clinical Mechanism</th>
          <th>Management Action</th>
        </tr>
      </thead>
      <tbody>
        ${data.interactions
          .map(
            (item) => `
          <tr>
            <td><strong>${item.drugA}</strong> + <strong>${item.drugB}</strong></td>
            <td><span class="badge badge-critical">${item.severity}</span></td>
            <td>${item.mechanism}</td>
            <td>${item.management}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>
  `
      : ''
  }

  ${
    includedSections.vitals
      ? `
  <!-- Vital Signs -->
  <div class="section-card">
    <h2 class="section-title">📊 Biomarker & Vital Signs Summary</h2>
    <div class="vitals-grid">
      <div class="vital-card">
        <span class="demo-label">Heart Rate</span>
        <div class="vital-val">${data.vitals.heartRate.avg} <span style="font-size: 11px;">${data.vitals.heartRate.unit}</span></div>
        <div class="vital-sub">Min: ${data.vitals.heartRate.min} | Max: ${data.vitals.heartRate.max}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Blood Pressure</span>
        <div class="vital-val">${data.vitals.bloodPressure.sys}/${data.vitals.bloodPressure.dia} <span style="font-size: 11px;">${data.vitals.bloodPressure.unit}</span></div>
        <div class="vital-sub">Status: ${data.vitals.bloodPressure.status}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Oxygen Saturation</span>
        <div class="vital-val">${data.vitals.spO2.avg}%</div>
        <div class="vital-sub">Min: ${data.vitals.spO2.min}% | ${data.vitals.spO2.status}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Blood Glucose</span>
        <div class="vital-val">${data.vitals.bloodGlucose.avg} <span style="font-size: 11px;">${data.vitals.bloodGlucose.unit}</span></div>
        <div class="vital-sub">Range: ${data.vitals.bloodGlucose.min} - ${data.vitals.bloodGlucose.max}</div>
      </div>
    </div>
  </div>
  `
      : ''
  }

  ${
    includedSections.symptoms && data.symptoms.length > 0
      ? `
  <!-- Symptom Log -->
  <div class="section-card">
    <h2 class="section-title">🩺 Longitudinal Symptom Log</h2>
    <table>
      <thead>
        <tr>
          <th>Symptom Name</th>
          <th>Severity (1-10)</th>
          <th>Onset Date</th>
          <th>Status</th>
          <th>Patient Clinical Notes</th>
        </tr>
      </thead>
      <tbody>
        ${data.symptoms
          .map(
            (sym) => `
          <tr>
            <td><strong>${sym.name}</strong></td>
            <td><span class="badge ${sym.severity >= 7 ? 'badge-critical' : 'badge-warning'}">Severity ${sym.severity}/10</span></td>
            <td>${sym.startedAt}</td>
            <td>${sym.status}</td>
            <td>${sym.notes || 'No extra notes provided.'}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>
  `
      : ''
  }

  ${
    includedSections.biogearsSim
      ? `
  <!-- Digital Twin Engine Simulation -->
  <div class="section-card">
    <h2 class="section-title">🧬 BioGears™ Digital Twin Engine Model Data</h2>
    <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; font-weight: 700; color: #1e40af; margin-bottom: 8px;">
        <span>Physiological Model Sync: ${data.biogearsSim.status}</span>
        <span>Cardiac Output: ${data.biogearsSim.cardiacOutput}</span>
      </div>
      <div style="font-size: 12px; color: #334155;">
        <strong>Simulation Analysis:</strong> ${data.biogearsSim.notes}
      </div>
    </div>
  </div>
  `
      : ''
  }

  ${
    includedSections.physicianOrders
      ? `
  <!-- Clinician Orders & Signature Block -->
  <div class="signature-area">
    <h2 class="section-title" style="border: none; margin: 0 0 10px 0;">✍️ Physician Orders & Care Plan Adjustments</h2>
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px;">
      Please record any titration notes, new prescription orders, or follow-up instructions below:
    </div>
    <div style="min-height: 50px; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 4px; padding: 8px;">
      <span style="color: #cbd5e1; font-style: italic;">[ Physician Clinical Progress Notes & Rx Modifications ]</span>
    </div>
    <div class="sig-grid">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Attending Clinician Signature & Credentials</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Date & Time Signed</div>
      </div>
    </div>
  </div>
  `
      : ''
  }

  <!-- Footer -->
  <div class="footer-text">
    CONFIDENTIAL MEDICAL RECORD — Generated by VitalHealth Digital Twin Engine. This document is intended solely for clinical evaluation by authorized medical professionals.
  </div>

</body>
</html>
  `;
}

export async function exportDoctorSummaryPdf(
  data: SummaryDataPayload,
  options: DoctorSummaryOptions
): Promise<string> {
  try {
    log('[DoctorSummary] Initiating PDF report export...');

    // Attempt backend PDF download if available
    try {
      const blob = await downloadReport({
        report_type: 'clinical_summary',
        format: 'pdf',
        period_start: new Date(Date.now() - options.timeframeDays * 86400000)
          .toISOString()
          .split('T')[0],
        period_end: new Date().toISOString().split('T')[0],
      });

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);

      const base64Data = await base64Promise;
      const pdfUri = `${FileSystem.cacheDirectory}vitalhealth_doctor_summary.pdf`;
      await FileSystem.writeAsStringAsync(pdfUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Doctor Summary PDF',
          UTI: 'com.adobe.pdf',
        });
      }
      return pdfUri;
    } catch (backendErr) {
      log('[DoctorSummary] Backend download fallback to formatted HTML PDF document:', backendErr);
    }

    // Client-side HTML PDF rendering & export fallback
    const htmlContent = generateClinicalHtmlDocument(data, options);
    const fileUri = `${FileSystem.cacheDirectory}vitalhealth_doctor_summary.html`;

    await FileSystem.writeAsStringAsync(fileUri, htmlContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/html',
        dialogTitle: 'Share Doctor Summary Document',
      });
    }

    return fileUri;
  } catch (err) {
    log('[DoctorSummary] Error exporting PDF document:', err);
    throw err;
  }
}
