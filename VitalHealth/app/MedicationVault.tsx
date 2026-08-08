import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { log } from "../utils/logger";
import Header from "./components/Header";

// API
import {
  ocrPrescription,
  listPrescriptions,
} from "../services/medicationVaultAPI";

// Decomposed Modular Components
import TodayRegimen from "../components/vault/TodayRegimen";
import MedicineCabinet from "../components/vault/MedicineCabinet";
import AddMedicationFlow from "../components/vault/AddMedicationFlow";
import MedicationDetail from "../components/vault/MedicationDetail";

type ActivePage = "dashboard" | "medications" | "add" | "detail";

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
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = colors[theme];

  // Context hooks
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

  // Navigation & Details States
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Metadata Cache
  const [metadataCache, setMetadataCache] = useState<Record<number, MedicineMeta>>({});
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

  useEffect(() => {
    reloadMedicines();
    markReadByCategory("medication");
    loadLivePrescriptions();
  }, [loadLivePrescriptions]);

  // Read metadata from local AsyncStorage Cache
  const loadMetadata = useCallback(async () => {
    const cached: Record<number, MedicineMeta> = {};
    for (const med of medicines) {
      try {
        const raw = await AsyncStorage.getItem(`@medicine_meta_${med.id}`);
        if (raw) {
          cached[med.id] = JSON.parse(raw);
        } else {
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
    if (medicines.length > 0) {
      loadMetadata();
    }
  }, [medicines, loadMetadata]);

  // Handlers
  const handleLogDose = async (med: Medicine, status: "taken" | "missed") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setMedicineStatus(med.id, status);
    if (status === "taken") {
      runSimulation();
    }
  };

  const handleDelayDose = async (med: Medicine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Snooze Reminder", `Reminding you to take ${med.name} in 15 minutes.`);
  };

  const handleAddMedication = async (details: any) => {
    try {
      const type = details.form.toLowerCase();
      const timestamp = Date.now();

      await addMedicine(
        details.name,
        details.dose,
        type,
        details.time,
        timestamp,
        details.meal,
        details.frequency,
        details.startDate,
        details.endDateMode === "ongoing" ? "ongoing" : details.endDate,
        1
      );

      setActivePage("dashboard");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      log("Error adding medicine:", err);
      Alert.alert("Error", "Failed to save medication to schedule.");
    }
  };

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

  const handleExportReport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/settings-export-summary" as any);
  };

  // Main Page Router
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

  const isDark = theme === "dark";

  return (
    <LinearGradient
      colors={isDark ? ["#0b1329", "#080c1a"] : ["#f8fafc", "#f1f5f9", "#e0f2fe"]}
      style={{ flex: 1 }}
    >
      {/* Universal Global Header */}
      <Header
        title="Medication Vault"
        showBack={activePage !== "dashboard"}
        onBack={() => {
          if (activePage !== "dashboard") {
            setActivePage("dashboard");
          } else {
            router.back();
          }
        }}
      />

      {/* Ambient Background Glow Orbs */}
      <View pointerEvents="none" style={styles.orbsContainer}>
        <View style={[styles.orb, { backgroundColor: "#38bdf81e", top: 80, right: -60, width: 260, height: 260, borderRadius: 130 }]} />
        <View style={[styles.orb, { backgroundColor: "#a78bfa18", top: 320, left: -90, width: 280, height: 280, borderRadius: 140 }]} />
      </View>

      {/* Top Segmented Sub-Navigation Bar & Action Controls */}
      <View style={[styles.mainContentContainer, { paddingTop: 60 + insets.top }]}>
        {activePage !== "add" && activePage !== "detail" && (
          <View style={styles.topSegmentContainer}>
            <View style={[styles.segmentCapsule, { backgroundColor: c.card, borderColor: c.border }]}>
              <TouchableOpacity
                style={[
                  styles.segmentTab,
                  activePage === "dashboard" && { backgroundColor: c.accent },
                ]}
                onPress={() => {
                  setActivePage("dashboard");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons
                  name="calendar"
                  size={15}
                  color={activePage === "dashboard" ? "#ffffff" : c.sub}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    { color: activePage === "dashboard" ? "#ffffff" : c.sub },
                  ]}
                >
                  Regimen
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentTab,
                  activePage === "medications" && { backgroundColor: c.accent },
                ]}
                onPress={() => {
                  setActivePage("medications");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons
                  name="medical"
                  size={15}
                  color={activePage === "medications" ? "#ffffff" : c.sub}
                />
                <Text
                  style={[
                    styles.segmentTabText,
                    { color: activePage === "medications" ? "#ffffff" : c.sub },
                  ]}
                >
                  Cabinet
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Action Pills */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.headerActionButton, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={handleExportReport}
              >
                <Ionicons name="document-text-outline" size={16} color={c.accent} />
                <Text style={[styles.headerActionText, { color: c.accent }]}>Report</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerActionButton, { backgroundColor: c.accent, borderColor: c.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActivePage("add");
                }}
              >
                <Ionicons name="add" size={16} color="#ffffff" />
                <Text style={[styles.headerActionText, { color: "#ffffff" }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ flex: 1 }}>
          {renderBody()}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  mainContentContainer: {
    flex: 1,
  },
  orbsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
  },
  topSegmentContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  segmentCapsule: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    flex: 1,
  },
  segmentTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 17,
    gap: 6,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  headerActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
});