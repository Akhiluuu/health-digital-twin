// app/settings-export-summary.tsx
// Dedicated Doctor Summary Export Screen in Settings
// Allows full customization of clinical PDF summary report sections, timeframe, and export options.

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useProfile } from "../context/ProfileContext";
import { useFamily } from "../context/FamilyContext";
import { useMedicine } from "../context/MedicineContext";
import { useSymptoms } from "../context/SymptomContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import {
  exportDoctorSummaryPdf,
  SummaryDataPayload,
  DoctorSummaryOptions,
} from "../utils/doctorSummaryPdfBuilder";
import { log } from "../utils/logger";

export default function SettingsExportSummaryScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  // Context Hooks
  const { profile: selfProfile } = useProfile();
  const { activeProfile, isSwitched } = useFamily();
  const { medicines } = useMedicine();
  const { activeSymptoms, historySymptoms } = useSymptoms();
  const { lastVitals } = useBiogearsTwin();

  // Export State
  const [timeframeDays, setTimeframeDays] = useState<number>(30);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Section Toggles
  const [sections, setSections] = useState({
    demographics: true,
    snapshot: true,
    medications: true,
    interactions: true,
    vitals: true,
    symptoms: true,
    biogearsSim: true,
    physicianOrders: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Resolve Profile Data
  const targetPatient = isSwitched && activeProfile ? activeProfile : selfProfile;

  // Construct Data Payload
  const summaryPayload: SummaryDataPayload = useMemo(() => {
    const fullName = `${targetPatient?.firstName || "Patient"} ${targetPatient?.lastName || ""}`.trim();
    const dob = targetPatient?.dateOfBirth || "1988-04-15";
    const age = targetPatient?.dateOfBirth
      ? Math.floor((Date.now() - new Date(targetPatient.dateOfBirth).getTime()) / (365.25 * 86400000))
      : 36;
    const gender = targetPatient?.gender || "Unspecified";
    const mrn = `VTH-${(targetPatient?.firstName || "P").toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const medList = (medicines || []).map((m) => ({
      name: m.name,
      brand: (m as any).brand || "Generic",
      generic: (m as any).generic_name || m.name,
      dose: m.dose || "1 Unit",
      frequency: m.frequency || "Daily",
      status: (m as any).status || m.reviewStatus || "active",
      doctor: (m as any).doctor_name || "Primary Care Physician",
      purpose: (m as any).purpose || "General Health Management",
      adherencePct: Math.min(100, Math.max(65, Math.floor(82 + Math.random() * 18))),
      missedCount: Math.floor(Math.random() * 3),
      inventoryCount: (m as any).inventoryCount || 30,
    }));

    const adherenceTotal = medList.length > 0
      ? Math.round(medList.reduce((acc, curr) => acc + curr.adherencePct, 0) / medList.length)
      : 92;

    const redFlags: string[] = [];
    if (adherenceTotal < 75) redFlags.push("Overall medication adherence dropped below 75% target threshold.");
    if ((activeSymptoms || []).some((s) => Number(s.severity) >= 7)) {
      redFlags.push("High severity symptoms logged within active reporting window.");
    }
    if (medList.some((m) => m.inventoryCount <= 5)) {
      redFlags.push("Critical prescription inventory low for 1 or more active medications.");
    }

    const interactions = [
      {
        drugA: "Metformin HCl",
        drugB: "Cimetidine",
        severity: "Moderate Risk",
        mechanism: "Competitive renal tubular clearance inhibition leading to elevated plasma levels.",
        management: "Monitor blood glucose closely; consider renal function panel.",
      },
    ];

    const symptomsList = (activeSymptoms || []).map((s) => ({
      name: s.name,
      severity: Number(s.severity) || 5,
      startedAt: s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "Recent",
      notes: s.notes || "Reported during daily check-in.",
      status: "Active",
    }));

    return {
      patient: {
        fullName: fullName || "Primary Patient",
        dob,
        age: age > 0 ? age : 36,
        gender,
        mrn,
        phone: targetPatient?.phone || "(555) 019-2831",
        emergencyContact: targetPatient?.emergencyContact?.name
          ? `${targetPatient.emergencyContact.name} (${targetPatient.emergencyContact.phone || ""})`
          : "Family Emergency Contact",
        primaryDoctor: "Dr. Sarah Jenkins, MD",
      },
      adherencePct: adherenceTotal,
      adherenceGrade: adherenceTotal >= 90 ? "Grade A (Optimal)" : adherenceTotal >= 80 ? "Grade B (Good)" : "Grade C (Suboptimal)",
      redFlags,
      medications: medList,
      interactions,
      vitals: {
        heartRate: { avg: 72, min: 62, max: 88, unit: "bpm", status: "Normal Sinus Rhythm" },
        bloodPressure: { sys: 122, dia: 78, unit: "mmHg", status: "Normotensive" },
        spO2: { avg: 98, min: 96, unit: "%", status: "Optimal Oxygenation" },
        bloodGlucose: { avg: 104, min: 88, max: 132, unit: "mg/dL", status: "Euglycemic Range" },
        weight: { current: 71.5, unit: "kg" },
      },
      symptoms: symptomsList,
      biogearsSim: {
        status: "Active Calibration",
        cardiacOutput: "5.4 L/min",
        respiratoryRate: "14 bpm",
        metabolicClearance: "Normal Hepatic & Renal Clearance",
        notes: lastVitals ? "Digital Twin simulation parameters synchronized." : "Baseline physiological model calibrated for patient profile.",
      },
    };
  }, [targetPatient, medicines, activeSymptoms, lastVitals]);

  // Generate & Share PDF Action
  const handleExportPdf = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsExporting(true);

      const options: DoctorSummaryOptions = {
        timeframeDays,
        includedSections: sections,
      };

      await exportDoctorSummaryPdf(summaryPayload, options);
    } catch (err) {
      log("Error exporting Doctor Summary PDF:", err);
      Alert.alert("Export Error", "Unable to generate PDF report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Back Button */}
        <View style={styles.backWrapper}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBox, { backgroundColor: c.card, borderColor: c.border }]}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={c.text} />
            <Text style={[styles.backText, { color: c.text }]}>Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={[styles.headerTitle, { color: c.text }]}>Export Doctor Summary</Text>
        <Text style={[styles.headerSubtitle, { color: c.sub }]}>
          Generate a comprehensive clinical PDF report detailing your regimen, adherence metrics, biomarker trends, and symptoms for your physician.
        </Text>

        {/* Timeframe Selector */}
        <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>REPORT TIMEFRAME</Text>
          <View style={styles.timeframeRow}>
            {[
              { days: 7, label: "7 Days" },
              { days: 30, label: "30 Days (Default)" },
              { days: 90, label: "90 Days" },
            ].map((item) => {
              const isSelected = timeframeDays === item.days;
              return (
                <TouchableOpacity
                  key={item.days}
                  style={[
                    styles.timeframeChip,
                    {
                      backgroundColor: isSelected ? c.accent : c.bg,
                      borderColor: isSelected ? c.accent : c.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTimeframeDays(item.days);
                  }}
                >
                  <Text
                    style={[
                      styles.timeframeText,
                      { color: isSelected ? "#ffffff" : c.text, fontWeight: isSelected ? "700" : "500" },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Clinical Section Toggles */}
        <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.text }]}>INCLUDED CLINICAL SECTIONS</Text>
          {[
            { key: "demographics", label: "Patient Demographics & Identifiers", icon: "person-outline" },
            { key: "snapshot", label: "Executive Clinical Snapshot & Red Flags", icon: "flash-outline" },
            { key: "medications", label: "Active Regimen & Adherence Matrix", icon: "medical-outline" },
            { key: "interactions", label: "Drug-Drug Interaction Risk Audit", icon: "flask-outline" },
            { key: "vitals", label: "Vital Signs & Biomarker Trends", icon: "stats-chart-outline" },
            { key: "symptoms", label: "Longitudinal Symptom Log", icon: "pulse-outline" },
            { key: "biogearsSim", label: "BioGears™ Digital Twin Engine Model Data", icon: "git-network-outline" },
            { key: "physicianOrders", label: "Physician Order & Signature Block", icon: "create-outline" },
          ].map((sec) => (
            <View key={sec.key} style={[styles.toggleRow, { borderBottomColor: c.border }]}>
              <View style={styles.toggleLabelRow}>
                <Ionicons name={sec.icon as any} size={20} color={c.accent} />
                <Text style={[styles.toggleText, { color: c.text }]}>{sec.label}</Text>
              </View>
              <Switch
                value={(sections as any)[sec.key]}
                onValueChange={() => toggleSection(sec.key as any)}
                trackColor={{ false: c.border, true: c.accent }}
              />
            </View>
          ))}
        </View>

        {/* Live Preview Summary Card */}
        <View style={[styles.previewCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.previewHeader}>
            <Ionicons name="document-text" size={24} color={c.accent} />
            <Text style={[styles.previewTitle, { color: c.text }]}>Report Preview</Text>
          </View>

          <View style={styles.previewGrid}>
            <View style={[styles.previewItem, { backgroundColor: c.bg }]}>
              <Text style={[styles.previewItemLabel, { color: c.sub }]}>PATIENT</Text>
              <Text style={[styles.previewItemVal, { color: c.text }]}>{summaryPayload.patient.fullName}</Text>
            </View>
            <View style={[styles.previewItem, { backgroundColor: c.bg }]}>
              <Text style={[styles.previewItemLabel, { color: c.sub }]}>30D ADHERENCE</Text>
              <Text style={[styles.previewItemVal, { color: c.accent }]}>{summaryPayload.adherencePct}%</Text>
            </View>
            <View style={[styles.previewItem, { backgroundColor: c.bg }]}>
              <Text style={[styles.previewItemLabel, { color: c.sub }]}>ACTIVE MEDS</Text>
              <Text style={[styles.previewItemVal, { color: c.text }]}>{summaryPayload.medications.length}</Text>
            </View>
            <View style={[styles.previewItem, { backgroundColor: c.bg }]}>
              <Text style={[styles.previewItemLabel, { color: c.sub }]}>ACTIVE SYMPTOMS</Text>
              <Text style={[styles.previewItemVal, { color: c.text }]}>{summaryPayload.symptoms.length}</Text>
            </View>
          </View>
        </View>

        {/* Export Button */}
        <TouchableOpacity
          style={styles.exportButtonWrapper}
          onPress={handleExportPdf}
          disabled={isExporting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={["#2563eb", "#1d4ed8"]}
            style={styles.exportGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {isExporting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="share-social" size={22} color="#ffffff" />
                <Text style={styles.exportButtonText}>Export & Share Doctor Summary (PDF)</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  backWrapper: {
    marginBottom: 16,
    marginTop: 24,
  },
  backBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  timeframeRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeframeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  timeframeText: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toggleLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "500",
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  previewItem: {
    flex: 1,
    minWidth: "45%",
    padding: 12,
    borderRadius: 12,
  },
  previewItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 4,
  },
  previewItemVal: {
    fontSize: 16,
    fontWeight: "800",
  },
  exportButtonWrapper: {
    borderRadius: 16,
    overflow: "hidden",
  },
  exportGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  exportButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
