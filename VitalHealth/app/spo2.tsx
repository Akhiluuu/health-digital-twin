import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
  Vibration,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useNavigation } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Camera } from "expo-camera";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

import CameraPreview from "../components/CameraPreview";

import { useTheme } from "../context/ThemeContext";
import { useFamily } from "../context/FamilyContext";
import { colors } from "../theme/colors";
import { addVitalsRecord } from "../database/vitalsDB";
import { useNotifications } from "../context/NotificationContext";

// 🔹 Firebase Imports
import { doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";

// 🔹 Native SpO2 Module Imports
import {
  startSpo2Measurement,
  stopSpo2Measurement,
  onSpo2Frame,
  onSpo2Update,
  onSpo2Done,
  onSpo2Error,
  isNativeSpo2Available,
  type Spo2DoneEvent,
  type Spo2FrameEvent,
  type Spo2UpdateEvent,
  type Spo2ErrorEvent,
} from "../services/spo2Native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Spo2Reading {
  value: number;
  timestamp: string;
}

const { width } = Dimensions.get("window");
const WAVEFORM_POINTS = 80;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getStatus = (value: number): { label: string; color: string; darkColor: string; bg: string; darkBg: string; icon: keyof typeof Ionicons.glyphMap } => {
  if (value >= 95) return { label: "Normal", color: "#15803d", darkColor: "#4ade80", bg: "#dcfce7", darkBg: "#14301e", icon: "checkmark-circle-outline" };
  if (value >= 90) return { label: "Low", color: "#b45309", darkColor: "#fbbf24", bg: "#fef3c7", darkBg: "#2d2210", icon: "warning-outline" };
  return { label: "Critical", color: "#b91c1c", darkColor: "#f87171", bg: "#fee2e2", darkBg: "#2d1010", icon: "alert-circle-outline" };
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Spo2Screen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const c = colors[theme];

  const { markReadByCategory } = useNotifications();

  useEffect(() => {
    markReadByCategory("vitals");
    markReadByCategory("alerts");
  }, []);

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener("blur", () => {
      stopSpo2Measurement();
    });
    return () => {
      unsubscribeBlur();
      stopSpo2Measurement();
    };
  }, [navigation]);

  // ─── State ──────────────────────────────────────────────────────────────────
  const [spo2, setSpo2] = useState("");
  const [latestReading, setLatestReading] = useState<Spo2Reading | null>(null);
  const [history, setHistory] = useState<Spo2Reading[]>([]);
  const [saving, setSaving] = useState(false);
  const { activeMemberId } = useFamily();

  // Mode state: 'dashboard' | 'permission_denied' | 'measuring' | 'results' | 'error'
  const [screenState, setScreenState] = useState<"dashboard" | "measuring" | "results" | "error">("dashboard");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Measurement State
  const [fingerDetected, setFingerDetected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liveSpo2, setLiveSpo2] = useState<number | null>(null);
  const [signalQuality, setSignalQuality] = useState(100);
  const [confidence, setConfidence] = useState(100);
  const [qualityLabel, setQualityLabel] = useState("Excellent");
  const [confidenceLabel, setConfidenceLabel] = useState("High");
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [errorMessage, setErrorMessage] = useState("");

  // Results State
  const [finalResult, setFinalResult] = useState<Spo2DoneEvent | null>(null);

  // Waveform
  const [wavePoints, setWavePoints] = useState<number[]>(Array(WAVEFORM_POINTS).fill(0));
  const wavePointsRef = useRef<number[]>(Array(WAVEFORM_POINTS).fill(0));
  const lastUpdateRef = useRef<Spo2UpdateEvent | null>(null);



  const getSpo2HeaderDetails = (): { title: string; subtext: string; color: string } => {
    if (!fingerDetected) {
      return {
        title: "Place Finger",
        subtext: "Cover the rear camera lens and flash completely with your index finger.",
        color: c.text,
      };
    }
    if (liveSpo2 === null || liveSpo2 === 0) {
      return {
        title: "Calibrating",
        subtext: "Locating blood oxygen level. Keep still.",
        color: c.text,
      };
    }
    return {
      title: "Measuring Oxygen",
      subtext: "Keep steady and breathe normally. Gathering SpO₂ details.",
      color: c.text,
    };
  };

  const headerDetails = getSpo2HeaderDetails();

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const loadHistory = async () => {
      try {
        const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
        if (!uid || !active) return;

        const ref = collection(db, "users", uid, "spo2");
        const q = query(ref, orderBy("timestamp", "desc"), limit(10));
        unsubscribe = onSnapshot(q, (snapshot) => {
          if (active) {
            const list = snapshot.docs.map(doc => ({
              value: doc.data().value || 0,
              timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
            }));
            setHistory(list);
          }
        }, (err) => {
          console.log("Error loading SpO2 scanner history:", err);
        });
      } catch (err) {
        console.error("SpO2 scanner history load error:", err);
      }
    };

    loadHistory();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [activeMemberId]);

  // Pulse animation for visual scanner indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // 🔹 Firebase Realtime Sync
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    loadData();

    const startSubscription = async () => {
      try {
        const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
        if (!active) return;
        if (!uid) return;

        const ref = doc(db, "users", uid);
        const unsub = onSnapshot(
          ref,
          (snapshot: any) => {
            if (!active) return;
            if (!snapshot.exists()) return;

            const data = snapshot.data();
            const health = data.healthData || data;
            if (health.spo2 !== undefined) {
              setLatestReading({
                value: health.spo2,
                timestamp: health.spo2Timestamp || new Date().toISOString(),
              });
            }
          },
          (err: any) => {
            console.log("⚠️ SpO₂ page onSnapshot error:", err);
          }
        );

        if (!active) unsub();
        else unsubscribe = unsub;
      } catch (error) {
        console.error("❌ SpO₂ screen subscription error:", error);
      }
    };

    startSubscription();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [activeMemberId]);

  // Main UI Pulse Animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.15, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Native SpO2 measurement subscription handlers
  useEffect(() => {
    if (screenState !== "measuring") return;

    // 1. Live frame rendering (Rolling waveform)
    const unsubFrame = onSpo2Frame((event: Spo2FrameEvent) => {
      setFingerDetected(event.fingerDetected);

      const nextPoints = [...wavePointsRef.current.slice(1)];
      // Normalize raw red average (80–255 range with relaxed threshold) to 5–45 SVG height
      const normalizedValue = Math.min(45, Math.max(5, ((event.ppgValue - 80) / 175) * 40));
      nextPoints.push(normalizedValue);

      wavePointsRef.current = nextPoints;
      setWavePoints(nextPoints);
    });

    // 2. Continuous measurement calculations
    const unsubUpdate = onSpo2Update((event: Spo2UpdateEvent) => {
      if (event.spo2 > 0) {
        lastUpdateRef.current = event;
      }
      setLiveSpo2(Math.round(event.spo2));
      setProgress(event.progress);
      setSignalQuality(event.signalQuality);
      setConfidence(event.confidence);
      setQualityLabel(event.qualityLabel);
      setConfidenceLabel(event.confidenceLabel);
      setSecondsRemaining(Math.max(0, Math.round(30 * (1 - event.progress))));

    });

    // 3. Successful measurement complete
    const unsubDone = onSpo2Done((event: Spo2DoneEvent) => {
      stopSpo2Measurement();
      setFinalResult(event);
      setScreenState("results");
      try {
        Vibration.vibrate([0, 100, 80, 100]);
      } catch (e) {
        console.warn("Vibration failed:", e);
      }
    });

    // 4. Handle Measurement Error
    const unsubError = onSpo2Error((event: Spo2ErrorEvent) => {
      stopSpo2Measurement();
      if (lastUpdateRef.current && lastUpdateRef.current.spo2 > 0) {
        const fallbackEvent: Spo2DoneEvent = {
          spo2: lastUpdateRef.current.spo2,
          confidence: lastUpdateRef.current.confidence,
          signalQuality: lastUpdateRef.current.signalQuality,
          duration: 30.0,
          timestamp: Date.now(),
          qualityLabel: lastUpdateRef.current.qualityLabel ?? "Good",
          confidenceLabel: lastUpdateRef.current.confidenceLabel ?? "High",
        };
        setFinalResult(fallbackEvent);
        setScreenState("results");
        try {
          Vibration.vibrate([0, 100, 80, 100]);
        } catch (e) {
          console.warn("Vibration failed:", e);
        }
      } else {
        setErrorMessage(event.message);
        setScreenState("error");
        try {
          Vibration.vibrate(200);
        } catch (e) {
          console.warn("Vibration failed:", e);
        }
      }
    });

    return () => {
      unsubFrame();
      unsubUpdate();
      unsubDone();
      unsubError();
    };
  }, [screenState]);

  // ─── Data Actions ───────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      const latestKey = `latest_spo2_${activeMemberId}`;
      const histKey = `spo2_history_${activeMemberId}`;

      let latest = await AsyncStorage.getItem(latestKey);
      if (!latest && activeMemberId === "self") {
        latest = await AsyncStorage.getItem("latest_spo2");
      }
      if (latest) setLatestReading(JSON.parse(latest));
      else setLatestReading(null);

      let hist = await AsyncStorage.getItem(histKey);
      if (!hist && activeMemberId === "self") {
        hist = await AsyncStorage.getItem("spo2_history");
      }
      if (hist) {
        try {
          const parsedHist = JSON.parse(hist);
          setHistory(Array.isArray(parsedHist) ? parsedHist : []);
        } catch { setHistory([]); }
      }
      else setHistory([]);
    } catch {}
  };

  const handleStartCameraScan = async () => {
    // 1. Verify native module availability
    if (!isNativeSpo2Available()) {
      Alert.alert(
        "Module Unavailable",
        "The native CameraX SpO2 scanner module is not loaded. Please run on a real Android device."
      );
      return;
    }

    // 2. Request Camera permission
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setHasPermission(false);
      Alert.alert("Permission Required", "Camera access is required for blood oxygen measurement.");
      return;
    }
    setHasPermission(true);

    // 3. Pre-fetch UID before any state changes to avoid async race conditions
    const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;

    // 4. Reset measurement state
    setProgress(0);
    setLiveSpo2(null);
    setFingerDetected(false);
    setSecondsRemaining(30);
    setWavePoints(Array(WAVEFORM_POINTS).fill(25));
    wavePointsRef.current = Array(WAVEFORM_POINTS).fill(25);

    // 5. Switch screen THEN wait for CameraPreview to mount before starting native
    setScreenState("measuring");
    // 600ms delay ensures the CameraPreview native view has been rendered and registered
    // with CameraPreviewShared before the Spo2Module tries to bind the camera lifecycle.
    setTimeout(() => {
      startSpo2Measurement(uid || "self");
    }, 600);
  };

  const handleCancelMeasurement = () => {
    stopSpo2Measurement();
    setScreenState("dashboard");
  };

  const saveSpo2Value = async (value: number) => {
    setSaving(true);
    try {
      const reading: Spo2Reading = { value, timestamp: new Date().toISOString() };

      await AsyncStorage.setItem(`latest_spo2_${activeMemberId}`, JSON.stringify(reading));

      const updatedHistory = [reading, ...history].slice(0, 10);
      await AsyncStorage.setItem(`spo2_history_${activeMemberId}`, JSON.stringify(updatedHistory));

      setLatestReading(reading);
      setHistory(updatedHistory);
      setSpo2("");

      // 🔹 Save to Firebase (History collection & user profile summary)
      const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
      if (uid) {
        // Save to spo2 subcollection
        await addDoc(collection(db, "users", uid, "spo2"), {
          value: value,
          confidence: finalResult ? finalResult.confidence / 100.0 : 1.0,
          timestamp: serverTimestamp(),
        });

        // Save daily summary
        await setDoc(
          doc(db, "users", uid),
          {
            spo2: value,
            spo2Timestamp: reading.timestamp,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      // Save to SQLite vitals log database
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      await addVitalsRecord({
        date: dateStr,
        time: timeStr,
        spo2: value,
        notes: "SpO₂ Measurement",
      }).catch(err => console.log("Failed to insert spo2 record into vitalsDB:", err));

      setScreenState("dashboard");

      if (value < 90) {
        Alert.alert(
          "⚠️ Critical Level",
          "Your SpO₂ is critically low. Please seek medical attention immediately.",
          [{ text: "OK" }]
        );
      }
    } catch (e) {
      Alert.alert("Error", "Failed to save reading. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveManualSpo2 = async () => {
    if (!spo2.trim()) {
      Alert.alert("Missing value", "Please enter your SpO₂ level.");
      return;
    }
    const value = parseInt(spo2);
    if (isNaN(value) || value < 50 || value > 100) {
      Alert.alert("Invalid input", "Please enter a value between 50 and 100.");
      return;
    }
    await saveSpo2Value(value);
  };

  const saveCameraSpo2 = async () => {
    if (!finalResult) return;
    await saveSpo2Value(Math.round(finalResult.spo2));
  };

  // ─── SVG Waveform Path Helper ───
  const getWaveformPath = () => {
    if (wavePoints.length === 0) return "M 0 40";
    const segmentWidth = (width - 64) / (WAVEFORM_POINTS - 1);
    return wavePoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${i * segmentWidth} ${80 - p}`)
      .join(" ");
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const numVal = parseInt(spo2);
  const previewStatus = !isNaN(numVal) && numVal >= 50 && numVal <= 100
    ? getStatus(numVal)
    : null;

  const latestStatus = latestReading ? getStatus(latestReading.value) : null;

  const RANGES = [
    { range: "95 – 100%", label: "Normal", color: "#15803d", darkColor: "#4ade80", bg: "#dcfce7", darkBg: "#14301e" },
    { range: "90 – 94%", label: "Low", color: "#b45309", darkColor: "#fbbf24", bg: "#fef3c7", darkBg: "#2d2210" },
    { range: "Below 90%", label: "Critical", color: "#b91c1c", darkColor: "#f87171", bg: "#fee2e2", darkBg: "#2d1010" },
  ];

  // ─── Render Parts ────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: c.card, borderBottomColor: c.border }]}>
      <TouchableOpacity
        onPress={() => {
          if (screenState !== "dashboard") {
            stopSpo2Measurement();
            setScreenState("dashboard");
          } else {
            router.back();
          }
        }}
        style={styles.backBtn}
      >
        <Ionicons name="arrow-back" size={20} color={c.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: c.text }]}>
        {screenState === "measuring" ? "Camera SpO₂ Scan" : "SpO₂ Monitor"}
      </Text>
      <View style={styles.headerRight} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {renderHeader()}

      {/* ────────────────── SCREEN STATE: DASHBOARD ────────────────── */}
      {screenState === "dashboard" && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Live Display Card ── */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            {/* Pulse ring + icon */}
            <View style={styles.iconWrapper}>
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    backgroundColor: isDark ? "#2563eb18" : "#2563eb12",
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
              <View style={[styles.iconCircle, { backgroundColor: isDark ? "#1e2e4a" : "#dbeafe" }]}>
                <Ionicons name="water" size={32} color={isDark ? "#5db4e8" : "#2563eb"} />
              </View>
            </View>

            <Text style={[styles.cardTitle, { color: c.text }]}>Oxygen Saturation</Text>
            <Text style={[styles.cardSub, { color: c.sub }]}>Blood oxygen level (SpO₂)</Text>

            {/* Last reading display */}
            {latestReading && latestStatus ? (
              <View style={[styles.latestBox, { backgroundColor: isDark ? latestStatus.darkBg : latestStatus.bg }]}>
                <Text style={[styles.latestValue, { color: isDark ? latestStatus.darkColor : latestStatus.color }]}>
                  {latestReading.value}<Text style={styles.latestUnit}>%</Text>
                </Text>
                <View style={styles.latestMeta}>
                  <Ionicons name={latestStatus.icon} size={14} color={isDark ? latestStatus.darkColor : latestStatus.color} />
                  <Text style={[styles.latestLabel, { color: isDark ? latestStatus.darkColor : latestStatus.color }]}>
                    {latestStatus.label}
                  </Text>
                </View>
                <Text style={[styles.latestTime, { color: c.sub }]}>{formatTime(latestReading.timestamp)}</Text>
              </View>
            ) : (
              <View style={[styles.latestBox, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}>
                <Text style={[styles.noReadingText, { color: c.sub }]}>No reading logged yet</Text>
              </View>
            )}
          </View>

          {/* ── Native Camera Scanner Launch ── */}
          {isNativeSpo2Available() && (
            <TouchableOpacity
              style={[styles.cameraScanBtn, { backgroundColor: c.accent }]}
              onPress={handleStartCameraScan}
              activeOpacity={0.8}
            >
              <Ionicons name="aperture-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.cameraScanBtnText}>Measure Blood Oxygen (Camera)</Text>
            </TouchableOpacity>
          )}

          {/* ── Manual Input Card ── */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Manual Log Entry</Text>
            <Text style={[styles.sectionSub, { color: c.sub }]}>Enter your SpO₂ percentage manually</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.bg,
                    borderColor: previewStatus
                      ? isDark ? previewStatus.darkColor : previewStatus.color
                      : c.border,
                    color: c.text,
                  },
                ]}
                placeholder="98"
                placeholderTextColor={c.sub}
                keyboardType="numeric"
                value={spo2}
                onChangeText={setSpo2}
                maxLength={3}
              />
              <Text style={[styles.inputUnit, { color: c.sub }]}>%</Text>
            </View>

            {/* Live preview badge */}
            {previewStatus && (
              <View style={[styles.previewBadge, { backgroundColor: isDark ? previewStatus.darkBg : previewStatus.bg }]}>
                <Ionicons name={previewStatus.icon} size={14} color={isDark ? previewStatus.darkColor : previewStatus.color} />
                <Text style={[styles.previewText, { color: isDark ? previewStatus.darkColor : previewStatus.color }]}>
                  {previewStatus.label}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: saving ? c.sub : c.accent },
              ]}
              onPress={saveManualSpo2}
              activeOpacity={0.8}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Reading"}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Reference Ranges ── */}
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>SpO₂ Reference</Text>
            <Text style={[styles.sectionSub, { color: c.sub }]}>Normal ranges & what they mean</Text>

            <View style={styles.rangesContainer}>
              {RANGES.map((r, i) => (
                <View
                  key={i}
                  style={[
                    styles.rangeRow,
                    { backgroundColor: isDark ? r.darkBg : r.bg },
                    i < RANGES.length - 1 && { marginBottom: 8 },
                  ]}
                >
                  <View style={[styles.rangeDot, { backgroundColor: isDark ? r.darkColor : r.color }]} />
                  <Text style={[styles.rangeRange, { color: isDark ? r.darkColor : r.color }]}>{r.range}</Text>
                  <Text style={[styles.rangeLabel, { color: isDark ? r.darkColor : r.color }]}>{r.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── History ── */}
          {history.length > 0 && (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Recent Readings</Text>
              <Text style={[styles.sectionSub, { color: c.sub }]}>Last {history.length} entries</Text>

              <View style={styles.historyList}>
                {history.map((item, i) => {
                  const s = getStatus(item.value);
                  return (
                    <View key={i}>
                      <View style={styles.historyRow}>
                        <View style={[styles.historyDot, { backgroundColor: isDark ? s.darkColor : s.color }]} />
                        <View style={styles.historyInfo}>
                          <Text style={[styles.historyValue, { color: c.text }]}>
                            {item.value}%
                          </Text>
                          <Text style={[styles.historyTime, { color: c.sub }]}>
                            {formatTime(item.timestamp)}
                          </Text>
                        </View>
                        <View style={[styles.historyBadge, { backgroundColor: isDark ? s.darkBg : s.bg }]}>
                          <Text style={[styles.historyBadgeText, { color: isDark ? s.darkColor : s.color }]}>
                            {s.label}
                          </Text>
                        </View>
                      </View>
                      {i < history.length - 1 && (
                        <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ────────────────── SCREEN STATE: MEASURING ────────────────── */}
      {screenState === "measuring" && (
        <View style={styles.measuringContainer}>


          {/* Header guidance */}
          <View style={{ alignItems: "center", marginTop: 10, marginBottom: 24 }}>
            <Text style={{ fontSize: 24, fontWeight: "bold", color: headerDetails.color, textAlign: "center", marginBottom: 8 }}>
              {headerDetails.title}
            </Text>
            <Text style={{ fontSize: 13, color: c.sub, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 }}>
              {headerDetails.subtext}
            </Text>
          </View>

          {/* Outer Status Ring */}
          <View style={styles.statusCircleContainer}>
            <View style={[styles.statusOuterRing, { borderColor: !fingerDetected ? c.border : c.accent, borderWidth: 3 }]}>
              <View style={[styles.statusInnerCard, { backgroundColor: c.card, overflow: "hidden" }]}>
                {/* Live Camera Feed */}
                <CameraPreview style={StyleSheet.absoluteFillObject} />

                {/* Translucent overlay backdrop for readability */}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: !fingerDetected ? "rgba(0, 0, 0, 0.55)" : "transparent" }]} />

                {!fingerDetected ? (
                  <View style={{ alignItems: "center" }}>
                    <Ionicons name="finger-print-outline" size={54} color="#ffffff" style={{ opacity: 0.85 }} />
                    <Text style={[styles.statusLabelText, { color: "#ffffff", marginTop: 8 }]}>
                      Cover Lens
                    </Text>
                  </View>
                ) : (liveSpo2 === null || liveSpo2 === 0) ? (
                  <View style={{ alignItems: "center" }}>
                    <ActivityIndicator size="large" color="#ffffff" />
                    <Text style={[styles.statusLabelText, { color: "#ffffff", marginTop: 8 }]}>
                      Calibrating...
                    </Text>
                  </View>
                ) : (
                  <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: "center" }}>
                    <Ionicons name="water" size={32} color={c.accent} style={{ marginBottom: 4 }} />
                    <Text style={[styles.liveBpmText, { color: "#ffffff", fontSize: 44, fontWeight: "bold" }]}>
                      {liveSpo2}%
                    </Text>
                    <Text style={[styles.liveBpmLabel, { color: "rgba(255, 255, 255, 0.7)", fontSize: 11, fontWeight: "600", marginTop: 2 }]}>
                      SpO₂
                    </Text>
                  </Animated.View>
                )}
              </View>
            </View>
          </View>

          {/* Countdown timer */}
          <View style={styles.progressContainer}>
            <Text style={[styles.countdownText, { color: c.text }]}>{secondsRemaining}s remaining</Text>
            <View style={[styles.progressBarBg, { backgroundColor: c.border }]}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: c.accent }]} />
            </View>
          </View>

          {/* Svg rolling waveform */}
          <View style={[styles.waveformContainer, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.waveformHeader}>
              <Ionicons name="analytics" size={16} color={c.accent} />
              <Text style={[styles.waveformTitle, { color: c.text }]}>LIVE OXYGEN PPG WAVEFORM</Text>
            </View>
            <Svg width="100%" height="80">
              <Path
                d={getWaveformPath()}
                fill="none"
                stroke={c.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          {/* Tips for Accuracy Card */}
          <View style={[styles.guidanceCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.guidanceHeader}>
              <Ionicons name="bulb-outline" size={18} color={c.accent} />
              <Text style={[styles.guidanceTitle, { color: c.text }]}>Tips for Accuracy</Text>
            </View>
            <View style={styles.tipsList}>
              <Text style={[styles.tipText, { color: c.sub }]}>
                • Cover the camera lens & flash completely with your index finger.
              </Text>
              <Text style={[styles.tipText, { color: c.sub }]}>
                • Rest your finger gently; pressing too hard restricts blood flow.
              </Text>
              <Text style={[styles.tipText, { color: c.sub }]}>
                • Keep your hands warm; cold fingers reduce blood flow signals.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.outlineButton, { borderColor: c.border, marginTop: "auto" }]} onPress={handleCancelMeasurement}>
            <Text style={[styles.outlineButtonText, { color: c.text }]}>Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ────────────────── SCREEN STATE: RESULTS ────────────────── */}
      {screenState === "results" && finalResult && (
        <View style={styles.resultsContainer}>
          <View style={[styles.resultsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.resultsHeaderLabel, { color: c.sub }]}>MEASUREMENT COMPLETE</Text>

            <View style={styles.resultBpmContainer}>
              <Text style={[styles.resultBpmValue, { color: c.accent }]}>{Math.round(finalResult.spo2 ?? 98)}</Text>
              <View style={{ marginLeft: 8 }}>
                <Text style={[styles.resultBpmUnit, { color: c.accent }]}>%</Text>
                <Text style={[styles.resultBpmLabel, { color: c.sub }]}>Blood Oxygen</Text>
              </View>
            </View>

            <View style={[styles.dividerLine, { backgroundColor: c.border, marginVertical: 16 }]} />

            {/* Quality Summary metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: c.sub }]}>Quality</Text>
                <Text style={[styles.metricVal, { color: (finalResult.signalQuality ?? 0) > 60 ? "#4ade80" : "#ef4444" }]}>
                  {finalResult.qualityLabel ?? "Fair"}
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: c.sub }]}>Confidence</Text>
                <Text style={[styles.metricVal, { color: (finalResult.confidence ?? 0) > 60 ? "#06b6d4" : "#f59e0b" }]}>
                  {finalResult.confidenceLabel ?? "Medium"}
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: c.sub }]}>Duration</Text>
                <Text style={[styles.metricVal, { color: c.text }]}>{(finalResult.duration ?? 30).toFixed(0)}s</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.cameraScanBtn, { backgroundColor: c.accent, width: "100%", marginBottom: 12 }]}
            onPress={saveCameraSpo2}
            disabled={saving}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.cameraScanBtnText}>{saving ? "Saving..." : "Save Measurement"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: c.border, width: "100%" }]}
            onPress={() => setScreenState("dashboard")}
          >
            <Text style={[styles.outlineButtonText, { color: c.text }]}>Discard</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ────────────────── SCREEN STATE: ERROR ────────────────── */}
      {screenState === "error" && (
        <View style={styles.resultsContainer}>
          <View style={[styles.resultsCard, { backgroundColor: c.card, borderColor: c.border, alignItems: "center" }]}>
            <Ionicons name="alert-circle" size={64} color="#ef4444" style={{ marginBottom: 16 }} />
            <Text style={[styles.sectionTitle, { color: c.text, textAlign: "center" }]}>Measurement Failed</Text>
            <Text style={[styles.sectionSub, { color: c.sub, textAlign: "center", marginTop: 8 }]}>
              {errorMessage || "Insufficient signal quality. Make sure you cover the camera completely and remain steady."}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.cameraScanBtn, { backgroundColor: c.accent, width: "100%", marginBottom: 12 }]}
            onPress={handleStartCameraScan}
          >
            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.cameraScanBtnText}>Retry Scan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: c.border, width: "100%" }]}
            onPress={() => setScreenState("dashboard")}
          >
            <Text style={[styles.outlineButtonText, { color: c.text }]}>Back to Monitor</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  headerRight: { width: 28 },
  scroll: { padding: 16, gap: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 20,
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    height: 80,
  },
  pulseRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  cardSub: { fontSize: 13, textAlign: "center", marginBottom: 16 },
  latestBox: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 6,
  },
  latestValue: { fontSize: 52, fontWeight: "700", lineHeight: 58 },
  latestUnit: { fontSize: 24, fontWeight: "400" },
  latestMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  latestLabel: { fontSize: 14, fontWeight: "600" },
  latestTime: { fontSize: 12, marginTop: 2 },
  noReadingText: { fontSize: 14, paddingVertical: 12, fontWeight: "500" },

  // Scan Launch
  cameraScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cameraScanBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Input
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  sectionSub: { fontSize: 13, marginBottom: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
  },
  inputUnit: { fontSize: 22, fontWeight: "500" },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    marginBottom: 14,
  },
  previewText: { fontSize: 13, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Ranges
  rangesContainer: { gap: 0 },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 10,
  },
  rangeDot: { width: 8, height: 8, borderRadius: 4 },
  rangeRange: { flex: 1, fontSize: 14, fontWeight: "500" },
  rangeLabel: { fontSize: 13, fontWeight: "600" },

  // History
  historyList: { gap: 0 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historyValue: { fontSize: 15, fontWeight: "600" },
  historyTime: { fontSize: 12, marginTop: 1 },
  historyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  historyBadgeText: { fontSize: 11, fontWeight: "600" },
  dividerLine: { height: 0.5 },

  // Measuring State UI
  measuringContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  statusCircleContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 32,
  },
  statusOuterRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusInnerCard: {
    width: 172,
    height: 172,
    borderRadius: 86,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  liveBpmText: { fontSize: 44, fontWeight: "bold" },
  liveBpmLabel: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  statusLabelText: { fontSize: 13, fontWeight: "600", textAlign: "center" },

  progressContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  countdownText: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  waveformContainer: {
    height: 120,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  waveformHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  waveformTitle: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    marginLeft: 6,
  },
  badgesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statusBadge: {
    flex: 0.48,
    flexDirection: "row",
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  badgeLabel: { fontSize: 11 },
  badgeValue: { fontSize: 11, fontWeight: "bold", marginLeft: 4 },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f59e0b10",
    padding: 12,
    borderRadius: 14,
    marginBottom: 24,
  },
  alertText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  outlineButton: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },

  // Results State UI
  resultsContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  resultsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    marginBottom: 24,
  },
  resultsHeaderLabel: {
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  resultBpmContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  resultBpmValue: { fontSize: 64, fontWeight: "bold" },
  resultBpmUnit: { fontSize: 20, fontWeight: "bold" },
  resultBpmLabel: { fontSize: 12 },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: { fontSize: 11, marginBottom: 4 },
  metricVal: { fontSize: 16, fontWeight: "bold" },
  guidanceCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
  },
  guidanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  guidanceTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  tipsList: {
    gap: 6,
  },
  tipText: {
    fontSize: 12,
    lineHeight: 18,
  },
});