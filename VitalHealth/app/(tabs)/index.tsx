// app/(tabs)/index.tsx
// Redesigned Home Screen Dashboard with premium glassmorphism, 
// interactive animations, unified goals hub, and smart quick logs.

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert
} from "react-native";
import Svg, { Polyline, Circle } from "react-native-svg";
import { useFamily } from "../../context/FamilyContext";
import { useHydration } from "../../context/HydrationContext";
import { useMedicine } from "../../context/MedicineContext";
import { useSteps } from "../../context/StepContext";
import { useBiogearsTwin } from "../../context/BiogearsTwinContext";
import { useSymptoms } from "../../context/SymptomContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import Header from "../components/Header";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { getUserId } from "../../services/firebaseSync";
import { subscribeToMemberHealth } from "../../services/familySync";

const { width } = Dimensions.get("window");
const CARD_SIZE = width / 2 - 22;

// ── DOUBLE-BEAT HEART PULSE ANIMATION ──
const PulsingHeart = ({ color }: { color: string }) => {
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const startPulse = () => {
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.25, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.0, duration: 150, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(100),
        Animated.timing(pulseScale, { toValue: 1.15, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1.0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(1200),
      ]).start(() => startPulse());
    };
    startPulse();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
      <Ionicons name="heart" size={24} color={color} />
    </Animated.View>
  );
};

