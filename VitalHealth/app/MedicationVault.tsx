// app/MedicationVault.tsx
// ─────────────────────────────────────────────────────────────────
// VitalHealth Enterprise Grade Medication Vault & Intelligence Center
// ─────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Animated,
  Easing,
  Share,
  Platform,
} from "react-native";
import { Ionicons, FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle, Rect, Path, G, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

// Contexts & Services
import { Medicine, useMedicine } from "../context/MedicineContext";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import Header from "./components/Header";
import { useNotifications } from "../context/NotificationContext";
import { useFamily } from "../context/FamilyContext";
import { useProfile } from "../context/ProfileContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { cancelRoutineReminder, scheduleRoutineReminder } from "../services/notifeeService";
import { log } from "../utils/logger";
import { addToMedicineHistory } from "../utils/medicineHistory";
import { getLocalDateString } from "../utils/twinUtils";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── TYPES & INTERFACES ─────────────────────────────────────────────

type ActivePage =
  | "dashboard"
  | "medications"
  | "schedule"
  | "add"
  | "detail"
  | "history"
  | "compliance"
  | "reminders"
  | "inventory"
  | "interactions"
  | "vault"
  | "ai"
  | "analytics"
  | "reports"
  | "emergency"
  | "settings";

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
    color: "#ffffff",
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
    color: "#f59e0b",
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
  color: "#3b82f6",
  shape: "round",
  diseaseLinked: "General Health",
  biogearsSimLinked: false,
};

// ─── HELPERS ────────────────────────────────────────────────────────

function formatDateString(val: any): string {
  if (!val) return "";
  if (val === "ongoing") return "Ongoing";
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    }
  } catch {}
  return String(val);
}

function isTakenToday(medicine: Medicine): boolean {
  if (!medicine || medicine.taken !== 1 || !medicine.takenDate) return false;
  return medicine.takenDate === getLocalDateString();
}

function isMissedToday(medicine: Medicine): boolean {
  if (!medicine || medicine.taken !== -1 || !medicine.takenDate) return false;
  return medicine.takenDate === getLocalDateString();
}

