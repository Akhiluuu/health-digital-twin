// app/(tabs)/index.tsx
// Medicines and symptoms now reflect the active member when switched,
// because MedicineContext and SymptomsContext react to activeMemberId.

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useFamily } from "../../context/FamilyContext";
import { useHydration } from "../../context/HydrationContext";
import { useMedicine } from "../../context/MedicineContext";
import { useSteps } from "../../context/StepContext";
import { useSymptoms } from "../../context/SymptomContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import Header from "../components/Header";
import ActiveProfileBanner from "../../components/ActiveProfileBanner";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { getUserId } from "../../services/firebaseSync";

const { width } = Dimensions.get("window");
const CARD_SIZE = width / 2 - 24;

const ECGLine = ({ accent }: { accent: string }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const wave = `0,20 15,18 25,5 35,35 45,20 60,22 70,6 80,32 90,20 105,19 115,8 125,34 135,20 150,21 160,5 170,30 180,20 195,22 205,7 215,35 225,20 240,18 250,10 260,32 270,20 285,21 295,6 305,34 315,20`;
  const WAVE_WIDTH = 320;
  useEffect(() => {
    const animate = () => {
      translateX.setValue(0);
      Animated.timing(translateX, { toValue: -WAVE_WIDTH, duration: 5000, easing: Easing.linear, useNativeDriver: true }).start(() => animate());
    };
    animate();
  }, []);
  return (
    <View style={{ overflow: "hidden", height: 40, width: "100%" }}>
      <Animated.View style={{ flexDirection: "row", width: WAVE_WIDTH * 2, transform: [{ translateX }] }}>
        {[0, 1].map(i => (
          <Svg key={i} width={WAVE_WIDTH} height={40}>
            <Polyline points={wave} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
};

const LiveBadge = () => (
  <View style={styles.liveBadge}>
    <View style={styles.liveDot} />
    <Text style={styles.liveText}>LIVE</Text>
  </View>
);

const TelemetryCard = ({ title, value, unit, icon, accent, progress, theme, children, onPress, live = false }: any) => {
  const gradient = theme === "dark" ? (["#0f172a", "#020617"] as const) : (["#f1f5f9", "#ffffff"] as const);
  const CardUI = (
    <LinearGradient colors={gradient} style={styles.telemetryCard}>
      <View style={styles.teleHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teleTitle}>{title}</Text>
          {live && <LiveBadge />}
        </View>
        <Text style={styles.teleIcon}>{icon}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={[styles.teleValue, { color: accent }]}>{value}</Text>
        {unit && <Text style={styles.teleUnit}>{unit}</Text>}
      </View>
      {progress !== undefined && (
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: accent }]} />
        </View>
      )}
      {children}
    </LinearGradient>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.9} onPress={onPress}>{CardUI}</TouchableOpacity> : CardUI;
};

const DataCard = ({ label, emoji, color, onPress }: any) => (
  <TouchableOpacity style={[styles.dataCard, { backgroundColor: color }]} onPress={onPress}>
    <Text style={{ fontSize: 30 }}>{emoji}</Text>
    <Text style={styles.dataText}>{label}</Text>
  </TouchableOpacity>
);

export default function HomeScreen() {
  const router = useRouter();
  const { medicines, isLoadingMemberMedicines }           = useMedicine();
  const { water }                                          = useHydration();
  const { activeSymptoms, refreshSymptoms, isLoadingMemberSymptoms } = useSymptoms();
  const { theme }                                          = useTheme();
  const c = colors[theme];
  const { steps, calories, goal, isTracking }              = useSteps();

  // ✅ Active member context
  const { activeMemberId, isSwitched, activeProfile } = useFamily();

  const [spo2, setSpo2]           = useState<number>(0);
  const [sensorOpen, setSensorOpen] = useState(false);
  const isFocused = useRef(false);

  useFocusEffect(useCallback(() => {
    if (isFocused.current) return;
    isFocused.current = true;
    refreshSymptoms();
    setTimeout(() => { isFocused.current = false; }, 1000);
    return () => { isFocused.current = false; };
  }, [refreshSymptoms]));

  // ✅ SpO₂ — re-subscribes when active member changes
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const subscribeToSpo2 = async () => {
      try {
        let uid: string | null = null;
        if (isSwitched && activeMemberId && activeMemberId !== "self") {
          uid = activeMemberId;
        } else {
          uid = await getUserId();
        }
        if (!uid) return;

        setSpo2(0);
        const ref = doc(db, "users", uid);
        unsubscribe = onSnapshot(ref, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setSpo2(data.spo2 !== undefined ? data.spo2 : 0);
          }
        });
      } catch (error) {
        console.error("❌ SpO₂ subscription error:", error);
      }
    };

    subscribeToSpo2();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [activeMemberId, isSwitched]);

  const heart = 78;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "emergency": return "#ef4444";
      case "severe":    return "#f97316";
      case "moderate":  return "#f59e0b";
      case "mild":      return "#10b981";
      default:          return c.accent;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const diffMs   = Date.now() - timestamp;
    const diffHrs  = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffHrs > 24) { const d = Math.floor(diffHrs / 24); return `${d} day${d > 1 ? "s" : ""} ago`; }
    if (diffHrs > 0) return `${diffHrs} hour${diffHrs > 1 ? "s" : ""} ago`;
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  };

  const isLoading = isLoadingMemberMedicines || isLoadingMemberSymptoms;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header />
      <ScrollView contentContainerStyle={styles.container}>

        {/* ✅ Switched profile notice with loading state */}
        {isSwitched && (
          <View style={[styles.switchedNotice, { backgroundColor: c.card }]}>
            <Ionicons name="people" size={16} color="#7c3aed" />
            <Text style={{ color: "#7c3aed", fontSize: 13, fontWeight: "600", flex: 1 }}>
              {isLoading
                ? `Loading ${activeProfile.firstName}'s health data...`
                : `Viewing ${activeProfile.firstName}'s health data`}
            </Text>
            {isLoading && <ActivityIndicator size="small" color="#7c3aed" />}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: c.text }]}>BIO-TELEMETRY</Text>
        <View style={styles.grid}>
          <TelemetryCard
            title="ACTIVE STEPS" value={steps.toLocaleString("en-IN")} icon="👟"
            accent="#f97316" progress={steps / goal} theme={theme} live={isTracking}
            onPress={() => router.push("/step-intelligence")}
          />
          <TelemetryCard
            title="HEART RATE" value={heart} unit=" BPM" icon="❤️"
            accent="#ef476f" theme={theme} onPress={() => setSensorOpen(true)}
          >
            <ECGLine accent="#ef476f" />
          </TelemetryCard>
          <TelemetryCard
            title="OXYGEN SAT." value={spo2 || "--"} unit="%" icon="🩸"
            onPress={() => router.push("/spo2")} accent="#4cc9f0" theme={theme}
          />
          <TelemetryCard
            title="DAILY BURN" value={calories} unit=" KCAL" icon="🔥"
            accent="#f59e0b" theme={theme} live={isTracking}
            onPress={() => router.push("/calorie-intelligence")}
          />
        </View>

        {/* ✅ Medicine Reminder — now shows switched member's medicines */}
        <SectionHeader
          title="MEDICINE REMINDER"
          theme={c}
          action={isSwitched ? undefined : "Manage"}
          onPress={() => router.push("/MedicationVault")}
        />
        {isLoadingMemberMedicines ? (
          <View style={[styles.infoCard, { backgroundColor: c.card }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ color: c.sub, marginTop: 8 }}>Loading medicines...</Text>
          </View>
        ) : medicines.length === 0 ? (
          <InfoCard theme={c} text="NO PENDING DOSES" />
        ) : (
          medicines.slice(0, 2).map(m => (
            <InfoCard key={m.id} theme={c} text={`${m.name} — ${m.dose}`} sub={m.time} />
          ))
        )}
        {!isLoadingMemberMedicines && medicines.length > 2 && (
          <TouchableOpacity onPress={() => router.push("/MedicationVault")}>
            <Text style={[styles.viewAllText, { color: c.accent }]}>+{medicines.length - 2} more</Text>
          </TouchableOpacity>
        )}

        {/* ✅ Symptoms — now shows switched member's symptoms */}
        <SectionHeader
          title="ACTIVE SYMPTOMS"
          theme={c}
          action={isSwitched ? undefined : "Log"}
          onPress={() => router.push("/symptom-log")}
        />
        {isLoadingMemberSymptoms ? (
          <View style={[styles.infoCard, { backgroundColor: c.card }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ color: c.sub, marginTop: 8 }}>Loading symptoms...</Text>
          </View>
        ) : activeSymptoms.length === 0 ? (
          <InfoCard theme={c} text="No active symptoms">
            {!isSwitched && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: c.accent }]}
                onPress={() => router.push("/symptom-log")}
              >
                <Text style={{ fontWeight: "bold", color: "#000" }}>Log Symptom</Text>
              </TouchableOpacity>
            )}
          </InfoCard>
        ) : (
          activeSymptoms.map((symptom: any) => (
            <TouchableOpacity
              key={symptom.id}
              style={[styles.symptomCard, { backgroundColor: c.card }]}
              onPress={() => {
                if (!symptom?.id) return;
                router.push({
                  pathname: "/symptom-followup",
                  params: { id: String(symptom.id), name: symptom.name ?? "Symptom" },
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.symptomContent}>
                <View style={[styles.symptomIcon, { backgroundColor: getSeverityColor(symptom.severity) + "20" }]}>
                  <Ionicons name="medical" size={24} color={getSeverityColor(symptom.severity)} />
                </View>
                <View style={styles.symptomInfo}>
                  <Text style={[styles.symptomName, { color: c.text }]}>{symptom.name}</Text>
                  <View style={styles.symptomMeta}>
                    <Text style={[styles.symptomTime, { color: c.sub }]}>{getTimeAgo(symptom.startedAt)}</Text>
                    <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(symptom.severity) }]}>
                      <Text style={styles.severityBadgeText}>{symptom.severity}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.sub} />
              </View>
            </TouchableOpacity>
          ))
        )}

        <Text style={[styles.sectionTitle, { color: c.text }]}>GOAL CONVERGENCE</Text>
        <TouchableOpacity
          style={[styles.goalCard, { backgroundColor: c.card }]}
          onPress={() => router.push("/hydration")}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <Ionicons name="water" size={28} color="#4f83ff" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "bold" }}>HYDRATION</Text>
              <Text style={{ color: c.sub }}>{water} ML</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Hide data entry when viewing a member (read-only) */}
        {!isSwitched && (
          <>
            <Text style={[styles.sectionTitle, { color: c.text }]}>DATA ENTRY</Text>
            <View style={styles.grid}>
              <DataCard label="HYDRATION" emoji="💧" color="#4f83ff" onPress={() => router.push("/hydration")} />
              <DataCard label="ACTIVITY"  emoji="💪" color="#7c5cff" onPress={() => router.push("/activity")} />
              <DataCard label="NUTRITION" emoji="🍎" color="#ff5e3a" onPress={() => router.push("/nutrition")} />
              <DataCard label="REST"      emoji="🌙" color="#1f2937" onPress={() => router.push("/rest")} />
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: c.text }]}>BRAIN CALIBRATION</Text>
        <TouchableOpacity
          style={[styles.brainCard, { backgroundColor: c.accent }]}
          onPress={() => router.push("./brain/brain-lab")}
        >
          <View>
            <Text style={{ fontWeight: "bold", color: "#fff" }}>COGNITIVE STRESS TEST</Text>
            <Text style={{ color: "#e2e8f0" }}>VERIFY NEURAL PROCESSING</Text>
          </View>
          <Text style={{ fontSize: 42 }}>🧠</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ✅ Active profile banner floats on top */}
      <ActiveProfileBanner />

      <Modal visible={sensorOpen} animationType="slide">
        <View style={[styles.sensorScreen, { backgroundColor: c.bg }]}>
          <Text style={{ fontSize: 60 }}>☝️</Text>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "bold" }}>Optical Bio-Link</Text>
          <Text style={{ color: c.sub, marginVertical: 10 }}>Place finger over camera</Text>
          <TouchableOpacity
            style={[styles.sensorBtn, { backgroundColor: c.accent }]}
            onPress={() => { setSensorOpen(false); router.push("./heart-scanner"); }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold" }}>INITIALIZE SENSOR</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSensorOpen(false)}>
            <Text style={{ color: c.sub, marginTop: 20 }}>ABORT</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const SectionHeader = ({ title, theme, action, onPress }: any) => (
  <View style={styles.rowBetween}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    {action && (
      <TouchableOpacity style={[styles.manageBtn, { backgroundColor: theme.accent }]} onPress={onPress}>
        <Text style={{ color: "#000", fontWeight: "bold" }}>{action}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const InfoCard = ({ text, sub, children, theme }: any) => (
  <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
    <Text style={{ color: theme.text }}>{text}</Text>
    {sub && <Text style={{ color: theme.sub }}>{sub}</Text>}
    {children}
  </View>
);

const styles = StyleSheet.create({
  container:         { padding: 16, paddingTop: 110, paddingBottom: 20 },
  switchedNotice:    { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: "#7c3aed30" },
  sectionTitle:      { fontSize: 20, fontWeight: "bold", marginVertical: 10 },
  grid:              { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  telemetryCard:     { width: CARD_SIZE, height: CARD_SIZE, borderRadius: 28, padding: 18, marginBottom: 16, justifyContent: "space-between" },
  teleHeader:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  teleTitle:         { fontWeight: "bold", color: "#94a3b8", fontSize: 11 },
  teleIcon:          { fontSize: 22 },
  teleValue:         { fontSize: 34, fontWeight: "900" },
  teleUnit:          { marginLeft: 6, color: "#64748b", fontWeight: "bold" },
  barBg:             { height: 8, backgroundColor: "#e5e7eb33", borderRadius: 10, overflow: "hidden" },
  barFill:           { height: 8, borderRadius: 10 },
  liveBadge:         { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  liveDot:           { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText:          { color: "#22c55e", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  rowBetween:        { flexDirection: "row", justifyContent: "space-between", marginVertical: 10 },
  manageBtn:         { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, height: 35 },
  infoCard:          { padding: 20, borderRadius: 30, marginBottom: 10, alignItems: "center" },
  primaryBtn:        { marginTop: 10, padding: 12, borderRadius: 20 },
  viewAllText:       { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 10 },
  symptomCard:       { borderRadius: 16, padding: 16, marginBottom: 8 },
  symptomContent:    { flexDirection: "row", alignItems: "center" },
  symptomIcon:       { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", marginRight: 12 },
  symptomInfo:       { flex: 1 },
  symptomName:       { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  symptomMeta:       { flexDirection: "row", alignItems: "center", gap: 8 },
  symptomTime:       { fontSize: 12 },
  severityBadge:     { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  severityBadgeText: { color: "#fff", fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  goalCard:          { borderRadius: 40, padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dataCard:          { width: "48%", paddingVertical: 26, borderRadius: 40, marginBottom: 14, alignItems: "center" },
  dataText:          { color: "#fff", fontWeight: "bold", marginTop: 6 },
  brainCard:         { borderRadius: 40, padding: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sensorScreen:      { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },
  sensorBtn:         { padding: 18, borderRadius: 40, width: "100%", alignItems: "center" },
});