// ── ECG ANIMATED WAVE ──
const ECGLine = ({ accent }: { accent: string }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const wave = `0,20 15,18 25,5 35,35 45,20 60,22 70,6 80,32 90,20 105,19 115,8 125,34 135,20 150,21 160,5 170,30 180,20 195,22 205,7 215,35 225,20 240,18 250,10 260,32 270,20 285,21 295,6 305,34 315,20`;
  const WAVE_WIDTH = 320;

  useEffect(() => {
    const animate = () => {
      translateX.setValue(0);
      Animated.timing(translateX, {
        toValue: -WAVE_WIDTH,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true
      }).start(() => animate());
    };
    animate();
  }, []);

  return (
    <View style={{ overflow: "hidden", height: 35, width: "100%", marginTop: 8 }}>
      <Animated.View style={{ flexDirection: "row", width: WAVE_WIDTH * 2, transform: [{ translateX }] }}>
        {[0, 1].map(i => (
          <Svg key={i} width={WAVE_WIDTH} height={35}>
            <Polyline points={wave} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
};

// ── LIVE SIGNAL BADGE ──
const LiveBadge = () => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity }]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
};

// ── TELEMETRY GLASS CARD ──
const TelemetryCard = ({ title, value, unit, icon, accent, progress, theme, children, onPress, live = false }: any) => {
  const isDark = theme === "dark";
  const gradient = isDark
    ? ["rgba(17, 29, 58, 0.85)", "rgba(11, 19, 41, 0.95)"] as const
    : ["rgba(255, 255, 255, 0.9)", "rgba(241, 245, 249, 0.95)"] as const;
  
  const borderCol = isDark ? "rgba(30, 41, 75, 0.6)" : "rgba(226, 232, 240, 0.8)";
  const cardBg = isDark ? "#111d3a" : "#ffffff";

  const CardUI = (
    <LinearGradient
      colors={gradient}
      style={[
        styles.telemetryCard,
        {
          borderColor: borderCol,
          backgroundColor: cardBg,
          shadowColor: accent,
          shadowOpacity: isDark ? 0.25 : 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        }
      ]}
    >
      <View style={styles.teleHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teleTitle}>{title}</Text>
          {live && <LiveBadge />}
        </View>
        <View style={[styles.iconWrapper, { backgroundColor: accent + "1e" }]}>
          {icon}
        </View>
      </View>

      <View style={styles.teleContent}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Text style={[
            styles.teleValue,
            { color: isDark ? "#ffffff" : "#0f172a" },
            value === "Under Construction" && { fontSize: 12, fontWeight: "800", textTransform: "uppercase", lineHeight: 20 }
          ]}>
            {value}
          </Text>
          {unit && value !== "Under Construction" ? <Text style={styles.teleUnit}>{unit}</Text> : null}
        </View>

        {progress !== undefined && (
          <View style={styles.barBg}>
            <LinearGradient
              colors={[accent, accent + "cc"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${Math.min(100, progress * 100)}%` }]}
            />
          </View>
        )}
        {children}
      </View>
    </LinearGradient>
  );

  return onPress ? <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{CardUI}</TouchableOpacity> : CardUI;
};

export default function HomeScreen() {
  const router = useRouter();
  const { medicines, isLoadingMemberMedicines } = useMedicine();
  const { water, addWater } = useHydration();
  const { activeSymptoms, refreshSymptoms, isLoadingMemberSymptoms } = useSymptoms();
  const { theme } = useTheme();
  const c = colors[theme];
  const { steps, calories, goal, isTracking } = useSteps();
  const { caloricBalance, lastVitals, addEvent } = useBiogearsTwin();
  const { activeMemberId, isSwitched, activeProfile } = useFamily();

  const isTakenToday = (medicine: any): boolean => {
    if (medicine.taken !== 1) return false;
    if (!medicine.takenDate) return false;
    return medicine.takenDate === new Date().toISOString().split("T")[0];
  };

  const isMissedToday = (medicine: any): boolean => {
    if (medicine.taken !== -1) return false;
    if (!medicine.takenDate) return false;
    return medicine.takenDate === new Date().toISOString().split("T")[0];
  };

  const [spo2, setSpo2] = useState<number>(0);
  const [measuredHeartRate, setMeasuredHeartRate] = useState<number | null>(null);
  const [heartModalOpen, setHeartModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const isFocused = useRef(false);

  useFocusEffect(useCallback(() => {
    if (isFocused.current) return;
    isFocused.current = true;
    refreshSymptoms();
    setTimeout(() => { isFocused.current = false; }, 1000);
    return () => { isFocused.current = false; };
  }, [refreshSymptoms]));

  // ✅ Vitals (SpO₂ & Heart Rate) Subscription logic
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const subscribeToVitals = async () => {
      try {
        let uid: string | null = null;
        if (isSwitched && activeMemberId && activeMemberId !== "self") {
          uid = activeMemberId;
        } else {
          uid = await getUserId();
        }
        if (!active) return;
        if (!uid) return;

        setSpo2(0);
        setMeasuredHeartRate(null);

        if (isSwitched && activeMemberId && activeMemberId !== "self") {
          const unsub = subscribeToMemberHealth(uid, (data) => {
            if (active && data) {
              if (data.spo2 !== undefined) setSpo2(data.spo2 || 0);
              if (data.heartRate !== undefined) setMeasuredHeartRate(data.heartRate || null);
            }
          });
          unsubscribe = unsub;
        } else {
          const ref = doc(db, "users", uid);
          const unsub = onSnapshot(
            ref,
            (snapshot: any) => {
              if (active && snapshot.exists()) {
                const data = snapshot.data();
                setSpo2(data.spo2 !== undefined ? data.spo2 : 0);
                setMeasuredHeartRate(data.heartRate !== undefined ? Math.round(data.heartRate) : null);
              }
            },
            (err: any) => {
              console.log("⚠️ Dashboard Vitals onSnapshot error:", err);
            }
          );
          unsubscribe = unsub;
        }
      } catch (error) {
        console.error("❌ Vitals subscription error:", error);
      }
    };

    subscribeToVitals();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [activeMemberId, isSwitched]);

  // ✅ Quick log water directly from Home page
  const handleQuickAddWater = (ml: number) => {
    addWater(ml, "manual");
    try {
      const now = new Date();
      addEvent({
        event_type: "water",
        value: ml,
        wallTime: now.toTimeString().slice(0, 5),
        displayLabel: `Water · ${ml} mL`,
        displayIcon: "💧",
      });
    } catch (err) {
      console.error("BioGears Hydration Sync Error:", err);
    }
    showToast(`Logged +${ml}ml Water 💧`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2200);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "emergency": return "#ef4444";
      case "severe": return "#f97316";
      case "moderate": return "#f59e0b";
      case "mild": return "#10b981";
      default: return c.accent;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffHrs > 24) { const d = Math.floor(diffHrs / 24); return `${d} day${d > 1 ? "s" : ""} ago`; }
    if (diffHrs > 0) return `${diffHrs} hour${diffHrs > 1 ? "s" : ""} ago`;
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  };

  // Welcome message based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const stepsGoalProgress = Math.min(1, steps / (goal || 10000));
  const waterGoalProgress = Math.min(1, water / 2000); // 2000ml standard water goal

  return (
    <LinearGradient
      colors={theme === "dark" ? ["#0b1329", "#080c1a"] : ["#f8fafc", "#f1f5f9", "#e0f2fe"]}
      style={{ flex: 1 }}
    >
      <Header />
      
      {/* BACKGROUND DECORATION ORBS */}
      <View pointerEvents="none" style={styles.orbsContainer}>
        {/* Orb 1: Cyan/Blue Glow */}
        <View style={[styles.orb, { backgroundColor: "#38bdf81e", top: 80, right: -60, width: 260, height: 260, borderRadius: 130 }]} />
        {/* Orb 2: Purple/Violet Glow */}
        <View style={[styles.orb, { backgroundColor: "#a78bfa18", top: 320, left: -90, width: 280, height: 280, borderRadius: 140 }]} />
        {/* Orb 3: Rose/Amber Glow */}
        <View style={[styles.orb, { backgroundColor: "#f43f5e0e", bottom: 100, right: -30, width: 240, height: 240, borderRadius: 120 }]} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── WELCOME & TWIN STATE CARD ── */}
        <View style={styles.welcomeSection}>
          <Text style={[styles.greetingSub, { color: c.sub }]}>{greeting},</Text>
          <View style={styles.greetingRow}>
            <Text style={[styles.greetingName, { color: c.text }]}>
              {activeProfile?.firstName || "Explorer"}
            </Text>
            <Ionicons name="sparkles" size={24} color={c.accent} />
          </View>
          
          <LinearGradient 
            colors={
              theme === "dark" 
                ? (lastVitals ? ["#111d3a", "#0d2818"] : ["#111d3a", "#241a0d"])
                : (lastVitals ? ["#ffffff", "#f0fdf4"] : ["#ffffff", "#fffbeb"])
            }
            style={[
              styles.statusBanner,
              {
                borderColor: c.border,
                borderLeftColor: lastVitals ? "#10b981" : "#f59e0b",
                borderLeftWidth: 4,
                shadowColor: lastVitals ? "#10b981" : "#f59e0b",
                shadowOpacity: theme === "dark" ? 0.25 : 0.08,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }
            ]}
          >
            <View style={styles.statusDotRow}>
              <View style={[styles.statusIndicatorDot, { backgroundColor: lastVitals ? "#10b981" : "#f59e0b" }]} />
              <Text style={[styles.statusBannerTitle, { color: c.text }]}>
                {isSwitched ? `Viewing ${activeProfile?.firstName}'s profile` : "Twin status active"}
              </Text>
            </View>
            <Text style={[styles.statusBannerSub, { color: c.sub }]}>
              {lastVitals 
                ? "Physiological twin simulation calibrated & running" 
                : "Simulation requires twin calibration. Go to Twin tab to log habits."}
            </Text>
          </LinearGradient>
        </View>

        {/* ── BIO-TELEMETRY GRID ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Live Telemetry</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>AUTO-SYNC</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <TelemetryCard
            title="ACTIVE STEPS"
            value={steps.toLocaleString("en-IN")}
            unit="steps"
            icon={<Ionicons name="footsteps" size={20} color="#f97316" />}
            accent="#f97316"
            progress={stepsGoalProgress}
            theme={theme}
            live={isTracking}
            onPress={() => router.push("/step-intelligence")}
          />
          <TelemetryCard
            title="HEART RATE"
            value={measuredHeartRate !== null ? measuredHeartRate.toString() : (lastVitals?.heart_rate ? Math.round(lastVitals.heart_rate).toString() : "78")}
            unit="BPM"
            icon={<PulsingHeart color="#ef4444" />}
            accent="#ef4444"
            theme={theme}
            onPress={() => router.push("/heart-scanner")}
          >
            <ECGLine accent="#ef4444" />
          </TelemetryCard>
          <TelemetryCard
            title="OXYGEN SAT."
            value={spo2 || "--"}
            unit="%"
            icon={<Ionicons name="water-sharp" size={20} color="#06b6d4" />}
            accent="#06b6d4"
            theme={theme}
            onPress={() => router.push("/spo2")}
          />
          <TelemetryCard
            title="DAILY BURN"
            value={caloricBalance && !isNaN(caloricBalance.estimated_burn_kcal) ? Math.round(caloricBalance.estimated_burn_kcal).toLocaleString("en-IN") : (!isNaN(calories) ? calories.toLocaleString("en-IN") : "0")}
            unit="kcal"
            icon={<Ionicons name="flame" size={20} color="#f59e0b" />}
            accent="#f59e0b"
            theme={theme}
            live={isTracking}
            onPress={() => router.push("/calorie-intelligence")}
          />
        </View>

        {/* ── GOALS CONVERGENCE DASHBOARD ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Goals Convergence</Text>
        </View>

        <View
          style={[
            styles.goalConvergenceCard,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              shadowColor: c.accent,
              shadowOpacity: theme === "dark" ? 0.25 : 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }
          ]}
        >
          <LinearGradient
            colors={theme === "dark" ? ["#1e1b4b", "transparent"] : ["#eff6ff", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradientOverlay}
          />
          <View style={styles.convergenceHeader}>
            <View style={styles.convergenceHeaderLeft}>
              <Ionicons name="ribbon-outline" size={22} color={c.accent} />
              <Text style={[styles.convergenceTitle, { color: c.text }]}>Daily Goal Completion</Text>
            </View>
          </View>
          
          <View style={styles.convergenceStatsRow}>
            {/* Steps Progress */}
            <TouchableOpacity 
              style={[
                styles.convergenceStatCol,
                {
                  backgroundColor: theme === 'dark' ? '#f9731610' : '#f9731605',
                  padding: 12,
                  borderRadius: 16,
                  borderLeftColor: "#f97316",
                  borderLeftWidth: 3.5,
                  borderWidth: 1,
                  borderColor: theme === 'dark' ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.08)'
                }
              ]}
              onPress={() => router.push("/step-intelligence")}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="walk" size={16} color="#f97316" />
                  <Text style={[styles.statTitle, { color: c.text }]}>Steps Goal</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#f97316" />
              </View>
              <Text style={[styles.statValueText, { color: c.text, marginTop: 4 }]}>
                {steps} <Text style={[styles.statTargetText, { color: c.sub }]}>/ {goal}</Text>
              </Text>
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${stepsGoalProgress * 100}%`, backgroundColor: "#f97316" }]} />
              </View>
              <Text style={[styles.statPercentText, { color: "#f97316" }]}>{Math.round(stepsGoalProgress * 100)}% Complete</Text>
            </TouchableOpacity>

            {/* Hydration Progress */}
            <TouchableOpacity 
              style={[
                styles.convergenceStatCol,
                {
                  backgroundColor: theme === 'dark' ? '#0ea5e910' : '#0ea5e905',
                  padding: 12,
                  borderRadius: 16,
                  borderLeftColor: "#0ea5e9",
                  borderLeftWidth: 3.5,
                  borderWidth: 1,
                  borderColor: theme === 'dark' ? 'rgba(14,165,233,0.15)' : 'rgba(14,165,233,0.08)'
                }
              ]}
              onPress={() => router.push({ pathname: "/(tabs)/history", params: { tab: "hydration" } } as any)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="water" size={16} color="#0ea5e9" />
                  <Text style={[styles.statTitle, { color: c.text }]}>Hydration</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#0ea5e9" />
              </View>
              <Text style={[styles.statValueText, { color: c.text, marginTop: 4 }]}>
                {water} <Text style={[styles.statTargetText, { color: c.sub }]}>/ 2000 ml</Text>
              </Text>
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${waterGoalProgress * 100}%`, backgroundColor: "#0ea5e9" }]} />
              </View>
              <Text style={[styles.statPercentText, { color: "#0ea5e9" }]}>{Math.round(waterGoalProgress * 100)}% Complete</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MEDICINE TIMELINE ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Medications Timeline</Text>
          <TouchableOpacity onPress={() => router.push("/MedicationVault")}>
            <Text style={[styles.sectionLink, { color: c.accent }]}>Manage Vault</Text>
          </TouchableOpacity>
        </View>

        {isLoadingMemberMedicines ? (
          <View style={[styles.loadingCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ color: c.sub, marginTop: 8, fontSize: 13 }}>Loading schedule...</Text>
          </View>
        ) : medicines.length === 0 ? (
          <View style={[styles.successStateCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.successIconWrapper, { backgroundColor: "#10b98115" }]}>
              <Ionicons name="checkmark-circle" size={28} color="#10b981" />
            </View>
            <Text style={[styles.successStateTitle, { color: c.text }]}>All Caught Up</Text>
            <Text style={[styles.successStateSub, { color: c.sub }]}>No pending doses remaining for today.</Text>
          </View>
        ) : (
          <View style={styles.medicineList}>
            {medicines.slice(0, 2).map((m) => {
              const takenToday = isTakenToday(m);
              const missedToday = isMissedToday(m);
              return (
                <View
                  key={m.id}
                  style={[
                    styles.medicineTimelineItem,
                    { backgroundColor: c.card, borderColor: c.border },
                    takenToday && { borderLeftWidth: 3.5, borderLeftColor: "#22c55e" },
                    missedToday && { borderLeftWidth: 3.5, borderLeftColor: "#ef4444" }
                  ]}
                >
                  <View style={[
                    styles.medicinePillWrapper,
                    {
                      backgroundColor: takenToday
                        ? "#22c55e12"
                        : missedToday
                        ? "#ef444412"
                        : c.accent + "12"
                    }
                  ]}>
                    <Ionicons
                      name={takenToday ? "checkmark-circle" : missedToday ? "close-circle" : "bandage-outline"}
                      size={20}
                      color={takenToday ? "#22c55e" : missedToday ? "#ef4444" : c.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.medicineNameText,
                      { color: c.text },
                      takenToday && { textDecorationLine: "line-through", opacity: 0.6 }
                    ]}>
                      {m.name}
                    </Text>
                    <Text style={[styles.medicineDoseText, { color: c.sub }]}>
                      {m.dose} • {takenToday ? "Taken Today" : missedToday ? "Missed Today" : "Pending"}
                    </Text>
                  </View>
                  <View style={styles.medicineTimeWrapper}>
                    <Ionicons name="time-outline" size={14} color={c.sub} />
                    <Text style={[styles.medicineTimeText, { color: c.sub }]}>{m.time}</Text>
                  </View>
                </View>
              );
            })}
            {medicines.length > 2 && (
              <TouchableOpacity 
                style={[styles.medicineMoreRow, { backgroundColor: c.card, borderColor: c.border }]} 
                onPress={() => router.push("/MedicationVault")}
              >
                <Text style={{ color: c.accent, fontWeight: "bold", fontSize: 13 }}>
                  +{medicines.length - 2} more scheduled doses
                </Text>
                <Ionicons name="arrow-forward" size={14} color={c.accent} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── SYMPTOMS MONITOR ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Symptom Signals</Text>
          <TouchableOpacity onPress={() => router.push("/symptom-log")}>
            <Text style={[styles.sectionLink, { color: c.accent }]}>Log New</Text>
          </TouchableOpacity>
        </View>

        {isLoadingMemberSymptoms ? (
          <View style={[styles.loadingCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={{ color: c.sub, marginTop: 8, fontSize: 13 }}>Loading active signals...</Text>
          </View>
        ) : activeSymptoms.length === 0 ? (
          <View style={[styles.successStateCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.successIconWrapper, { backgroundColor: "#10b98115" }]}>
              <Ionicons name="shield-checkmark" size={28} color="#10b981" />
            </View>
            <Text style={[styles.successStateTitle, { color: c.text }]}>No Symptom Signals</Text>
            <Text style={[styles.successStateSub, { color: c.sub }]}>You haven't logged any discomfort today.</Text>
          </View>
        ) : (
          <View style={styles.symptomsList}>
            {activeSymptoms.map((symptom: any) => (
              <TouchableOpacity
                key={symptom.id}
                style={[styles.symptomRowItem, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => {
                  if (!symptom?.id) return;
                  router.push({
                    pathname: "/symptom-followup",
                    params: { id: String(symptom.id), name: symptom.name ?? "Symptom" },
                  });
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.symptomDotIndicator, { backgroundColor: getSeverityColor(symptom.severity) }]} />
                <View style={{ flex: 1, paddingLeft: 6 }}>
                  <Text style={[styles.symptomNameText, { color: c.text }]}>{symptom.name}</Text>
                  <Text style={[styles.symptomTimeText, { color: c.sub }]}>{getTimeAgo(symptom.startedAt)}</Text>
                </View>
                <View style={[styles.severityBadgeTextContainer, { backgroundColor: getSeverityColor(symptom.severity) + "18" }]}>
                  <Text style={[styles.severityTextLabel, { color: getSeverityColor(symptom.severity) }]}>
                    {symptom.severity}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.sub} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── QUICK ACTIONS HUB (DATA ENTRY) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Quick Health Log</Text>
        </View>
        <View style={styles.quickGrid}>
          <TouchableOpacity
            style={[
              styles.quickActionCard,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderLeftColor: "#0284c7",
                borderLeftWidth: 3.5,
                shadowColor: "#0284c7",
                shadowOpacity: theme === "dark" ? 0.2 : 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            ]}
            onPress={() => router.push({ pathname: "/twin", params: { mode: "routine", tab: "water" } })}
          >
            <View style={[styles.quickActionIconWrapper, { backgroundColor: "#0284c715" }]}>
              <Ionicons name="water" size={22} color="#0284c7" />
            </View>
            <Text style={[styles.quickActionLabel, { color: c.text }]}>Hydrate</Text>
            <View style={styles.quickAddWaterRow}>
              <TouchableOpacity style={styles.quickAddBtn} onPress={() => handleQuickAddWater(250)}>
                <Text style={styles.quickAddBtnText}>+250ml</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickAddBtn} onPress={() => handleQuickAddWater(500)}>
                <Text style={styles.quickAddBtnText}>+500ml</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionCard,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderLeftColor: "#10b981",
                borderLeftWidth: 3.5,
                shadowColor: "#10b981",
                shadowOpacity: theme === "dark" ? 0.2 : 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            ]}
            onPress={() => router.push("/activity")}
          >
            <View style={[styles.quickActionIconWrapper, { backgroundColor: "#10b98115" }]}>
              <Ionicons name="fitness" size={22} color="#10b981" />
            </View>
            <Text style={[styles.quickActionLabel, { color: c.text }]}>Activity</Text>
            <Text style={[styles.quickActionSub, { color: c.sub }]}>Log workouts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionCard,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderLeftColor: "#f59e0b",
                borderLeftWidth: 3.5,
                shadowColor: "#f59e0b",
                shadowOpacity: theme === "dark" ? 0.2 : 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            ]}
            onPress={() => router.push({ pathname: "/twin", params: { mode: "routine", tab: "meal" } })}
          >
            <View style={[styles.quickActionIconWrapper, { backgroundColor: "#f59e0b15" }]}>
              <Ionicons name="restaurant" size={20} color="#f59e0b" />
            </View>
            <Text style={[styles.quickActionLabel, { color: c.text }]}>Nutrition</Text>
            <Text style={[styles.quickActionSub, { color: c.sub }]}>Log calories</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionCard,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderLeftColor: "#6366f1",
                borderLeftWidth: 3.5,
                shadowColor: "#6366f1",
                shadowOpacity: theme === "dark" ? 0.2 : 0.08,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }
            ]}
            onPress={() => router.push({ pathname: "/twin", params: { mode: "routine", tab: "sleep" } })}
          >
            <View style={[styles.quickActionIconWrapper, { backgroundColor: "#6366f115" }]}>
              <Ionicons name="moon" size={20} color="#6366f1" />
            </View>
            <Text style={[styles.quickActionLabel, { color: c.text }]}>Sleep</Text>
            <Text style={[styles.quickActionSub, { color: c.sub }]}>Log sleep cycle</Text>
          </TouchableOpacity>
        </View>

        {/* ── BRAIN CALIBRATION BANNER ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Cognitive Calibration</Text>
        </View>

        <TouchableOpacity
          style={styles.brainCard}
          onPress={() => router.push("./brain/brain-lab")}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={["#6366f1", "#4f46e5"]}
            style={styles.brainGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.brainContent}>
              <View style={styles.brainBadge}>
                <Text style={styles.brainBadgeText}>NEURAL LAB</Text>
              </View>
              <Text style={styles.brainTitle}>Cognitive Stress Test</Text>
              <Text style={styles.brainSub}>Verify response delay & cognitive accuracy</Text>
            </View>
            <View style={styles.brainEmojiWrapper}>
              <Text style={styles.brainEmoji}>🧠</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Heart Rate Under Construction Modal */}
      <Modal visible={heartModalOpen} transparent animationType="slide" onRequestClose={() => setHeartModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 48 }}>🚧</Text>
            </View>
            <Text style={[styles.modalTitle, { color: c.text, textAlign: "center" }]}>
              Optical Heart Link
            </Text>
            <Text style={{ color: c.sub, fontSize: 13, textAlign: "center", lineHeight: 19, marginVertical: 8 }}>
              The camera-based Optical PPG Pulse detection system is currently undergoing hardware integration and fine-tuning.
            </Text>
            <Text style={{ color: c.sub, fontSize: 12, fontStyle: "italic", textAlign: "center", marginBottom: 18 }}>
              This feature will be enabled in the next production build.
            </Text>
            
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: "#ef4444" }]}
              onPress={() => setHeartModalOpen(false)}
            >
              <Text style={styles.modalBtnText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage !== "" && (
        <View style={[styles.toastContainer, { backgroundColor: c.text }]}>
          <Text style={[styles.toastText, { color: c.bg }]}>{toastMessage}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 115,
    paddingBottom: 40,
  },
  orbsContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
  },
  welcomeSection: {
    marginBottom: 24,
  },
  greetingSub: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    marginBottom: 14,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: "900",
  },
  statusBanner: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statusDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  statusBannerSub: {
    fontSize: 11,
    lineHeight: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "700",
  },
  headerBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  headerBadgeText: {
    color: "#10b981",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  telemetryCard: {
    width: CARD_SIZE,
    height: CARD_SIZE + 5,
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    marginBottom: 15,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  teleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  teleTitle: {
    fontWeight: "800",
    color: "#64748b",
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  teleContent: {
    justifyContent: "flex-end",
  },
  teleValue: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  teleUnit: {
    marginLeft: 4,
    marginBottom: 4,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
  },
  barBg: {
    height: 5,
    backgroundColor: "rgba(229, 231, 235, 0.25)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 8,
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  liveText: {
    color: "#22c55e",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  goalConvergenceCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 6,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  convergenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    zIndex: 1,
  },
  convergenceHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  convergenceTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  convergenceStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  convergenceStatCol: {
    flex: 1,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 11,
    fontWeight: "700",
  },
  statValueText: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  statTargetText: {
    fontSize: 12,
    fontWeight: "600",
  },
  miniBarBg: {
    height: 4,
    backgroundColor: "rgba(229, 231, 235, 0.25)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  miniBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  statPercentText: {
    fontSize: 10,
    fontWeight: "700",
  },
  loadingCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successStateCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  successIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  successStateTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  successStateSub: {
    fontSize: 12,
    textAlign: "center",
  },
  medicineList: {
    gap: 10,
  },
  medicineTimelineItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  medicinePillWrapper: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  medicineNameText: {
    fontSize: 14,
    fontWeight: "800",
  },
  medicineDoseText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  medicineTimeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(229, 231, 235, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  medicineTimeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  medicineMoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  symptomsList: {
    gap: 8,
  },
  symptomRowItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  symptomDotIndicator: {
    width: 6,
    height: 18,
    borderRadius: 3,
    marginRight: 10,
  },
  symptomNameText: {
    fontSize: 14,
    fontWeight: "800",
  },
  symptomTimeText: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  severityBadgeTextContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityTextLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  quickActionCard: {
    width: "48%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  quickActionIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  quickActionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  quickAddWaterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    width: "100%",
  },
  quickAddBtn: {
    flex: 1,
    backgroundColor: "rgba(2, 132, 199, 0.1)",
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  quickAddBtnText: {
    color: "#0284c7",
    fontSize: 10,
    fontWeight: "700",
  },
  brainCard: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  brainGradient: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brainContent: {
    flex: 1,
  },
  brainBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  brainBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  brainTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  brainSub: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  brainEmojiWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  brainEmoji: {
    fontSize: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalBtn: {
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 4,
  },
  modalBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  toastContainer: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 9999,
  },
  toastText: {
    fontWeight: "700",
    fontSize: 13,
  },
});