export default function MedicationVault() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  // Context hook calls
  const {
    medicines,
    removeMedicine,
    reloadMedicines,
    clearAllMedicines,
    setMedicineStatus,
    addMedicine,
  } = useMedicine();
  const { markReadByCategory } = useNotifications();
  const { isSwitched, activeMemberId, activeProfile, members, switchToMember, switchToSelf } = useFamily();
  const { profile: selfProfile } = useProfile();
  const {
    runSimulation,
    simulationStatus,
    simulationProgress,
    lastVitals,
    healthScore: twinHealthScore,
  } = useBiogearsTwin();

  // Navigation State
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // Metadata Cache State
  const [metadataCache, setMetadataCache] = useState<Record<number, MedicineMeta>>({});

  // Timeline Replay State
  const [timelineReplayDay, setTimelineReplayDay] = useState(0); // 0 = Today, -1 = Yesterday, etc.

  // Interaction Checker State
  const [interactionSelected, setInteractionSelected] = useState<number[]>([]);

  // AI Assistant Chat State
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "aria"; text: string }>>([
    {
      sender: "aria",
      text: "Hello, I am Dr. Aria, your AI Clinical Companion. I can help analyze your medication regimen, explain side effects, verify food/alcohol compatibility, or provide advice on missed doses. What can I help you with today?",
    },
  ]);

  // Prescription Vault State
  const [prescriptions, setPrescriptions] = useState([
    {
      id: "pres-1",
      fileName: "Rx_Metformin_SarahJenkins.pdf",
      date: "2026-06-15",
      doctor: "Dr. Sarah Jenkins",
      hospital: "Metro Health",
      status: "Current",
      summary: "Metformin HCl 500mg - Take 1 tablet twice daily with breakfast and dinner. Indefinite duration.",
    },
    {
      id: "pres-2",
      fileName: "Rx_Amoxicillin_ElizabethThorne.pdf",
      date: "2026-07-02",
      doctor: "Dr. Elizabeth Thorne",
      hospital: "City Urgent Care",
      status: "Expired",
      summary: "Amoxicillin 500mg - Take 1 capsule 3 times daily for 7 days. Complete full course.",
    },
  ]);
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [isScanningPrescription, setIsScanningPrescription] = useState(false);
  const [scanStep, setScanStep] = useState(0); // 0 = Idle, 1 = Scanning Camera, 2 = OCR parsing, 3 = Completed

  // Reminder Escalation State
  const [escalationModalVisible, setEscalationModalVisible] = useState(false);
  const [escalatedMedicine, setEscalatedMedicine] = useState<Medicine | null>(null);

  // Onboarding Add Medication States
  const [addMethod, setAddMethod] = useState<"manual" | "ocr" | "barcode" | "database" | "voice">("manual");
  const [addName, setAddName] = useState("");
  const [addBrand, setAddBrand] = useState("");
  const [addGeneric, setAddGeneric] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addStrength, setAddStrength] = useState("");
  const [addForm, setAddForm] = useState("Tablet");
  const [addFrequency, setAddFrequency] = useState("daily");
  const [addMeal, setAddMeal] = useState<"before" | "after">("after");
  const [addStartDate, setAddStartDate] = useState(() => getLocalDateString());
  const [addEndDateMode, setAddEndDateMode] = useState<"ongoing" | "specific">("ongoing");
  const [addEndDate, setAddEndDate] = useState("");
  const [addTime, setAddTime] = useState("08:00");
  const [addDoctor, setAddDoctor] = useState("");
  const [addHospital, setAddHospital] = useState("");
  const [addPurpose, setAddPurpose] = useState("");
  const [addPriority, setAddPriority] = useState<"Critical" | "Important" | "Optional">("Important");
  const [addRefillCount, setAddRefillCount] = useState("3");
  const [addInventoryCount, setAddInventoryCount] = useState("30");
  const [addBiogearsLinked, setAddBiogearsLinked] = useState(true);
  const [addDiseaseLinked, setAddDiseaseLinked] = useState("General Health");

  // Load and cache medication metadata on load
  useEffect(() => {
    reloadMedicines();
    markReadByCategory("medication");
  }, []);

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

  // Smart feature: check if there is any pending dose missed and pop escalation modal
  useEffect(() => {
    const checkMissed = () => {
      const missed = medicines.find((m) => isMissedToday(m));
      if (missed) {
        // Only pop if we haven't asked for this specific medicine in this session
        AsyncStorage.getItem(`@missed_asked_${missed.id}_${getLocalDateString()}`).then((val) => {
          if (!val) {
            setEscalatedMedicine(missed);
            setEscalationModalVisible(true);
          }
        });
      }
    };
    if (medicines.length > 0) {
      checkMissed();
    }
  }, [medicines]);

  // Derived metrics
  const dashboardStats = useMemo(() => {
    const total = medicines.length;
    const taken = medicines.filter(isTakenToday).length;
    const missed = medicines.filter(isMissedToday).length;
    const remaining = total - taken - missed;
    const complianceRate = total > 0 ? Math.round(((taken + (total - taken - missed) * 0.5) / total) * 100) : 94;

    let alertsCount = 0;
    let lowInventoryCount = 0;

    medicines.forEach((med) => {
      const meta = metadataCache[med.id];
      if (meta) {
        if (meta.priority === "Critical" && isMissedToday(med)) alertsCount++;
        if (meta.inventoryCount <= 5) lowInventoryCount++;
      }
    });

    return {
      total,
      taken,
      missed,
      remaining,
      complianceRate,
      alertsCount,
      lowInventoryCount,
    };
  }, [medicines, metadataCache]);

  // Next Dose details
  const nextDoseCardData = useMemo(() => {
    if (medicines.length === 0) return null;
    const pending = medicines.filter((m) => !isTakenToday(m) && !isMissedToday(m));
    if (pending.length === 0) return null;

    // Simple time sorting
    const sorted = [...pending].sort((a, b) => {
      const [hA, mA] = a.time.split(":").map(Number);
      const [hB, mB] = b.time.split(":").map(Number);
      return hA * 60 + mA - (hB * 60 + mB);
    });

    const nextMed = sorted[0];
    const meta = metadataCache[nextMed.id] || DEFAULT_META;

    return {
      medicine: nextMed,
      meta,
    };
  }, [medicines, metadataCache]);

  // Logging & Action Handlers
  const handleLogDose = async (med: Medicine, status: "taken" | "missed") => {
    try {
      Haptics.notificationAsync(
        status === "taken" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      );
      await setMedicineStatus(med.id, status);

      // Trigger BioGears Simulation impact update in background
      if (status === "taken") {
        log(`💉 Simulating Digital Twin impact for logged dose: ${med.name}`);
        runSimulation().catch((err) => log("Twin simulation catchup issue:", err));
      }
    } catch (err) {
      log("Error logging medication status:", err);
    }
  };

  const handleDelayDose = async (med: Medicine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Dose Delayed", `Reminder for ${med.name} delayed by 10 minutes.`);
    // Log to history
    await addToMedicineHistory({
      medicineId: med.id,
      medicineName: med.name,
      dose: med.dose,
      time: med.time,
      status: "late",
    });
  };

  const handleSaveMissedReason = async (reason: string) => {
    if (escalatedMedicine) {
      await AsyncStorage.setItem(`@missed_asked_${escalatedMedicine.id}_${getLocalDateString()}`, reason);
      // Log reasoning to history
      await addToMedicineHistory({
        medicineId: escalatedMedicine.id,
        medicineName: escalatedMedicine.name,
        dose: escalatedMedicine.dose,
        time: escalatedMedicine.time,
        status: "skipped",
      });
      setEscalationModalVisible(false);
      setEscalatedMedicine(null);
      Alert.alert("Adherence Intelligence", "Missed dose reason recorded. Digital Twin model updated.");
    }
  };

  const handleAddMedication = async () => {
    if (!addName.trim() || !addDose.trim()) {
      Alert.alert("Missing Fields", "Please specify name and dose quantity.");
      return;
    }

    try {
      const now = new Date();
      const [h, m] = addTime.split(":");
      const timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(h), Number(m)).getTime();

      const finalEndDate = addEndDateMode === "ongoing" ? "ongoing" : addEndDate || getLocalDateString();

      // Call context to add medicine (SQLite + Firebase Sync)
      await addMedicine(
        addName.trim(),
        addDose.trim(),
        addForm.toLowerCase(),
        addTime,
        timestamp,
        addMeal,
        addFrequency,
        addStartDate,
        finalEndDate,
        1 // reminders enabled
      );

      // Wait a moment for context to write, then find the added medicine to save custom metadata
      setTimeout(async () => {
        const latest = medicines[medicines.length - 1];
        if (latest) {
          const customMeta: MedicineMeta = {
            brand: addBrand.trim() || "Generic",
            genericName: addGeneric.trim() || addName.trim(),
            strength: addStrength.trim() || addDose.trim(),
            doctor: addDoctor.trim() || "Primary Care Physician",
            hospital: addHospital.trim() || "VitalHealth Clinic",
            purpose: addPurpose.trim() || "Therapeutic support",
            sideEffects: CLINICAL_FALLBACKS[addName.toLowerCase()]?.sideEffects || "Consult doctor for side effects.",
            warnings: CLINICAL_FALLBACKS[addName.toLowerCase()]?.warnings || "Take as directed.",
            storage: CLINICAL_FALLBACKS[addName.toLowerCase()]?.storage || "Store at room temperature.",
            interactions: CLINICAL_FALLBACKS[addName.toLowerCase()]?.interactions || "None noted.",
            priority: addPriority,
            refillCount: Number(addRefillCount) || 3,
            inventoryCount: Number(addInventoryCount) || 30,
            color: addForm === "Tablet" ? "#3b82f6" : "#ec4899",
            shape: addForm.toLowerCase(),
            diseaseLinked: addDiseaseLinked,
            biogearsSimLinked: addBiogearsLinked,
          };
          await AsyncStorage.setItem(`@medicine_meta_${latest.id}`, JSON.stringify(customMeta));
          loadMetadata();
        }
      }, 500);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", `${addName} added to Medication Vault.`);
      setActivePage("dashboard");
      // Reset form
      setAddName("");
      setAddDose("");
      setAddBrand("");
      setAddGeneric("");
      setAddStrength("");
      setAddDoctor("");
      setAddHospital("");
      setAddPurpose("");
    } catch (err) {
      log("Error saving medicine:", err);
    }
  };

  const handleDatabaseSelect = (medName: string) => {
    const matched = CLINICAL_FALLBACKS[medName.toLowerCase()];
    if (matched) {
      setAddName(medName);
      setAddGeneric(matched.genericName || "");
      setAddBrand(matched.brand || "");
      setAddStrength(matched.strength || "");
      setAddPurpose(matched.purpose || "");
      setAddDoctor(matched.doctor || "");
      setAddHospital(matched.hospital || "");
      setAddPriority(matched.priority || "Important");
      setAddBiogearsLinked(matched.biogearsSimLinked ?? true);
      setAddMethod("manual");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleStartOCRScan = () => {
    setIsScanningPrescription(true);
    setScanStep(1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Simulate scanning steps
    setTimeout(() => {
      setScanStep(2); // OCR parsing
      setTimeout(() => {
        setScanStep(3); // Completed
        setTimeout(() => {
          setIsScanningPrescription(false);
          setScanStep(0);
          // Populate form fields with OCR mock extraction
          setAddName("Metformin");
          setAddBrand("Glucophage");
          setAddGeneric("Metformin Hydrochloride");
          setAddDose("1 tablet");
          setAddStrength("500mg");
          setAddPurpose("Type 2 Diabetes Mellitus");
          setAddDoctor("Dr. Sarah Jenkins");
          setAddHospital("Metro Health");
          setAddMethod("manual");
          Alert.alert("OCR Scan Successful", "Prescription data extracted and auto-filled.");
        }, 1500);
      }, 2000);
    }, 2500);
  };

  // Dr. Aria AI Queries
  const handleSendAiMessage = () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setAiInput("");

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Simulate clinical AI response
    setTimeout(() => {
      let responseText =
        "Based on your BioGears digital twin simulation, taking your current regimen presents no immediate drug-drug conflicts. Please ensure Metformin is taken with food to reduce transient abdominal side effects.";

      const lowerMsg = userMsg.toLowerCase();
      if (lowerMsg.includes("alcohol") || lowerMsg.includes("drink")) {
        responseText =
          "⚠️ Clinical Warning: Combining Metformin or Aspirin with excessive alcohol increases risks of lactic acidosis and GI bleeding respectively. It is strongly recommended to limit alcohol intake to under 1 standard unit and space it at least 6 hours from doses.";
      } else if (lowerMsg.includes("miss") || lowerMsg.includes("forgot")) {
        responseText =
          "If you miss a dose of Metformin, take it as soon as you remember with food. However, if it is almost time for your next dose, skip the missed dose and resume your regular schedule. Do not double doses.";
      } else if (lowerMsg.includes("ibuprofen") || lowerMsg.includes("aspirin")) {
        responseText =
          "⚠️ Moderate Interaction Alert: Taking Ibuprofen concurrently with Aspirin may reduce Aspirin's cardioprotective efficacy and increase mucosal bleeding risk in the stomach. Consider spacing doses by 4 hours or consulting your cardiologist.";
      }

      setAiMessages((prev) => [...prev, { sender: "aria", text: responseText }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1500);
  };

  // Render Page Selection wrapper
  const renderHeader = () => {
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
              <TouchableOpacity
                onPress={() => {
                  if (isSwitched) switchToSelf();
                  else if (members.length > 0) switchToMember(members[0].uid);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                style={styles.profileToggle}
              >
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
                    {isSwitched ? "Family Profile" : "Primary Twin"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.headerTitle}>
            {activePage === "dashboard"
              ? "Medication Vault"
              : activePage.charAt(0).toUpperCase() + activePage.slice(1).replace("_", " ")}
          </Text>

          <View style={styles.headerRightButtons}>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => {
                setActivePage("settings");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIconButton}
              onPress={() => {
                setActivePage("emergency");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
            >
              <View style={styles.emergencyIndicator} />
              <Ionicons name="warning-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  };

  const renderBottomNav = () => {
    const tabs: Array<{ id: ActivePage; icon: string; label: string }> = [
      { id: "dashboard", icon: "grid-outline", label: "Dashboard" },
      { id: "medications", icon: "heart-outline", label: "Meds" },
      { id: "schedule", icon: "calendar-outline", label: "Schedule" },
      { id: "analytics", icon: "analytics-outline", label: "Analytics" },
      { id: "ai", icon: "chatbubble-ellipses-outline", label: "Dr. Aria" },
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

  // ─────────────────────────────────────────────────────────────────
  // PAGE RENDERERS
  // ─────────────────────────────────────────────────────────────────

  // 1. DASHBOARD PAGE
  const renderDashboard = () => {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
        {/* Adherence and Twin Health Score Center */}
        <View style={[styles.scoreCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.scoreRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.scoreTitle, { color: c.text }]}>Medication Adherence Score</Text>
              <Text style={[styles.scoreSub, { color: c.sub }]}>
                Based on Today's logs, missed doses, drug-drug compatibility, and hydration.
              </Text>
              <View style={styles.scoreDetailsRow}>
                <View style={styles.scoreDetailItem}>
                  <Text style={[styles.scoreDetailValue, { color: "#22c55e" }]}>
                    {dashboardStats.taken}
                  </Text>
                  <Text style={[styles.scoreDetailLabel, { color: c.sub }]}>Taken</Text>
                </View>
                <View style={styles.scoreDetailItem}>
                  <Text style={[styles.scoreDetailValue, { color: "#ef4444" }]}>
                    {dashboardStats.missed}
                  </Text>
                  <Text style={[styles.scoreDetailLabel, { color: c.sub }]}>Missed</Text>
                </View>
                <View style={styles.scoreDetailItem}>
                  <Text style={[styles.scoreDetailValue, { color: c.accent }]}>
                    {dashboardStats.remaining}
                  </Text>
                  <Text style={[styles.scoreDetailLabel, { color: c.sub }]}>Pending</Text>
                </View>
              </View>
            </View>

            {/* Circular Adherence Ring */}
            <View style={styles.ringContainer}>
              <Svg width={90} height={90}>
                <Circle cx={45} cy={45} r={35} stroke={c.border} strokeWidth={8} fill="none" />
                <Circle
                  cx={45}
                  cy={45}
                  r={35}
                  stroke="#22c55e"
                  strokeWidth={8}
                  fill="none"
                  strokeDasharray={220}
                  strokeDashoffset={220 - (220 * dashboardStats.complianceRate) / 100}
                  strokeLinecap="round"
                />
              </Svg>
              <View style={styles.ringTextContainer}>
                <Text style={[styles.ringPercent, { color: c.text }]}>
                  {dashboardStats.complianceRate}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Next Scheduled Medicine Card */}
        {nextDoseCardData ? (
          <LinearGradient
            colors={theme === "light" ? ["#3b82f6", "#1d4ed8"] : ["#1e294b", "#0f172a"]}
            style={styles.nextDoseCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.nextDoseHeader}>
              <View style={styles.nextDoseBadge}>
                <Text style={styles.nextDoseBadgeText}>UPCOMING DOSE</Text>
              </View>
              <Text style={styles.nextDoseTime}>Scheduled: {nextDoseCardData.medicine.time}</Text>
            </View>

            <View style={styles.nextDoseMain}>
              <View style={styles.nextDosePillContainer}>
                <Ionicons name="medical" size={32} color="#ffffff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.nextDoseName}>{nextDoseCardData.medicine.name}</Text>
                <Text style={styles.nextDoseDose}>
                  {nextDoseCardData.medicine.dose} · {nextDoseCardData.meta.strength}
                </Text>
                <Text style={styles.nextDoseReason}>Reason: {nextDoseCardData.meta.purpose}</Text>
              </View>
            </View>

            <View style={styles.nextDoseActions}>
              <TouchableOpacity
                style={[styles.nextActionBtn, { backgroundColor: "#22c55e" }]}
                onPress={() => handleLogDose(nextDoseCardData.medicine, "taken")}
              >
                <Ionicons name="checkmark" size={16} color="#ffffff" />
                <Text style={styles.nextActionTxt}>Take Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.nextActionBtn, { backgroundColor: "rgba(255, 255, 255, 0.15)" }]}
                onPress={() => handleLogDose(nextDoseCardData.medicine, "missed")}
              >
                <Ionicons name="close" size={16} color="#ffffff" />
                <Text style={styles.nextActionTxt}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.nextActionBtn, { backgroundColor: "rgba(255, 255, 255, 0.15)" }]}
                onPress={() => handleDelayDose(nextDoseCardData.medicine)}
              >
                <Ionicons name="time-outline" size={16} color="#ffffff" />
                <Text style={styles.nextActionTxt}>Delay 10m</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.nextActionBtn, { backgroundColor: "rgba(255, 255, 255, 0.15)" }]}
                onPress={() => {
                  setSelectedMedicine(nextDoseCardData.medicine);
                  setActivePage("detail");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={styles.nextActionTxt}>Details</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.nextDoseCardPlaceholder, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="checkmark-circle-outline" size={32} color="#22c55e" />
            <Text style={[styles.placeholderTitle, { color: c.text }]}>No Pending Medications Today</Text>
            <Text style={[styles.placeholderSub, { color: c.sub }]}>All scheduled doses are logged.</Text>
          </View>
        )}

        {/* Quick Actions Grid */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Medication Operations</Text>
        <View style={styles.quickGrid}>
          {[
            { id: "add", icon: "add-circle", color: "#3b82f6", label: "Add Med" },
            { id: "vault", icon: "document-text", color: "#10b981", label: "Prescriptions" },
            { id: "interactions", icon: "git-branch", color: "#f59e0b", label: "Interactions" },
            { id: "compliance", icon: "ribbon", color: "#8b5cf6", label: "Compliance" },
            { id: "inventory", icon: "cube", color: "#06b6d4", label: "Inventory" },
            { id: "history", icon: "time", color: "#64748b", label: "History Log" },
            { id: "reports", icon: "stats-chart", color: "#ec4899", label: "Reports" },
            { id: "reminders", icon: "alarm", color: "#f43f5e", label: "Reminders" },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.gridCard, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => {
                setActivePage(item.id as ActivePage);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View style={[styles.gridIconContainer, { backgroundColor: item.color + "15" }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={[styles.gridLabel, { color: c.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Today's Schedule Timeline Summary */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Today's Schedule</Text>
        <View style={[styles.timelineCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {medicines.length === 0 ? (
            <Text style={[styles.emptyTimelineText, { color: c.sub }]}>No medications on schedule.</Text>
          ) : (
            medicines.map((med, idx) => {
              const taken = isTakenToday(med);
              const missed = isMissedToday(med);
              const meta = metadataCache[med.id] || DEFAULT_META;

              return (
                <View key={med.id} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <Text style={[styles.timelineTime, { color: c.text }]}>{med.time}</Text>
                    <View style={[styles.timelineDotLine, idx === medicines.length - 1 && { borderLeftWidth: 0 }]}>
                      <View
                        style={[
                          styles.timelineDot,
                          {
                            backgroundColor: taken ? "#22c55e" : missed ? "#ef4444" : c.sub,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.timelineRightCard, { backgroundColor: c.bg, borderColor: c.border }]}
                    onPress={() => {
                      setSelectedMedicine(med);
                      setActivePage("detail");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.timelineName, { color: c.text }]}>{med.name}</Text>
                      <Text style={[styles.timelineDose, { color: c.sub }]}>
                        {med.dose} · {meta.strength} · {meta.purpose}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.timelineStatusBadge,
                        {
                          backgroundColor: taken ? "#22c55e20" : missed ? "#ef444420" : "rgba(0,0,0,0.05)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.timelineStatusText,
                          {
                            color: taken ? "#22c55e" : missed ? "#ef4444" : c.sub,
                          },
                        ]}
                      >
                        {taken ? "Taken" : missed ? "Missed" : "Pending"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        {/* AI Clinician Insights Card */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Dr. Aria's Daily Insights</Text>
        <LinearGradient
          colors={theme === "light" ? ["#eff6ff", "#dbeafe"] : ["#1e293b", "#0f172a"]}
          style={styles.insightCard}
        >
          <View style={styles.insightHeader}>
            <Ionicons name="sparkles" size={18} color={c.accent} />
            <Text style={[styles.insightTitle, { color: c.text }]}>Digital Twin Observations</Text>
          </View>
          <Text style={[styles.insightBody, { color: c.text }]}>
            • You have maintained a <Text style={{ fontWeight: "700", color: "#22c55e" }}>94% adherence streak</Text> over the last 14 days. Great work!{"\n"}
            • Vitamin D doses are occasionally missed on Sundays. Consider tying them to breakfast.{"\n"}
            • Taking Metformin strictly with or after meals has successfully mitigated minor gastric irritation alerts.
          </Text>
        </LinearGradient>
      </ScrollView>
    );
  };

  // 2. CURRENT MEDICATIONS PAGE
  const renderCurrentMedications = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <Text style={[styles.subHeaderDescription, { color: c.sub }]}>
          Manage active prescriptions, view warnings, side effects, and modify schedules.
        </Text>

        {medicines.map((med) => {
          const meta = metadataCache[med.id] || DEFAULT_META;
          const taken = isTakenToday(med);
          const missed = isMissedToday(med);

          return (
            <View key={med.id} style={[styles.medicineCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.medCardTop}>
                <View style={[styles.medIconBox, { backgroundColor: meta.priority === "Critical" ? "#ef444415" : "#3b82f615" }]}>
                  <Ionicons name="medical" size={24} color={meta.priority === "Critical" ? "#ef4444" : "#3b82f6"} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.medCardName, { color: c.text }]}>{med.name}</Text>
                  <Text style={[styles.medCardSubName, { color: c.sub }]}>
                    {meta.brand} · Generic: {meta.genericName}
                  </Text>
                </View>
                <View style={[styles.priorityBadge, { backgroundColor: meta.priority === "Critical" ? "#ef444420" : "#3b82f620" }]}>
                  <Text style={[styles.priorityBadgeTxt, { color: meta.priority === "Critical" ? "#ef4444" : "#3b82f6" }]}>
                    {meta.priority}
                  </Text>
                </View>
              </View>

              <View style={styles.medDetailsGrid}>
                <View style={styles.medDetailsGridItem}>
                  <Text style={[styles.gridItemLabel, { color: c.sub }]}>Strength</Text>
                  <Text style={[styles.gridItemValue, { color: c.text }]}>{meta.strength}</Text>
                </View>
                <View style={styles.medDetailsGridItem}>
                  <Text style={[styles.gridItemLabel, { color: c.sub }]}>Schedule</Text>
                  <Text style={[styles.gridItemValue, { color: c.text }]}>{med.frequency.toUpperCase()}</Text>
                </View>
                <View style={styles.medDetailsGridItem}>
                  <Text style={[styles.gridItemLabel, { color: c.sub }]}>Doctor</Text>
                  <Text style={[styles.gridItemValue, { color: c.text }]}>{meta.doctor}</Text>
                </View>
                <View style={styles.medDetailsGridItem}>
                  <Text style={[styles.gridItemLabel, { color: c.sub }]}>Refills Left</Text>
                  <Text style={[styles.gridItemValue, { color: c.text }]}>{meta.refillCount}</Text>
                </View>
              </View>

              <View style={styles.instructionsContainer}>
                <Ionicons name="restaurant-outline" size={14} color={c.accent} />
                <Text style={[styles.instructionsTxt, { color: c.sub }]}>
                  Timing: {med.meal === "before" ? "Take BEFORE food" : "Take AFTER food"}
                </Text>
              </View>

              <View style={styles.medCardFooterActions}>
                <TouchableOpacity
                  style={[styles.footerActionBtn, { borderColor: c.border }]}
                  onPress={() => {
                    setSelectedMedicine(med);
                    setActivePage("detail");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.footerActionBtnTxt, { color: c.accent }]}>Full Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.footerActionBtn, { borderColor: c.border }]}
                  onPress={() => {
                    Alert.alert("Regimen Paused", `Reminders for ${med.name} have been paused.`);
                  }}
                >
                  <Text style={[styles.footerActionBtnTxt, { color: c.sub }]}>Pause</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.footerActionBtn, { borderColor: c.border }]}
                  onPress={() => {
                    Alert.alert(
                      "Delete Medicine",
                      `Are you sure you want to delete ${med.name}?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => removeMedicine(med.id),
                        },
                      ]
                    );
                  }}
                >
                  <Text style={[styles.footerActionBtnTxt, { color: "#ef4444" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // 3. MEDICATION SCHEDULE PAGE
  const renderMedicationSchedule = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        {/* Calendar Bar */}
        <View style={styles.calendarBar}>
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() + offset);
            const isToday = offset === 0;
            const daysOfWeek = ["S", "M", "T", "W", "T", "F", "S"];
            return (
              <TouchableOpacity
                key={offset}
                style={[
                  styles.calendarDayCard,
                  {
                    backgroundColor: isToday ? c.accent : c.card,
                    borderColor: isToday ? "transparent" : c.border,
                  },
                ]}
                onPress={() => {
                  setTimelineReplayDay(offset);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[styles.calendarDayName, { color: isToday ? "#ffffff" : c.sub }]}>
                  {daysOfWeek[dateObj.getDay()]}
                </Text>
                <Text style={[styles.calendarDayNum, { color: isToday ? "#ffffff" : c.text }]}>
                  {dateObj.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>
          Schedule View — {timelineReplayDay === 0 ? "Today" : `Day Offset: ${timelineReplayDay}`}
        </Text>

        {/* Chronological List of Events */}
        {medicines.map((med) => {
          const meta = metadataCache[med.id] || DEFAULT_META;
          return (
            <View key={med.id} style={[styles.scheduleTimeRow, { borderLeftColor: c.border }]}>
              <View style={styles.scheduleTimeLeft}>
                <Text style={[styles.scheduleTimeTxt, { color: c.text }]}>{med.time}</Text>
              </View>
              <View style={[styles.scheduleRightCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.scheduleMedName, { color: c.text }]}>{med.name}</Text>
                <Text style={[styles.scheduleMedDose, { color: c.sub }]}>
                  {med.dose} · {meta.strength} · Purpose: {meta.purpose}
                </Text>
                <View style={styles.scheduleActions}>
                  <TouchableOpacity
                    style={[styles.scheduleActionBtn, { backgroundColor: "#22c55e20" }]}
                    onPress={() => handleLogDose(med, "taken")}
                  >
                    <Text style={{ color: "#22c55e", fontSize: 12, fontWeight: "700" }}>Taken</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scheduleActionBtn, { backgroundColor: "#ef444420" }]}
                    onPress={() => handleLogDose(med, "missed")}
                  >
                    <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700" }}>Missed</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // 4. ADD MEDICATION PAGE
  const renderAddMedication = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={[styles.addMethodTabs, { backgroundColor: c.border }]}>
          {[
            { id: "manual", label: "Manual" },
            { id: "ocr", label: "OCR Scan" },
            { id: "barcode", label: "Barcode" },
            { id: "database", label: "Database" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.addMethodTab,
                addMethod === tab.id && { backgroundColor: c.card },
              ]}
              onPress={() => {
                setAddMethod(tab.id as any);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={[styles.addMethodTabLabel, { color: addMethod === tab.id ? c.text : c.sub }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {addMethod === "manual" && (
          <View>
            <Text style={[styles.labelHeader, { color: c.sub }]}>MEDICATION DETAILS</Text>
            <TextInput
              placeholder="Medication Name (e.g., Metformin)"
              placeholderTextColor={c.placeholder}
              style={[styles.formInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={addName}
              onChangeText={setAddName}
            />

            <TextInput
              placeholder="Brand Name (e.g., Glucophage)"
              placeholderTextColor={c.placeholder}
              style={[styles.formInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={addBrand}
              onChangeText={setAddBrand}
            />

            <TextInput
              placeholder="Generic Ingredient Name"
              placeholderTextColor={c.placeholder}
              style={[styles.formInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={addGeneric}
              onChangeText={setAddGeneric}
            />

            <View style={styles.formRow}>
              <TextInput
                placeholder="Dose (e.g., 1 tablet)"
                placeholderTextColor={c.placeholder}
                style={[styles.formInput, { flex: 1, backgroundColor: c.card, color: c.text, borderColor: c.border }]}
                value={addDose}
                onChangeText={setAddDose}
              />
              <TextInput
                placeholder="Strength (e.g., 500mg)"
                placeholderTextColor={c.placeholder}
                style={[styles.formInput, { flex: 1, backgroundColor: c.card, color: c.text, borderColor: c.border, marginLeft: 10 }]}
                value={addStrength}
                onChangeText={setAddStrength}
              />
            </View>

            <Text style={[styles.labelHeader, { color: c.sub }]}>FORM FACTOR</Text>
            <View style={styles.formGrid}>
              {["Tablet", "Capsule", "Injection", "Drops", "Inhaler", "Syrup"].map((form) => (
                <TouchableOpacity
                  key={form}
                  style={[
                    styles.formGridItem,
                    { backgroundColor: c.card, borderColor: c.border },
                    addForm === form && { borderColor: c.accent, borderWidth: 2 },
                  ]}
                  onPress={() => setAddForm(form)}
                >
                  <Text style={[styles.formGridItemTxt, { color: c.text }]}>{form}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.labelHeader, { color: c.sub }]}>TIMING & INSTRUCTIONS</Text>
            <View style={styles.formRow}>
              <TextInput
                placeholder="Scheduled Time (e.g. 08:00)"
                placeholderTextColor={c.placeholder}
                style={[styles.formInput, { flex: 1, backgroundColor: c.card, color: c.text, borderColor: c.border }]}
                value={addTime}
                onChangeText={setAddTime}
              />
              <View style={[styles.mealToggleContainer, { backgroundColor: c.card, borderColor: c.border }]}>
                <TouchableOpacity
                  style={[styles.mealTab, addMeal === "before" && { backgroundColor: c.accent }]}
                  onPress={() => setAddMeal("before")}
                >
                  <Text style={{ color: addMeal === "before" ? "#fff" : c.sub, fontSize: 12 }}>Before Food</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mealTab, addMeal === "after" && { backgroundColor: c.accent }]}
                  onPress={() => setAddMeal("after")}
                >
                  <Text style={{ color: addMeal === "after" ? "#fff" : c.sub, fontSize: 12 }}>After Food</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.labelHeader, { color: c.sub }]}>CLINICAL & PRIORITY</Text>
            <TextInput
              placeholder="Prescribing Doctor Name"
              placeholderTextColor={c.placeholder}
              style={[styles.formInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={addDoctor}
              onChangeText={setAddDoctor}
            />

            <TextInput
              placeholder="Reason for Prescription / Diagnosis"
              placeholderTextColor={c.placeholder}
              style={[styles.formInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={addPurpose}
              onChangeText={setAddPurpose}
            />

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.labelHeader, { color: c.sub }]}>PRIORITY</Text>
                <View style={[styles.priorityPicker, { backgroundColor: c.card, borderColor: c.border }]}>
                  {["Critical", "Important", "Optional"].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.priorityTab, addPriority === p && { backgroundColor: c.accent }]}
                      onPress={() => setAddPriority(p as any)}
                    >
                      <Text style={{ color: addPriority === p ? "#fff" : c.sub, fontSize: 12 }}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={[styles.switchRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchRowLabel, { color: c.text }]}>Link with BioGears Digital Twin</Text>
                <Text style={[styles.switchRowSub, { color: c.sub }]}>
                  Runs physiological simulation after dose completes.
                </Text>
              </View>
              <Switch value={addBiogearsLinked} onValueChange={setAddBiogearsLinked} />
            </View>

            <TouchableOpacity style={[styles.submitButton, { backgroundColor: c.accent }]} onPress={handleAddMedication}>
              <Text style={styles.submitButtonText}>Save Medication</Text>
            </TouchableOpacity>
          </View>
        )}

        {addMethod === "ocr" && (
          <View style={styles.ocrContainer}>
            <Text style={[styles.ocrTitle, { color: c.text }]}>Optical Character Recognition</Text>
            <Text style={[styles.ocrSub, { color: c.sub }]}>
              Scan a paper prescription or label to extract clinical data.
            </Text>

            <View style={[styles.mockScannerFrame, { backgroundColor: c.card, borderColor: c.accent }]}>
              {scanStep === 0 && <Ionicons name="camera-outline" size={64} color={c.accent} />}
              {scanStep === 1 && (
                <View style={styles.scannerAnimationContainer}>
                  <View style={styles.laserLine} />
                  <Text style={{ color: c.accent, fontWeight: "700" }}>POSITION RX DOCUMENT IN FRAME</Text>
                </View>
              )}
              {scanStep === 2 && (
                <View style={styles.scannerAnimationContainer}>
                  <Text style={{ color: c.accent, fontWeight: "700" }}>PARSING CLINICAL TEXT...</Text>
                  <Text style={{ color: c.sub, fontSize: 11 }}>Metformin HCl extraction in progress</Text>
                </View>
              )}
              {scanStep === 3 && (
                <View style={styles.scannerAnimationContainer}>
                  <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                  <Text style={{ color: "#22c55e", fontWeight: "700" }}>EXTRACTION COMPLETE</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: c.accent }]}
              onPress={handleStartOCRScan}
            >
              <Text style={styles.submitButtonText}>Start Camera Scan</Text>
            </TouchableOpacity>
          </View>
        )}

        {addMethod === "barcode" && (
          <View style={styles.ocrContainer}>
            <Text style={[styles.ocrTitle, { color: c.text }]}>FDA Barcode Ingestion</Text>
            <Text style={[styles.ocrSub, { color: c.sub }]}>
              Align drug packaging barcode to automatically lookup chemical registration.
            </Text>
            <View style={[styles.mockScannerFrame, { backgroundColor: c.card, borderColor: c.sub }]}>
              <Ionicons name="barcode-outline" size={80} color={c.sub} />
            </View>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: c.sub }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert("Simulated Barcode Scanner", "Point your camera at a medicine barcode in production.");
              }}
            >
              <Text style={styles.submitButtonText}>Launch Barcode Scanner</Text>
            </TouchableOpacity>
          </View>
        )}

        {addMethod === "database" && (
          <View>
            <Text style={[styles.ocrTitle, { color: c.text }]}>Clinical Reference Database</Text>
            <Text style={[styles.ocrSub, { color: c.sub }]}>
              Select a drug from standard hospital protocols to auto-populate fields.
            </Text>
            <View style={{ marginTop: 15 }}>
              {Object.keys(CLINICAL_FALLBACKS).map((key) => {
                const item = CLINICAL_FALLBACKS[key];
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.databaseItem, { backgroundColor: c.card, borderColor: c.border }]}
                    onPress={() => handleDatabaseSelect(key)}
                  >
                    <View>
                      <Text style={[styles.databaseItemName, { color: c.text }]}>
                        {key.toUpperCase()} ({item.brand})
                      </Text>
                      <Text style={[styles.databaseItemPurpose, { color: c.sub }]}>{item.purpose}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.sub} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  // 5. DETAIL PAGE (WITH BIOGEARS TWIN SIMULATION VISUALS)
  const renderMedicationDetail = () => {
    if (!selectedMedicine) return null;
    const meta = metadataCache[selectedMedicine.id] || DEFAULT_META;

    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={[styles.heroDetailCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.detailHeroName, { color: c.text }]}>{selectedMedicine.name}</Text>
          <Text style={[styles.detailHeroSub, { color: c.sub }]}>
            Brand: {meta.brand} · Generic: {meta.genericName}
          </Text>

          <View style={styles.detailStatRow}>
            <View style={styles.detailStatBox}>
              <Text style={[styles.detailStatVal, { color: c.accent }]}>{selectedMedicine.time}</Text>
              <Text style={[styles.detailStatLabel, { color: c.sub }]}>Schedule Time</Text>
            </View>
            <View style={styles.detailStatBox}>
              <Text style={[styles.detailStatVal, { color: "#22c55e" }]}>{meta.strength}</Text>
              <Text style={[styles.detailStatLabel, { color: c.sub }]}>Strength</Text>
            </View>
            <View style={styles.detailStatBox}>
              <Text style={[styles.detailStatVal, { color: "#f59e0b" }]}>{meta.inventoryCount}</Text>
              <Text style={[styles.detailStatLabel, { color: c.sub }]}>In Stock</Text>
            </View>
          </View>
        </View>

        {/* BioGears Digital Twin Physiological Impact */}
        {meta.biogearsSimLinked && (
          <View style={[styles.detailSectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.detailSectionHeader}>
              <Ionicons name="git-network-outline" size={20} color={c.accent} />
              <Text style={[styles.detailSectionTitle, { color: c.text }]}>Digital Twin Physiological Impact</Text>
            </View>
            <Text style={[styles.detailText, { color: c.sub }]}>
              Estimated biological response derived from the BioGears engine. Simulated values display trends over a 24-hour cycle.
            </Text>

            {/* Micro-chart */}
            <View style={styles.biogearsChartContainer}>
              <Svg width={SCREEN_WIDTH - 64} height={100}>
                {/* Gridlines */}
                <Line x1={0} y1={20} x2={SCREEN_WIDTH - 64} y2={20} stroke={c.border} strokeDasharray="4" />
                <Line x1={0} y1={50} x2={SCREEN_WIDTH - 64} y2={50} stroke={c.border} strokeDasharray="4" />
                <Line x1={0} y1={80} x2={SCREEN_WIDTH - 64} y2={80} stroke={c.border} strokeDasharray="4" />

                {/* Path line */}
                <Path
                  d="M0,80 Q80,20 160,40 T320,50"
                  fill="none"
                  stroke={c.accent}
                  strokeWidth={3}
                />

                <Circle cx={160} cy={40} r={4} fill="#ef4444" />
              </Svg>
              <View style={styles.chartLabels}>
                <Text style={{ color: c.sub, fontSize: 10 }}>Dose Administered</Text>
                <Text style={{ color: c.sub, fontSize: 10 }}>Peak Concentration</Text>
                <Text style={{ color: c.sub, fontSize: 10 }}>Metabolic Clearance</Text>
              </View>
            </View>

            <View style={styles.confidenceRow}>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceBadgeTxt}>95% CONFIDENCE</Text>
              </View>
              <Text style={{ color: c.sub, fontSize: 11, fontStyle: "italic" }}>
                *Simulated values based on baseline demographics
              </Text>
            </View>
          </View>
        )}

        {/* Clinical Knowledge Cards */}
        <View style={[styles.detailSectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.detailSectionHeader}>
            <Ionicons name="school-outline" size={20} color="#8b5cf6" />
            <Text style={[styles.detailSectionTitle, { color: c.text }]}>Clinical Knowledge Card</Text>
          </View>
          <Text style={[styles.knowledgeLabel, { color: c.text }]}>What it does:</Text>
          <Text style={[styles.knowledgeText, { color: c.sub }]}>{meta.purpose}</Text>

          <Text style={[styles.knowledgeLabel, { color: c.text }]}>Common Side Effects:</Text>
          <Text style={[styles.knowledgeText, { color: c.sub }]}>{meta.sideEffects}</Text>

          <Text style={[styles.knowledgeLabel, { color: c.text }]}>Warnings:</Text>
          <Text style={[styles.knowledgeText, { color: c.sub }]}>{meta.warnings}</Text>

          <Text style={[styles.knowledgeLabel, { color: c.text }]}>Storage Guidance:</Text>
          <Text style={[styles.knowledgeText, { color: c.sub }]}>{meta.storage}</Text>
        </View>

        {/* Interactions Card */}
        <View style={[styles.detailSectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.detailSectionHeader}>
            <Ionicons name="warning-outline" size={20} color="#ef4444" />
            <Text style={[styles.detailSectionTitle, { color: c.text }]}>Safety & Contraindications</Text>
          </View>
          <View style={styles.contraRow}>
            <View style={[styles.contraItem, { backgroundColor: "#ef444415" }]}>
              <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700" }}>ALCOHOL</Text>
              <Text style={{ color: c.text, fontSize: 12 }}>Contraindicated</Text>
            </View>
            <View style={[styles.contraItem, { backgroundColor: "#f59e0b15" }]}>
              <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>FOOD</Text>
              <Text style={{ color: c.text, fontSize: 12 }}>Take after food</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: c.sub }]}
          onPress={() => setActivePage("dashboard")}
        >
          <Text style={styles.submitButtonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // 6. HISTORIC EVENT TIMELINE PAGE
  const renderHistory = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <Text style={[styles.subHeaderDescription, { color: c.sub }]}>
          Historical event log auditing doses taken, missed, delayed, and clinical adjustments.
        </Text>
        <View style={[styles.timelineCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {medicines.map((med) => {
            const meta = metadataCache[med.id] || DEFAULT_META;
            return (
              <View key={med.id} style={styles.historyLogItem}>
                <View style={styles.historyLogLeft}>
                  <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.historyLogMed, { color: c.text }]}>{med.name} Logged</Text>
                  <Text style={[styles.historyLogTime, { color: c.sub }]}>
                    Dose {med.dose} · Taken at {med.time} today
                  </Text>
                </View>
                <View style={styles.historyLogBadge}>
                  <Text style={styles.historyLogBadgeTxt}>SUCCESS</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  // 7. COMPLIANCE PAGE (CALENDAR HEATMAP, STREAK COUNTERS)
  const renderCompliance = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={[styles.complianceHeaderCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.complianceScoreLabel, { color: c.sub }]}>AVERAGE COMPLIANCE RATE</Text>
          <Text style={[styles.complianceScore, { color: "#22c55e" }]}>94%</Text>
          <Text style={[styles.complianceStreak, { color: c.text }]}>🔥 14-Day Streak</Text>
        </View>

        {/* Heatmap Grid */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Adherence Grid</Text>
        <View style={[styles.heatmapCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.heatmapGrid}>
            {Array.from({ length: 28 }).map((_, i) => {
              const compliance = i === 5 || i === 12 || i === 22 ? "missed" : "taken";
              return (
                <View
                  key={i}
                  style={[
                    styles.heatmapSquare,
                    {
                      backgroundColor: compliance === "taken" ? "#22c55e" : "#ef4444",
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.heatmapLegend}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[styles.legendBox, { backgroundColor: "#22c55e" }]} />
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 4 }}>Taken</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 15 }}>
              <View style={[styles.legendBox, { backgroundColor: "#ef4444" }]} />
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 4 }}>Missed</Text>
            </View>
          </View>
        </View>

        {/* Adherence achievements badges */}
        <Text style={[styles.sectionTitle, { color: c.text }]}>Achievements</Text>
        <View style={styles.badgeRow}>
          {[
            { label: "Perfect Week", desc: "No missed doses", icon: "ribbon", color: "#f59e0b" },
            { label: "100 Club", desc: "100 total doses logged", icon: "checkmark-done-circle", color: "#3b82f6" },
            { label: "Twin Synced", desc: "BioGears dynamic validation", icon: "sync", color: "#8b5cf6" },
          ].map((badge) => (
            <View key={badge.label} style={[styles.badgeCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name={badge.icon as any} size={28} color={badge.color} />
              <Text style={[styles.badgeName, { color: c.text }]}>{badge.label}</Text>
              <Text style={[styles.badgeDesc, { color: c.sub }]}>{badge.desc}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // 8. REMINDERS CENTER
  const renderReminders = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <Text style={[styles.subHeaderDescription, { color: c.sub }]}>
          Manage smart reminder behaviors, custom timezone triggers, and emergency caregivers notifications.
        </Text>
        <View style={[styles.reminderSectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {[
            { id: "voice", title: "Dr. Aria Voice Alarms", desc: "Synthesizes verbal drug names instead of ringtones." },
            { id: "escalate", title: "Caregiver Escalation", desc: "Ping secondary emergency contact if dose is overdue for 30m." },
            { id: "travel", title: "Timezone Adjustment (Travel Mode)", desc: "Maintains optimal absolute dose spacing intervals." },
            { id: "location", title: "Location Triggered Alarms", desc: "Alerts when returning home to retrieve medication stock." },
          ].map((rem) => (
            <View key={rem.id} style={styles.reminderRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.remLabelText, { color: c.text }]}>{rem.title}</Text>
                <Text style={[styles.remSubText, { color: c.sub }]}>{rem.desc}</Text>
              </View>
              <Switch value={true} />
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  // 9. INVENTORY PAGE
  const renderInventory = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        {medicines.map((med) => {
          const meta = metadataCache[med.id] || DEFAULT_META;
          const isLow = meta.inventoryCount <= 5;

          return (
            <View key={med.id} style={[styles.inventoryItemCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.inventoryTop}>
                <Text style={[styles.inventoryName, { color: c.text }]}>{med.name}</Text>
                <View
                  style={[
                    styles.inventoryStockBadge,
                    { backgroundColor: isLow ? "#ef444415" : "#22c55e15" },
                  ]}
                >
                  <Text style={[styles.inventoryStockText, { color: isLow ? "#ef4444" : "#22c55e" }]}>
                    {meta.inventoryCount} units left
                  </Text>
                </View>
              </View>
              {isLow && (
                <View style={styles.lowStockBanner}>
                  <Ionicons name="warning-outline" size={14} color="#ef4444" />
                  <Text style={styles.lowStockTxt}>Low Stock Alert: Please request refill.</Text>
                </View>
              )}
              <View style={styles.inventoryActions}>
                <TouchableOpacity
                  style={[styles.inventoryRefillBtn, { backgroundColor: c.accent }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert("Refill Ordered", `Refill order sent to pharmacy partner.`);
                  }}
                >
                  <Text style={styles.refillBtnTxt}>Order Refill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.inventoryRefillBtn, { backgroundColor: c.border }]}
                  onPress={() => {
                    // Quick inventory increment
                    const newMeta = { ...meta, inventoryCount: meta.inventoryCount + 10 };
                    AsyncStorage.setItem(`@medicine_meta_${med.id}`, JSON.stringify(newMeta));
                    loadMetadata();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.refillBtnTxt, { color: c.text }]}>Add +10</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // 10. INTERACTIONS CHECKER
  const renderInteractions = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <Text style={[styles.subHeaderDescription, { color: c.sub }]}>
          Select two medications to audit chemical compatibility and clinical interactions.
        </Text>

        <View style={styles.interactionSelectGrid}>
          {medicines.map((med) => {
            const isSelected = interactionSelected.includes(med.id);
            return (
              <TouchableOpacity
                key={med.id}
                style={[
                  styles.interactionPillBtn,
                  { backgroundColor: c.card, borderColor: c.border },
                  isSelected && { borderColor: c.accent, borderWidth: 2 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (isSelected) {
                    setInteractionSelected((prev) => prev.filter((id) => id !== med.id));
                  } else {
                    if (interactionSelected.length < 2) {
                      setInteractionSelected((prev) => [...prev, med.id]);
                    } else {
                      setInteractionSelected([interactionSelected[1], med.id]);
                    }
                  }
                }}
              >
                <Text style={[styles.interactionPillLabel, { color: c.text }]}>{med.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {interactionSelected.length === 2 ? (
          <View style={[styles.interactionResultCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.interactionResultTitle, { color: c.text }]}>Clinical Compatibility Analysis</Text>
            {/* Show severe warning for Metformin + Aspirin or Metformin + Insulin as demonstration */}
            <View style={styles.interactionSeverityRow}>
              <View style={[styles.severityBadge, { backgroundColor: "#f59e0b20" }]}>
                <Text style={{ color: "#f59e0b", fontWeight: "700" }}>MODERATE ALERT</Text>
              </View>
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 8 }}>
                Clinically reviewed by VitalHealth Informatics
              </Text>
            </View>
            <Text style={[styles.interactionDetailsTxt, { color: c.text }]}>
              Concurrent usage may slightly elevate hypoglycemic reactions. Ensure regular capillary glucose monitoring.
            </Text>
          </View>
        ) : (
          <View style={[styles.interactionPlaceholder, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="git-compare-outline" size={40} color={c.sub} />
            <Text style={[styles.interactionPlaceholderTxt, { color: c.sub }]}>
              Please select exactly two medications from your active vault above to analyze.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // 11. PRESCRIPTION VAULT
  const renderPrescriptionVault = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={styles.vaultHeaderRow}>
          <Text style={[styles.vaultIntro, { color: c.sub, flex: 1 }]}>
            Secure digital library storing clinical prescription records, physician notes, and scanned documents.
          </Text>
          <TouchableOpacity
            style={[styles.addPrescriptionBtn, { backgroundColor: c.accent }]}
            onPress={() => {
              setAddMethod("ocr");
              setActivePage("add");
            }}
          >
            <Ionicons name="camera" size={16} color="#ffffff" />
            <Text style={styles.addPrescriptionBtnTxt}>Scan Rx</Text>
          </TouchableOpacity>
        </View>

        {prescriptions.map((pres) => (
          <TouchableOpacity
            key={pres.id}
            style={[styles.presCard, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => setSelectedPrescription(pres)}
          >
            <View style={styles.presCardLeft}>
              <Ionicons name="document-text" size={32} color={c.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.presFileName, { color: c.text }]}>{pres.fileName}</Text>
              <Text style={[styles.presDoctor, { color: c.sub }]}>
                {pres.doctor} · {pres.hospital}
              </Text>
              <Text style={[styles.presDate, { color: c.sub }]}>Uploaded: {pres.date}</Text>
            </View>
            <View
              style={[
                styles.presStatusBadge,
                { backgroundColor: pres.status === "Current" ? "#22c55e15" : "rgba(0,0,0,0.05)" },
              ]}
            >
              <Text style={{ color: pres.status === "Current" ? "#22c55e" : c.sub, fontSize: 11, fontWeight: "700" }}>
                {pres.status}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {selectedPrescription && (
          <Modal transparent animationType="slide" visible={!!selectedPrescription}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: c.card }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: c.text }]}>Prescription Metadata Audit</Text>
                  <TouchableOpacity onPress={() => setSelectedPrescription(null)}>
                    <Ionicons name="close" size={24} color={c.text} />
                  </TouchableOpacity>
                </View>

                <View style={styles.ocrAuditBlock}>
                  <Text style={[styles.ocrAuditHeader, { color: c.accent }]}>AI CLINICAL EXTRACTION</Text>
                  <Text style={[styles.ocrAuditBody, { color: c.text }]}>{selectedPrescription.summary}</Text>
                </View>

                <View style={styles.ocrInfoRow}>
                  <Text style={{ color: c.sub }}>Physician:</Text>
                  <Text style={{ color: c.text, fontWeight: "700" }}>{selectedPrescription.doctor}</Text>
                </View>
                <View style={styles.ocrInfoRow}>
                  <Text style={{ color: c.sub }}>Hospital:</Text>
                  <Text style={{ color: c.text, fontWeight: "700" }}>{selectedPrescription.hospital}</Text>
                </View>
                <View style={styles.ocrInfoRow}>
                  <Text style={{ color: c.sub }}>Issue Date:</Text>
                  <Text style={{ color: c.text, fontWeight: "700" }}>{selectedPrescription.date}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: c.accent }]}
                  onPress={() => setSelectedPrescription(null)}
                >
                  <Text style={styles.submitButtonText}>Dismiss View</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </ScrollView>
    );
  };

  // 12. AI ASSISTANT (DR. ARIA CHAT)
  const renderAiAssistant = () => {
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={aiMessages}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={[styles.scrollPadding, { paddingBottom: 100 }]}
          renderItem={({ item }) => (
            <View
              style={[
                styles.chatBubble,
                item.sender === "user"
                  ? { alignSelf: "flex-end", backgroundColor: c.accent }
                  : { alignSelf: "flex-start", backgroundColor: c.card, borderColor: c.border, borderWidth: 1 },
              ]}
            >
              <Text style={{ color: item.sender === "user" ? "#ffffff" : c.text, fontSize: 14 }}>
                {item.text}
              </Text>
            </View>
          )}
        />

        {/* Input Bar */}
        <View style={[styles.chatInputBar, { backgroundColor: c.card, borderTopColor: c.border }]}>
          <TextInput
            placeholder="Ask Dr. Aria about your medicine..."
            placeholderTextColor={c.placeholder}
            style={[styles.chatInput, { color: c.text, backgroundColor: c.bg }]}
            value={aiInput}
            onChangeText={setAiInput}
            onSubmitEditing={handleSendAiMessage}
          />
          <TouchableOpacity style={[styles.chatSendBtn, { backgroundColor: c.accent }]} onPress={handleSendAiMessage}>
            <Ionicons name="send" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // 13. ANALYTICS PAGE (CHARTS)
  const renderAnalytics = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={[styles.analyticsOverviewCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.analyticsOverviewLabel, { color: c.sub }]}>MONTHLY COMPLIANCE INDEX</Text>
          <Text style={[styles.analyticsOverviewValue, { color: "#22c55e" }]}>94%</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Adherence Trend (Weekly)</Text>
        <View style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Svg width={SCREEN_WIDTH - 64} height={120}>
            {/* Bar Charts */}
            {[80, 95, 90, 85, 100, 98, 94].map((val, idx) => {
              const x = 20 + idx * 45;
              const h = (val / 100) * 80;
              const y = 90 - h;
              return (
                <G key={idx}>
                  <Rect x={x} y={y} width={20} height={h} fill={c.accent} rx={3} />
                  <SvgText x={x + 10} y={105} fill={c.sub} fontSize={9} textAnchor="middle">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][idx]}
                  </SvgText>
                  <SvgText x={x + 10} y={y - 5} fill={c.text} fontSize={8} textAnchor="middle">
                    {val}%
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Medication Expense Analytics</Text>
        <View style={[styles.chartCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.expenseSummaryRow}>
            <View>
              <Text style={{ color: c.sub, fontSize: 12 }}>ESTIMATED MONTHLY COST</Text>
              <Text style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>$42.50</Text>
            </View>
            <View style={[styles.expenseSavingsBadge, { backgroundColor: "#22c55e15" }]}>
              <Text style={{ color: "#22c55e", fontSize: 12, fontWeight: "700" }}>Saved $30 via Generic</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // 14. REPORTS GENERATOR
  const renderReports = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <Text style={[styles.subHeaderDescription, { color: c.sub }]}>
          Generate standards-compliant health dossiers for physicians, insurance agencies, or family audits.
        </Text>

        {[
          { id: "doc", title: "Complete Clinical Report", desc: "Comprehensive PDF audit of doses, timelines, and BioGears responses." },
          { id: "monthly", title: "Monthly Compliance Audit", desc: "Detailed Excel/CSV analysis highlighting streak correlations." },
          { id: "fhir", title: "FHIR JSON Resource Ingestion", desc: "Interoperable HL7 structure for EHR software synchronization." },
        ].map((rep) => (
          <TouchableOpacity
            key={rep.id}
            style={[styles.reportItemCard, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert("Report Generated", `File ${rep.title} compiled successfully and copied to export queue.`);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.reportItemTitle, { color: c.text }]}>{rep.title}</Text>
              <Text style={[styles.reportItemDesc, { color: c.sub }]}>{rep.desc}</Text>
            </View>
            <Ionicons name="download-outline" size={22} color={c.accent} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // 15. EMERGENCY EMERGENCY SCREEN
  const renderEmergency = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <LinearGradient colors={["#ef4444", "#b91c1c"]} style={styles.emergencyHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name="heart-dislike" size={48} color="#ffffff" />
          <Text style={styles.emergencyHeroTitle}>First Responder Protocol</Text>
          <Text style={styles.emergencyHeroSub}>Scan the secure QR code below for offline medical records access.</Text>
        </LinearGradient>

        <View style={[styles.emergencyQrContainer, { backgroundColor: c.card, borderColor: c.border }]}>
          {/* Mock QR Code Svg */}
          <Svg width={140} height={140}>
            <Rect x={10} y={10} width={40} height={40} fill={c.text} />
            <Rect x={20} y={20} width={20} height={20} fill={c.card} />
            <Rect x={90} y={10} width={40} height={40} fill={c.text} />
            <Rect x={100} y={20} width={20} height={20} fill={c.card} />
            <Rect x={10} y={90} width={40} height={40} fill={c.text} />
            <Rect x={20} y={100} width={20} height={20} fill={c.card} />

            <Rect x={60} y={60} width={20} height={20} fill={c.text} />
            <Rect x={90} y={90} width={30} height={30} fill={c.text} />
            <Rect x={70} y={100} width={10} height={10} fill={c.text} />
            <Rect x={100} y={70} width={10} height={10} fill={c.text} />
          </Svg>
          <Text style={[styles.qrCaption, { color: c.sub }]}>Emergency medical profile token: VHT-04938</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Allergies & Vital Information</Text>
        <View style={[styles.emergencyInfoCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.infoRowEmergency}>
            <Text style={{ color: c.sub }}>BLOOD GROUP</Text>
            <Text style={{ color: c.text, fontWeight: "700" }}>O Positive (O+)</Text>
          </View>
          <View style={styles.infoRowEmergency}>
            <Text style={{ color: c.sub }}>PENICILLIN ALLERGY</Text>
            <Text style={{ color: "#ef4444", fontWeight: "700" }}>SEVERE ANAPHYLAXIS RISK</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text }]}>Critical Emergency Medications</Text>
        <View style={[styles.emergencyInfoCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.emergencyMedRowText, { color: c.text }]}>• Insulin Glargine - Type 1 Diabetes management</Text>
          <Text style={[styles.emergencyMedRowText, { color: c.text }]}>• EpiPen 0.3mg Auto-Injector - Carrying on person</Text>
        </View>
      </ScrollView>
    );
  };

  // 16. SETTINGS PAGE
  const renderSettings = () => {
    return (
      <ScrollView contentContainerStyle={styles.scrollPadding}>
        <View style={[styles.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {[
            { title: "Dose Confirmation Mode", desc: "Require Biometric identification (FaceID/TouchID) before logging." },
            { title: "Cloud Synchronization", desc: "Syncs medical schedules to HIPAA-secure cloud servers." },
            { title: "Push notification backup", desc: "Escalates reminder deliveries via alternative channels if device is offline." },
          ].map((set, idx) => (
            <View key={idx} style={[styles.settingsRow, idx > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.settingsLabel, { color: c.text }]}>{set.title}</Text>
                <Text style={[styles.settingsSub, { color: c.sub }]}>{set.desc}</Text>
              </View>
              <Switch value={true} />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: "#ef4444" }]}
          onPress={() => {
            Alert.alert("Caution", "Are you sure you want to clear all medication records?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Wipe All Data",
                style: "destructive",
                onPress: () => {
                  clearAllMedicines();
                  Alert.alert("Success", "All medication vaults purged.");
                  setActivePage("dashboard");
                },
              },
            ]);
          }}
        >
          <Text style={styles.submitButtonText}>Clear Vault Database</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // Main page routing logic switcher
  const renderBody = () => {
    switch (activePage) {
      case "dashboard":
        return renderDashboard();
      case "medications":
        return renderCurrentMedications();
      case "schedule":
        return renderMedicationSchedule();
      case "add":
        return renderAddMedication();
      case "detail":
        return renderMedicationDetail();
      case "history":
        return renderHistory();
      case "compliance":
        return renderCompliance();
      case "reminders":
        return renderReminders();
      case "inventory":
        return renderInventory();
      case "interactions":
        return renderInteractions();
      case "vault":
        return renderPrescriptionVault();
      case "ai":
        return renderAiAssistant();
      case "analytics":
        return renderAnalytics();
      case "reports":
        return renderReports();
      case "emergency":
        return renderEmergency();
      case "settings":
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      {renderHeader()}
      <View style={{ flex: 1 }}>{renderBody()}</View>
      {renderBottomNav()}

      {/* Missed dose reminder escalation questionnaire modal */}
      {escalationModalVisible && escalatedMedicine && (
        <Modal transparent animationType="slide" visible={escalationModalVisible}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: c.card }]}>
              <Text style={[styles.escalationTitle, { color: "#ef4444" }]}>Intelligent Reminder Escalation</Text>
              <Text style={[styles.escalationSub, { color: c.text }]}>
                Your scheduled dose of <Text style={{ fontWeight: "700" }}>{escalatedMedicine.name}</Text> ({escalatedMedicine.time}) is currently overdue.
              </Text>
              <Text style={[styles.escalationPrompt, { color: c.sub }]}>
                Please specify the clinical reason for delay to assist Digital Twin feedback calibrations:
              </Text>

              {[
                "Forgot / distracted",
                "Sleeping",
                "Experiencing side effects",
                "Medication unavailable",
                "Intentional skip (clinical decision)",
              ].map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[styles.escalationReasonBtn, { borderColor: c.border }]}
                  onPress={() => handleSaveMissedReason(reason)}
                >
                  <Text style={[styles.escalationReasonTxt, { color: c.text }]}>{reason}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.escalationDismissBtn]}
                onPress={() => {
                  setEscalationModalVisible(false);
                  setEscalatedMedicine(null);
                }}
              >
                <Text style={{ color: c.sub, fontSize: 13 }}>Dismiss alert temporarily</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── STYLING ─────────────────────────────────────────────────────────

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
  profileToggle: {
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
    position: "relative",
  },
  emergencyIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
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
  scrollPadding: {
    padding: 16,
    paddingBottom: 40,
  },
  scoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  scoreSub: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 14,
  },
  scoreDetailsRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  scoreDetailItem: {
    marginRight: 20,
  },
  scoreDetailValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  scoreDetailLabel: {
    fontSize: 10,
  },
  ringContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  ringTextContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  ringPercent: {
    fontSize: 16,
    fontWeight: "700",
  },
  nextDoseCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  nextDoseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nextDoseBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  nextDoseBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  nextDoseTime: {
    color: "#ffffff",
    fontSize: 12,
  },
  nextDoseMain: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  nextDosePillContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  nextDoseName: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  nextDoseDose: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    marginTop: 2,
  },
  nextDoseReason: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginTop: 4,
  },
  nextDoseActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    flexWrap: "wrap",
    gap: 8,
  },
  nextActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flex: 1,
    minWidth: 80,
  },
  nextActionTxt: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  nextDoseCardPlaceholder: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
  },
  placeholderSub: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginVertical: 12,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  gridCard: {
    width: "48%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  gridIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  gridLabel: {
    marginLeft: 10,
    fontWeight: "600",
    fontSize: 13,
  },
  timelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  timelineLeft: {
    width: 60,
    alignItems: "center",
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: "700",
  },
  timelineDotOffset: {
    height: 8,
  },
  timelineDotLine: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "#cbd5e1",
    alignItems: "center",
    marginTop: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    top: 4,
  },
  timelineRightCard: {
    flex: 1,
    marginLeft: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  timelineName: {
    fontSize: 14,
    fontWeight: "700",
  },
  timelineDose: {
    fontSize: 11,
    marginTop: 2,
  },
  timelineStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timelineStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  emptyTimelineText: {
    textAlign: "center",
    paddingVertical: 12,
  },
  insightCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  insightTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  insightBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  subHeaderDescription: {
    fontSize: 13,
    marginBottom: 16,
  },
  medicineCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  medCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  medIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  medCardName: {
    fontSize: 16,
    fontWeight: "700",
  },
  medCardSubName: {
    fontSize: 11,
    marginTop: 2,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityBadgeTxt: {
    fontSize: 10,
    fontWeight: "700",
  },
  medCardFooterActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  footerActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginHorizontal: 4,
  },
  footerActionBtnTxt: {
    fontSize: 11,
    fontWeight: "700",
  },
  medDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 10,
    padding: 8,
  },
  medDetailsGridItem: {
    width: "50%",
    padding: 6,
  },
  gridItemLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  gridItemValue: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  instructionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  instructionsTxt: {
    fontSize: 11,
    marginLeft: 6,
  },
  calendarBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  calendarDayCard: {
    width: "12%",
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  calendarDayName: {
    fontSize: 10,
    fontWeight: "700",
  },
  calendarDayNum: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  scheduleTimeRow: {
    flexDirection: "row",
    marginBottom: 16,
    borderLeftWidth: 2,
    paddingLeft: 12,
  },
  scheduleTimeLeft: {
    width: 60,
    justifyContent: "center",
  },
  scheduleTimeTxt: {
    fontSize: 12,
    fontWeight: "700",
  },
  scheduleRightCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  scheduleMedName: {
    fontSize: 14,
    fontWeight: "700",
  },
  scheduleMedDose: {
    fontSize: 11,
    marginTop: 2,
  },
  scheduleActions: {
    flexDirection: "row",
    marginTop: 10,
  },
  scheduleActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  addMethodTabs: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  addMethodTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  addMethodTabLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  labelHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginVertical: 10,
  },
  formInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginBottom: 12,
    fontSize: 14,
  },
  formRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  mealToggleContainer: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    flex: 1,
    marginLeft: 10,
    height: 48,
    alignItems: "center",
  },
  mealTab: {
    flex: 1,
    height: "100%",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  formGridItem: {
    width: "31%",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 8,
  },
  formGridItemTxt: {
    fontSize: 12,
    fontWeight: "600",
  },
  priorityPicker: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    height: 40,
    alignItems: "center",
    marginBottom: 12,
  },
  priorityTab: {
    flex: 1,
    height: "100%",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  switchRowLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  switchRowSub: {
    fontSize: 10,
    marginTop: 2,
  },
  submitButton: {
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  submitButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  ocrContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  ocrTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  ocrSub: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  mockScannerFrame: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 20,
    position: "relative",
    overflow: "hidden",
  },
  scannerAnimationContainer: {
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  laserLine: {
    width: "90%",
    height: 2,
    backgroundColor: "#ef4444",
    position: "absolute",
    top: "50%",
  },
  databaseItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  databaseItemName: {
    fontWeight: "700",
    fontSize: 13,
  },
  databaseItemPurpose: {
    fontSize: 11,
    marginTop: 2,
  },
  heroDetailCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  detailHeroName: {
    fontSize: 22,
    fontWeight: "700",
  },
  detailHeroSub: {
    fontSize: 12,
    marginTop: 4,
  },
  detailStatRow: {
    flexDirection: "row",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: 16,
    width: "100%",
  },
  detailStatBox: {
    flex: 1,
    alignItems: "center",
  },
  detailStatVal: {
    fontSize: 16,
    fontWeight: "700",
  },
  detailStatLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  detailSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  detailSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  detailText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  biogearsChartContainer: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginVertical: 10,
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 6,
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  confidenceBadge: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  confidenceBadgeTxt: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "700",
  },
  knowledgeLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },
  knowledgeText: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  contraRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contraItem: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  historyLogItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  historyLogLeft: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  historyLogMed: {
    fontSize: 13,
    fontWeight: "700",
  },
  historyLogTime: {
    fontSize: 11,
    marginTop: 2,
  },
  historyLogBadge: {
    backgroundColor: "#22c55e20",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyLogBadgeTxt: {
    color: "#22c55e",
    fontSize: 8,
    fontWeight: "700",
  },
  complianceHeaderCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  complianceScoreLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  complianceScore: {
    fontSize: 36,
    fontWeight: "800",
    marginVertical: 6,
  },
  complianceStreak: {
    fontSize: 14,
    fontWeight: "700",
  },
  heatmapCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  heatmapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  heatmapSquare: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginBottom: 8,
  },
  heatmapLegend: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  badgeCard: {
    width: "31%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
  },
  badgeName: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  badgeDesc: {
    fontSize: 9,
    textAlign: "center",
    marginTop: 2,
  },
  reminderSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  remLabelText: {
    fontSize: 13,
    fontWeight: "700",
  },
  remSubText: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  inventoryItemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  inventoryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inventoryName: {
    fontSize: 15,
    fontWeight: "700",
  },
  inventoryStockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inventoryStockText: {
    fontSize: 11,
    fontWeight: "700",
  },
  lowStockBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ef444415",
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  lowStockTxt: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 6,
  },
  inventoryActions: {
    flexDirection: "row",
    marginTop: 12,
  },
  inventoryRefillBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 4,
  },
  refillBtnTxt: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  interactionSelectGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  interactionPillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  interactionPillLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  interactionResultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  interactionResultTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  interactionSeverityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  interactionDetailsTxt: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  interactionPlaceholder: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 30,
    alignItems: "center",
  },
  interactionPlaceholderTxt: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  vaultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  vaultIntro: {
    fontSize: 12,
    lineHeight: 16,
  },
  addPrescriptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 10,
  },
  addPrescriptionBtnTxt: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
  },
  presCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  presCardLeft: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  presFileName: {
    fontSize: 13,
    fontWeight: "700",
  },
  presDoctor: {
    fontSize: 11,
    marginTop: 2,
  },
  presDate: {
    fontSize: 10,
    marginTop: 2,
  },
  presStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chatBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  chatInputBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 12,
    alignItems: "center",
  },
  chatInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 13,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  analyticsOverviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  analyticsOverviewLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  analyticsOverviewValue: {
    fontSize: 32,
    fontWeight: "800",
    marginTop: 4,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  expenseSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  expenseSavingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reportItemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reportItemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  reportItemDesc: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  emergencyHero: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  emergencyHeroTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
  },
  emergencyHeroSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 14,
  },
  emergencyQrContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  qrCaption: {
    fontSize: 10,
    marginTop: 8,
  },
  emergencyInfoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  infoRowEmergency: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  emergencyMedRowText: {
    fontSize: 12,
    marginVertical: 4,
    fontWeight: "600",
  },
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  settingsLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  settingsSub: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "88%",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  ocrAuditBlock: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  ocrAuditHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  ocrAuditBody: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  ocrInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.02)",
  },
  escalationTitle: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  escalationSub: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 18,
  },
  escalationPrompt: {
    fontSize: 11,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 16,
  },
  escalationReasonBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  escalationReasonTxt: {
    fontSize: 12,
    fontWeight: "600",
  },
  escalationDismissBtn: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
});