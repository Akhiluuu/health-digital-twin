// app/MedicationVault.tsx
// ─────────────────────────────────────────────────────────────────
// Reworked Medication Vault Screen Controller
// Decomposed monolithic file into clean, modular components.
// ─────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

// Contexts & Services
import { Medicine, useMedicine } from "../context/MedicineContext";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useNotifications } from "../context/NotificationContext";
import { useFamily } from "../context/FamilyContext";
import { useProfile } from "../context/ProfileContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { useSymptoms } from "../context/SymptomContext";
import { log } from "../utils/logger";
import { getLocalDateString } from "../utils/twinUtils";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// API
import {
  ocrPrescription,
  chatWithAssistant,
  listPrescriptions,
} from "../services/medicationVaultAPI";

// Decomposed Modular Components
import TodayRegimen from "../components/vault/TodayRegimen";
import MedicineCabinet from "../components/vault/MedicineCabinet";
import AssistantCompanion from "../components/vault/AssistantCompanion";
import AddMedicationFlow from "../components/vault/AddMedicationFlow";
import MedicationDetail from "../components/vault/MedicationDetail";

type ActivePage = "dashboard" | "medications" | "ai" | "add" | "detail";

interface MedicineMeta {
  brand: string;
  genericName: string;
  strength: string;
  doctor: string;
  hospital: string;
  purpose: string;
  sideEffects: string;
  warnings: string;
  storage: string;
  interactions: string;
  priority: "Critical" | "Important" | "Optional";
  refillCount: number;
  inventoryCount: number;
  color: string;
  shape: string;
  diseaseLinked: string;
  biogearsSimLinked: boolean;
}

// Clinically reviewed default data for standard medications
const CLINICAL_FALLBACKS: Record<string, Partial<MedicineMeta>> = {
  metformin: {
    brand: "Glucophage",
    genericName: "Metformin HCl",
    strength: "500mg",
    doctor: "Dr. Sarah Jenkins",
    hospital: "Metro Health Endocrinology",
    purpose: "Blood Glucose Control (Type 2 Diabetes)",
    sideEffects: "Nausea, mild diarrhea, abdominal discomfort, metallic taste.",
    warnings: "Lactic acidosis (rare but severe). Avoid excessive alcohol. Report muscle pain.",
    storage: "Store at 20°C - 25°C. Keep bottle tightly closed.",
    interactions: "Contrast dye (stop taking 48h before scans), Cimetidine.",
    priority: "Critical",
    color: "#e11d48",
    shape: "oval",
    diseaseLinked: "Type 2 Diabetes",
    biogearsSimLinked: true,
  },
  insulin: {
    brand: "Lantus / Humalog",
    genericName: "Insulin Glargine",
    strength: "100 U/mL",
    doctor: "Dr. Sarah Jenkins",
    hospital: "Metro Health Endocrinology",
    purpose: "Glucose Management (Type 1 Diabetes)",
    sideEffects: "Hypoglycemia (low blood sugar), injection site reactions.",
    warnings: "Never share injection pens. Monitor glucose continuously.",
    storage: "Refrigerate unused pens (2°C - 8°C). Do not freeze.",
    interactions: "Beta-blockers (may mask hypoglycemia symptoms), Corticosteroids.",
    priority: "Critical",
    color: "#3b82f6",
    shape: "vial",
    diseaseLinked: "Type 1 Diabetes",
    biogearsSimLinked: true,
  },
  "vitamin d": {
    brand: "D3 Max",
    genericName: "Cholecalciferol",
    strength: "2000 IU",
    doctor: "Dr. Marcus Vance",
    hospital: "VitalHealth Clinic",
    purpose: "Bone Health & Immune Support",
    sideEffects: "Very rare. Hypercalcemia if taken in massive overdose.",
    warnings: "Check calcium levels periodically if taking high doses.",
    storage: "Keep in a cool, dry place. Protect from direct sunlight.",
    interactions: "Orlistat, Thiazide diuretics, Cholestyramine.",
    priority: "Optional",
    color: "#eab308",
    shape: "capsule",
    diseaseLinked: "Vitamin D Deficiency",
    biogearsSimLinked: false,
  },
  amoxicillin: {
    brand: "Amoxil",
    genericName: "Amoxicillin Trihydrate",
    strength: "500mg",
    doctor: "Dr. Elizabeth Thorne",
    hospital: "City Urgent Care",
    purpose: "Bacterial Infection Treatment",
    sideEffects: "Diarrhea, nausea, skin rash, oral thrush.",
    warnings: "Complete full course even if feeling better. Do not take if penicillin allergic.",
    storage: "Store suspension in refrigerator (discard after 14 days). Tablets at room temp.",
    interactions: "Methotrexate, Oral contraceptives, Allopurinol.",
    priority: "Important",
    color: "#ec4899",
    shape: "capsule",
    diseaseLinked: "Acute Bronchitis",
    biogearsSimLinked: true,
  },
  aspirin: {
    brand: "Bayer Aspirin",
    genericName: "Acetylsalicylic Acid",
    strength: "81mg",
    doctor: "Dr. Robert Chen",
    hospital: "Cardiovascular Specialists",
    purpose: "Cardioprotection & Blood Thinning",
    sideEffects: "Stomach irritation, easy bruising, minor bleeding.",
    warnings: "Bleeding risk. Do not give to children (Reye's syndrome risk).",
    storage: "Keep in a dry container. Discard if vinegar odor develops.",
    interactions: "Warfarin, Ibuprofen, Clopidogrel, SSRIs.",
    priority: "Critical",
    color: "#ef4444",
    shape: "round",
    diseaseLinked: "Coronary Artery Disease",
    biogearsSimLinked: true,
  },
};

