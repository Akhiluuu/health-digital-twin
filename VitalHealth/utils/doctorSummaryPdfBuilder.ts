// utils/doctorSummaryPdfBuilder.ts
// Clinician-Grade Doctor Summary Document Generator
// Formats patient context, medications, vitals, symptoms, drug interactions, and digital twin state into a professional clinical PDF document using expo-print.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
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
  const docId = `VTH-CLIN-${Math.floor(100000 + Math.random() * 900000)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VitalHealth Clinical Doctor Summary</title>
  <style>
    @page { size: A4; margin: 12mm 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 10px;
      font-size: 12px;
      line-height: 1.4;
    }
    .header-banner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #1e40af;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-meta {
      text-align: right;
      font-size: 10px;
      color: #475569;
      line-height: 1.4;
    }
    .section-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 4px;
      margin-top: 0;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .demo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .demo-item {
      font-size: 11px;
    }
    .demo-label {
      color: #64748b;
      font-weight: 600;
      display: block;
      font-size: 9px;
      text-transform: uppercase;
    }
    .demo-value {
      color: #0f172a;
      font-weight: 700;
      font-size: 12px;
    }
    .alert-box {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    .alert-title {
      color: #991b1b;
      font-weight: 700;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .alert-list {
      margin: 0;
      padding-left: 16px;
      color: #b91c1c;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 11px;
    }
    th {
      background-color: #e2e8f0;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tr:nth-child(even) {
      background-color: #ffffff;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: #fee2e2; color: #991b1b; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 4px;
    }
    .vital-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px;
      text-align: center;
    }
    .vital-val {
      font-size: 16px;
      font-weight: 800;
      color: #1e293b;
      margin: 2px 0;
    }
    .vital-sub {
      font-size: 9px;
      color: #64748b;
    }
    .signature-area {
      margin-top: 20px;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
      page-break-inside: avoid;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      margin-top: 18px;
    }
    .sig-line {
      border-bottom: 1.5px solid #475569;
      margin-bottom: 4px;
      height: 24px;
    }
    .sig-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }
    .footer-text {
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
      margin-top: 18px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
    }
    .qr-badge {
      display: inline-block;
      padding: 4px 8px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      color: #1e40af;
      font-weight: 700;
      font-size: 10px;
      margin-top: 4px;
    }
  </style>
</head>
<body>

  <!-- Header Banner -->
  <div class="header-banner">
    <div>
      <h1 class="brand-title">🫀 VitalHealth Twin™</h1>
      <div class="brand-subtitle">Clinical Doctor Summary & Physiological Risk Report</div>
      <div class="qr-badge">VERIFIED DIGITAL TWIN RECORD • ${docId}</div>
    </div>
    <div class="doc-meta">
      <div><strong>Export Date:</strong> ${generatedDate}</div>
      <div><strong>Reporting Window:</strong> Past ${options.timeframeDays} Days</div>
      <div><strong>Patient MRN:</strong> ${data.patient.mrn}</div>
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
    <div style="display: flex; gap: 16px; align-items: center;">
      <div style="flex: 1; background: #ffffff; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; text-align: center;">
        <span class="demo-label">30-Day Medication Adherence</span>
        <div style="font-size: 24px; font-weight: 800; color: ${data.adherencePct >= 85 ? '#166534' : '#991b1b'}; margin: 2px 0;">
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
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 8px 10px; border-radius: 4px; color: #15803d; font-size: 11px;">
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
            <td><strong>${med.name}</strong><br><span style="font-size: 9px; color: #64748b;">${med.generic || med.brand}</span></td>
            <td>${med.dose}</td>
            <td>${med.frequency}</td>
            <td>${med.purpose || 'General Therapy'}</td>
            <td>${med.doctor}</td>
            <td>
              <span class="badge ${med.adherencePct >= 80 ? 'badge-success' : 'badge-warning'}">${med.adherencePct}%</span>
              <div style="font-size: 8px; color: #64748b; margin-top: 1px;">Missed: ${med.missedCount}</div>
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
        <div class="vital-val">${data.vitals.heartRate.avg} <span style="font-size: 10px;">${data.vitals.heartRate.unit}</span></div>
        <div class="vital-sub">Min: ${data.vitals.heartRate.min} | Max: ${data.vitals.heartRate.max}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Blood Pressure</span>
        <div class="vital-val">${data.vitals.bloodPressure.sys}/${data.vitals.bloodPressure.dia} <span style="font-size: 10px;">${data.vitals.bloodPressure.unit}</span></div>
        <div class="vital-sub">Status: ${data.vitals.bloodPressure.status}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Oxygen Saturation</span>
        <div class="vital-val">${data.vitals.spO2.avg}%</div>
        <div class="vital-sub">Min: ${data.vitals.spO2.min}% | ${data.vitals.spO2.status}</div>
      </div>
      <div class="vital-card">
        <span class="demo-label">Blood Glucose</span>
        <div class="vital-val">${data.vitals.bloodGlucose.avg} <span style="font-size: 10px;">${data.vitals.bloodGlucose.unit}</span></div>
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
    <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
      <div style="display: flex; justify-content: space-between; font-weight: 700; color: #1e40af; margin-bottom: 6px;">
        <span>Physiological Model Sync: ${data.biogearsSim.status}</span>
        <span>Cardiac Output: ${data.biogearsSim.cardiacOutput}</span>
      </div>
      <div style="font-size: 11px; color: #334155;">
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
    <h2 class="section-title" style="border: none; margin: 0 0 8px 0;">✍️ Physician Orders & Care Plan Adjustments</h2>
    <div style="font-size: 10px; color: #64748b; margin-bottom: 10px;">
      Please record any titration notes, new prescription orders, or follow-up instructions below:
    </div>
    <div style="min-height: 45px; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 4px; padding: 6px;">
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

/**
 * Generates and shares a true PDF document using expo-print.
 */
export async function exportDoctorSummaryPdf(
  data: SummaryDataPayload,
  options: DoctorSummaryOptions
): Promise<string> {
  try {
    log('[DoctorSummary] Initiating true PDF report export via expo-print...');

    // 1. Generate HTML document content
    const htmlContent = generateClinicalHtmlDocument(data, options);

    // 2. Render HTML to true PDF file using native expo-print engine
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    log(`[DoctorSummary] PDF generated successfully at: ${uri}`);

    // 3. Rename/copy to cache with clean filename
    const safeName = (data.patient.fullName || 'Patient').replace(/[^a-zA-Z0-9]/g, '_');
    const targetPdfUri = `${FileSystem.cacheDirectory}VitalHealth_Doctor_Summary_${safeName}.pdf`;

    await FileSystem.copyAsync({
      from: uri,
      to: targetPdfUri,
    }).catch(() => {}); // fallback if copy fails

    const finalUri = (await FileSystem.getInfoAsync(targetPdfUri)).exists ? targetPdfUri : uri;

    // 4. Share PDF document via native OS share sheet
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(finalUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Doctor Summary PDF',
        UTI: 'com.adobe.pdf',
      });
    }

    return finalUri;
  } catch (err) {
    log('[DoctorSummary] Error exporting PDF document:', err);
    throw err;
  }
}