const DEFAULT_META: MedicineMeta = {
  brand: "Generic",
  genericName: "Active Ingredient",
  strength: "1 Unit",
  doctor: "Primary Care Physician",
  hospital: "Community Hospital",
  purpose: "General Therapy",
  sideEffects: "Consult doctor for side effects list.",
  warnings: "Take exactly as directed.",
  storage: "Store at room temperature in a dry container.",
  interactions: "No known severe interactions registered.",
  priority: "Important",
  refillCount: 3,
  inventoryCount: 30,
  color: "#2563eb",
  shape: "round",
  diseaseLinked: "General Wellness",
  biogearsSimLinked: false,
};

export default function MedicationVault() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  // Context hook calls
  const {
    medicines,
    removeMedicine,
    reloadMedicines,
    setMedicineStatus,
    addMedicine,
  } = useMedicine();

  const { markReadByCategory } = useNotifications();
  const { isSwitched, activeProfile, members, switchToMember, switchToSelf } = useFamily();
  const { profile: selfProfile } = useProfile();
  const { runSimulation } = useBiogearsTwin();
  const { activeSymptoms, historySymptoms } = useSymptoms();

  // Navigation & Details States
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Metadata Cache
  const [metadataCache, setMetadataCache] = useState<Record<number, MedicineMeta>>({});

  // AI Assistant Chat State
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "assistant"; text: string }>>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  // Load live documents list
  const loadLivePrescriptions = useCallback(async () => {
    try {
      const res = await listPrescriptions();
      if (res && res.data) {
        setPrescriptions(res.data);
      }
    } catch (err) {
      log("Error fetching live prescriptions:", err);
    }
  }, []);

  // Load and cache medication metadata on load
  useEffect(() => {
    reloadMedicines();
    markReadByCategory("medication");
    loadLivePrescriptions();
  }, [loadLivePrescriptions]);

  // Personalize greeting once the profile is loaded
  useEffect(() => {
    const name = selfProfile?.firstName;
    setAiMessages([
      {
        sender: "assistant",
        text: `Hello ${name || "there"}! I'm your Personal Health Assistant. I have access to your medication regimen, active symptoms, and health profile. I can explain your medications, check for interactions, advise on missed doses, or answer any health question you have. What's on your mind today?`,
      },
    ]);
  }, [selfProfile?.firstName]);

  // Read metadata from local AsyncStorage Cache
  const loadMetadata = useCallback(async () => {
    const cached: Record<number, MedicineMeta> = {};
    for (const med of medicines) {
      try {
        const raw = await AsyncStorage.getItem(`@medicine_meta_${med.id}`);
        if (raw) {
          cached[med.id] = JSON.parse(raw);
        } else {
          // Resolve clinical default based on name
          const lowercaseName = med.name.toLowerCase();
          let matchedKey = "";
          for (const key of Object.keys(CLINICAL_FALLBACKS)) {
            if (lowercaseName.includes(key)) {
              matchedKey = key;
              break;
            }
          }
          if (matchedKey) {
            cached[med.id] = { ...DEFAULT_META, ...CLINICAL_FALLBACKS[matchedKey] } as MedicineMeta;
          } else {
            cached[med.id] = { ...DEFAULT_META } as MedicineMeta;
          }
        }
      } catch {
        cached[med.id] = { ...DEFAULT_META } as MedicineMeta;
      }
    }
    setMetadataCache(cached);
  }, [medicines]);

  useEffect(() => {
    loadMetadata();
  }, [medicines, loadMetadata]);

  // Log Dose Action & Run Simulation Trigger
  const handleLogDose = async (med: Medicine, status: "taken" | "missed") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setMedicineStatus(med.id, status);

    const meta = metadataCache[med.id] || {};
    if (status === "taken" && meta.biogearsSimLinked) {
      // Trigger background BioGears Digital Twin calibration
      runSimulation().catch((err) => {
        log("BioGears simulation sync error:", err);
      });
    }
  };

  const handleDelayDose = async (med: Medicine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Snoozed", `Dose of ${med.name} delayed by 15 minutes.`);
  };

  // Add Medication Save Wizard handler
  const handleAddMedication = async (details: any) => {
    try {
      const now = new Date();
      const timesToSave: string[] = details.times && details.times.length > 0 ? details.times : [details.time];

      for (const timeStr of timesToSave) {
        const [h, m] = timeStr.split(":");
        const timestamp = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          Number(h),
          Number(m)
        ).getTime();

        const finalEndDate = details.endDateMode === "ongoing" ? "ongoing" : details.endDate || getLocalDateString();

        const newId = await addMedicine(
          details.name.trim(),
          details.dose.trim(),
          details.form.toLowerCase(),
          timeStr,
          timestamp,
          details.meal,
          details.frequency,
          details.startDate,
          finalEndDate,
          1, // reminders enabled
          details.reviewInterval,
          null, // calculated automatically by DB
          "Started"
        );

        // Save custom metadata to cache
        if (newId) {
          const colorMap: Record<string, string> = {
            tablet: "#3b82f6",
            capsule: "#ec4899",
            injection: "#10b981",
            drops: "#eab308",
            inhaler: "#8b5cf6",
          };

          const customMeta: MedicineMeta = {
            brand: details.brand.trim() || "Generic",
            genericName: details.generic.trim() || details.name.trim(),
            strength: details.strength.trim() || details.dose.trim(),
            doctor: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.doctor || "Primary Care Physician",
            hospital: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.hospital || "VitalHealth Clinic",
            purpose: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.purpose || "General Therapy",
            sideEffects: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.sideEffects || "Consult doctor.",
            warnings: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.warnings || "Take as directed.",
            storage: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.storage || "Store at room temp.",
            interactions: CLINICAL_FALLBACKS[details.name.toLowerCase()]?.interactions || "None noted.",
            priority: "Important",
            refillCount: Number(details.refillCount) || 3,
            inventoryCount: Number(details.inventoryCount) || 30,
            color: colorMap[details.form.toLowerCase()] || "#3b82f6",
            shape: details.form.toLowerCase(),
            diseaseLinked: details.diseaseLinked,
            biogearsSimLinked: true,
          };
          await AsyncStorage.setItem(`@medicine_meta_${newId}`, JSON.stringify(customMeta));
        }
      }

      await loadMetadata();
      Alert.alert("Success", `${details.name} schedule configured.`);
      setActivePage("dashboard");
    } catch (err) {
      log("Error saving medicine from wizard:", err);
    }
  };

  // OCR Prescription Scan trigger
  const handleStartOCRScan = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const ImagePicker = await import("expo-image-picker");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Media library permissions required for OCR extraction.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      const res = await ocrPrescription(asset.uri, mimeType);

      if (res && res.success && res.data) {
        loadLivePrescriptions();
        Alert.alert(
          "OCR Scan Successful",
          "Clinical prescription dossier has been securely stored. Medication extraction complete."
        );
      }
    } catch (err) {
      log("OCR scan error:", err);
      Alert.alert("OCR Scanning Failed", "Unable to parse document. Please log details manually.");
    }
  };

  // AI Chat context generator
  const handleSendAiMessage = async (messageText: string) => {
    setAiMessages((prev) => [...prev, { sender: "user", text: messageText }, { sender: "assistant", text: "…" }]);

    try {
      const patientMedicines = medicines.map((m) => {
        const meta = metadataCache[m.id] || {};
        return {
          id: m.id.toString(),
          name: m.name,
          dose: m.dose || meta.strength || "1 Unit",
          type: m.type || meta.shape || "tablet",
          frequency: m.frequency,
          time: m.time,
          meal: m.meal,
        };
      });

      const patientActiveSymptoms = (activeSymptoms || []).map((s) => ({
        name: s.name,
        severity: s.severity,
        startedAt: s.startedAt,
        notes: s.notes,
      }));

      const patientHistorySymptoms = (historySymptoms || []).map((s) => ({
        name: s.name,
        severity: s.severity,
        startedAt: s.startedAt,
        resolvedAt: s.resolvedAt,
        notes: s.notes,
      }));

      const conversationHistory = aiMessages
        .slice(-6)
        .map((m) => `${m.sender === "user" ? "User" : "Personal Health Assistant"}: ${m.text}`);

      const res = await chatWithAssistant({
        message: messageText,
        history: conversationHistory,
        patient_context: {
          medicines: patientMedicines,
          activeSymptoms: patientActiveSymptoms,
          historySymptoms: patientHistorySymptoms,
        },
      });

      const reply = (res as any)?.data?.reply || (res as any)?.data?.response || "Personal Health Assistant is compiling feedback.";
      setAiMessages((prev) => {
        const updated = [...prev];
        const idx = updated.map((m) => m.sender).lastIndexOf("assistant");
        if (idx !== -1) updated[idx] = { sender: "assistant", text: reply };
        return updated;
      });
    } catch (err) {
      log("Assistant chat error:", err);
      setAiMessages((prev) => {
        const updated = [...prev];
        const idx = updated.map((m) => m.sender).lastIndexOf("assistant");
        if (idx !== -1) updated[idx] = { sender: "assistant", text: "Personal Health Assistant is offline. Reconnecting..." };
        return updated;
      });
    }
  };

  const handleExportReport = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const { downloadReport } = await import("../services/medicationVaultAPI");
      const blob = await downloadReport({
        report_type: "clinical",
        format: "pdf",
      });

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = (reader.result as string).split(",")[1];
          const fileUri = `${FileSystem.cacheDirectory}medication_report.pdf`;
          
          await FileSystem.writeAsStringAsync(fileUri, base64data, {
            encoding: "base64",
          });

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: "application/pdf",
              dialogTitle: "Share Medication Report",
            });
          } else {
            Alert.alert("Sharing Not Available", "Sharing is not supported on this device.");
          }
        } catch (err) {
          log("Error writing/sharing PDF report file:", err);
          Alert.alert("Export Error", "Failed to share the generated PDF report.");
        }
      };

      reader.onerror = (err) => {
        log("FileReader error reading PDF report blob:", err);
        Alert.alert("Export Error", "Failed to read the generated PDF report.");
      };

      reader.readAsDataURL(blob);
    } catch (err) {
      log("Error exporting PDF report:", err);
      Alert.alert("Export Failed", "Failed to generate report from server.");
    }
  };

  // Header Component
  const renderHeader = () => {
    const titleMap: Record<ActivePage, string> = {
      dashboard: "Today's Regimen",
      medications: "My Cabinet",
      ai: "Assistant Support",
      add: "Add Medication",
      detail: "Medication Detail",
    };

    return (
      <LinearGradient
        colors={colors[theme].headerGradient}
        style={styles.headerContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          {activePage !== "dashboard" ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setActivePage("dashboard");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.avatarContainer}>
              <View style={[styles.avatarBadge, { backgroundColor: c.accent }]}>
                <Text style={styles.avatarBadgeText}>
                  {activeProfile?.firstName?.charAt(0) || selfProfile?.firstName?.charAt(0) || "U"}
                </Text>
              </View>
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.headerGreeting}>
                  {activeProfile?.firstName || selfProfile?.firstName || "Patient"}
                </Text>
                <Text style={styles.headerSub}>
                  {isSwitched ? "Care Profile" : "Primary Twin"}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.headerTitle}>{titleMap[activePage]}</Text>

          <View style={styles.headerRightButtons}>
            {(activePage === "dashboard" || activePage === "medications") && (
              <>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/MedicineHistory" as any);
                  }}
                >
                  <Ionicons name="time-outline" size={24} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActivePage("add");
                  }}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#ffffff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </LinearGradient>
    );
  };

  // Bottom Navigation Bar Component
  const renderBottomNav = () => {
    if (activePage === "add") return null;

    const tabs: Array<{ id: ActivePage; icon: string; label: string }> = [
      { id: "dashboard", icon: "calendar-outline", label: "Regimen" },
      { id: "medications", icon: "medical-outline", label: "Cabinet" },
      { id: "ai", icon: "chatbubble-ellipses-outline", label: "Assistant" },
    ];

    return (
      <View style={[styles.bottomNavContainer, { backgroundColor: c.card, borderTopColor: c.border }]}>
        {tabs.map((tab) => {
          const isActive = activePage === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.navTab}
              onPress={() => {
                setActivePage(tab.id);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name={tab.icon as any} size={22} color={isActive ? c.accent : c.sub} />
              <Text style={[styles.navLabel, { color: isActive ? c.accent : c.sub, fontWeight: isActive ? "700" : "400" }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Main Page Switcher Router
  const renderBody = () => {
    switch (activePage) {
      case "dashboard":
        return (
          <TodayRegimen
            medicines={medicines}
            metadataCache={metadataCache}
            selfProfile={selfProfile}
            activeProfile={activeProfile}
            isSwitched={isSwitched}
            members={members}
            switchToMember={switchToMember}
            switchToSelf={switchToSelf}
            onLogDose={handleLogDose}
            onDelayDose={handleDelayDose}
            onSelectMedicine={(med) => {
              setSelectedMedicine(med);
              setActivePage("detail");
            }}
            onNavigateToAdd={() => setActivePage("add")}
            onNavigateToTab={(tab) => setActivePage(tab)}
          />
        );

      case "medications":
        return (
          <MedicineCabinet
            medicines={medicines}
            metadataCache={metadataCache}
            prescriptions={prescriptions}
            onSelectMedicine={(med) => {
              setSelectedMedicine(med);
              setActivePage("detail");
            }}
            onScanPrescription={handleStartOCRScan}
            onNavigateToAdd={() => setActivePage("add")}
          />
        );

      case "ai":
        return (
          <AssistantCompanion
            messages={aiMessages}
            activeSymptoms={activeSymptoms}
            onSendMessage={handleSendAiMessage}
            onExportReport={handleExportReport}
          />
        );

      case "add":
        return (
          <AddMedicationFlow
            onCancel={() => setActivePage("dashboard")}
            onAddMedicine={handleAddMedication}
            onOCRScan={handleStartOCRScan}
          />
        );

      case "detail":
        if (!selectedMedicine) return null;
        return (
          <MedicationDetail
            medicine={selectedMedicine}
            metadata={metadataCache[selectedMedicine.id] || DEFAULT_META}
            onDelete={removeMedicine}
            onClose={() => {
              setSelectedMedicine(null);
              setActivePage("dashboard");
            }}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      {renderHeader()}
      <View style={{ flex: 1 }}>
        {renderBody()}
        {(activePage === "dashboard" || activePage === "medications") && (
          <TouchableOpacity
            style={[styles.fabButton, { backgroundColor: c.accent }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setActivePage("add");
            }}
          >
            <Ionicons name="add" size={28} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>
      {renderBottomNav()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 4,
  },
  avatarContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarBadgeText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  headerGreeting: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  headerSub: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
  },
  headerTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 18,
  },
  headerRightButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionIconButton: {
    marginLeft: 14,
    padding: 4,
  },
  bottomNavContainer: {
    flexDirection: "row",
    height: 64,
    borderTopWidth: 1,
    paddingVertical: 8,
    justifyContent: "space-around",
    alignItems: "center",
  },
  navTab: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  navLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  fabButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});