// app/heart-scanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade Heart Rate PPG Scanner using native Kotlin CameraX Analyzer.
// This replaces the legacy Python server implementation with 100% on-device local logic.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Share,
  Platform,
  PermissionsAndroid,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";

import CameraPreview from "../components/CameraPreview";
import PPGMeasurementScreen from "../components/PPGMeasurementScreen";
import { Camera } from "expo-camera"; // Still used for permission checks at JS layer if needed, or CameraView

import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useFamily } from "../context/FamilyContext";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";
import { doc, setDoc, collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { addVitalsRecord } from "../database/vitalsDB";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

// Import native bridge
import {
  startHeartRateMeasurement,
  stopHeartRateMeasurement,
  getLatestHeartRate,
  onHeartRateFrame,
  onHeartRateUpdate,
  onHeartRateDone,
  onHeartRateError,
  isNativeHeartRateAvailable,
  type HeartRateFrameEvent,
  type HeartRateUpdateEvent,
  type HeartRateDoneEvent,
  type HeartRateErrorEvent,
  type HeartRateReading,
} from "../services/heartRateNative";

const { width } = Dimensions.get("window");
const WAVEFORM_POINTS = 80;

export default function HeartScannerScreen() {
  useStackBackHandler();
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];
  const { activeMemberId } = useFamily();
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener("blur", () => {
      stopHeartRateMeasurement();
    });
    return () => {
      unsubscribeBlur();
      stopHeartRateMeasurement();
    };
  }, [navigation]);

  // Screen states: 'intro' | 'measuring' | 'results' | 'error'
  const [screenState, setScreenState] = useState<"intro" | "measuring" | "results" | "error">("intro");
  
  // Permissions status
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Measurement states
  const [fingerDetected, setFingerDetected] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [signalQuality, setSignalQuality] = useState(100);
  const [confidence, setConfidence] = useState(100);
  const [qualityLabel, setQualityLabel] = useState("Excellent");
  const [confidenceLabel, setConfidenceLabel] = useState("High");
  const [hasExcessiveMotion, setHasExcessiveMotion] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(30);

  // Results
  const [finalResult, setFinalResult] = useState<HeartRateDoneEvent | null>(null);
  const [comparisonBpm, setComparisonBpm] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Waveform data
  const [wavePoints, setWavePoints] = useState<number[]>(Array(WAVEFORM_POINTS).fill(0));
  const wavePointsRef = useRef<number[]>(Array(WAVEFORM_POINTS).fill(0));

  // Pulse animation for heart icon
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Track error messages
  const [errorMessage, setErrorMessage] = useState("");

  // History entries
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    const loadHistory = async () => {
      try {
        const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
        if (!uid || !active) return;

        const ref = collection(db, "users", uid, "heartRate");
        const q = query(ref, orderBy("timestamp", "desc"), limit(10));
        unsubscribe = onSnapshot(q, (snapshot) => {
          if (active) {
            const list = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              timestampMs: (doc.data().timestamp as any)?.toMillis?.() || Date.now(),
            }));
            setHistory(list);
          }
        }, (err) => {
          console.log("Error loading HR scanner history:", err);
        });
      } catch (err) {
        console.error("HR scanner history load error:", err);
      }
    };

    loadHistory();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [activeMemberId]);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  // Heartbeat pulse animation loop during measurement
  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    if (screenState === "measuring" && fingerDetected && liveBpm) {
      const interval = Math.max(300, Math.min(1200, (60 / liveBpm) * 1000));
      animLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: interval * 0.3,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: interval * 0.7,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animLoop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => animLoop?.stop();
  }, [screenState, fingerDetected, liveBpm]);

  // Load last Health Connect comparison data on Results screen
  useEffect(() => {
    if (screenState === "results") {
      (async () => {
        try {
          const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
          if (uid) {
            const latest = await getLatestHeartRate(uid);
            if (latest) {
              setComparisonBpm(latest.bpm);
            }
          }
        } catch (e) {
          console.log("Error fetching Health Connect / Room latest:", e);
        }
      })();
    }
  }, [screenState, activeMemberId]);

  // Active listeners for native module events
  useEffect(() => {
    // Measurement listeners are fully encapsulated inside HeartRateScanner component
    return;
  }, [screenState]);

  // Actions
  const handleStart = async () => {
    if (!isNativeHeartRateAvailable()) {
      setErrorMessage("Native Heart Rate PPG module is not compiled into this build. Please run: npx expo run:android");
      setScreenState("error");
      return;
    }

    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(false);
          Alert.alert("Permission Required", "Camera access is required for heart rate measurement.");
          return;
        }
      } catch (e) {
        console.warn("Android camera permission error:", e);
      }
    }

    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setHasPermission(false);
      Alert.alert("Permission Required", "Camera access is required for heart rate measurement.");
      return;
    }

    setHasPermission(true);
    setScreenState("measuring");
  };

  const handleCancel = () => {
    stopHeartRateMeasurement();
    setScreenState("intro");
  };

  const handleSave = async () => {
    if (!finalResult) return;
    setIsSaving(true);
    try {
      const uid = activeMemberId === "self" ? await getUserId() : activeMemberId;
      if (uid) {
        // Save to Firebase heartRate subcollection
        await addDoc(collection(db, "users", uid, "heartRate"), {
          bpm: finalResult.bpm,
          confidence: finalResult.confidence / 100.0,
          hrv_ms: 0, // Placeholder or native computation if added later
          timestamp: serverTimestamp(),
        });

        // Save daily summary
        await setDoc(
          doc(db, "users", uid),
          {
            heartRate: finalResult.bpm,
            heartRateTimestamp: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        await AsyncStorage.setItem(
          `latest_heartRate_${uid}`,
          JSON.stringify({ value: Math.round(finalResult.bpm), timestamp: new Date().toISOString() })
        );
      }

      // Save to local SQLite vitalsDB as well
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      await addVitalsRecord({
        date: dateStr,
        time: timeStr,
        heartRate: Math.round(finalResult.bpm),
        notes: "Camera PPG Heart Rate Scan",
      }, activeMemberId || "self").catch(err => console.log("Failed to insert heartRate record into vitalsDB:", err));

      Vibration.vibrate(50);
      if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); }
    } catch (e) {
      console.log("Error saving reading:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (!finalResult) return;
    try {
      await Share.share({
        message: `My VitalHealth Heart Rate Measurement: ${finalResult.bpm.toFixed(0)} BPM (Confidence: ${finalResult.confidence}%, Quality: ${finalResult.qualityLabel})`,
      });
    } catch (e) {
      console.log("Share error:", e);
    }
  };

  // Generate SVG path for waveform visualization
  const getWaveformPath = (): string => {
    return wavePoints
      .map((val, idx) => {
        const x = (idx / (WAVEFORM_POINTS - 1)) * (width - 48);
        const y = 60 - val; // Invert coordinates for SVG top-left origin
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  };

  // Render helper for headers
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={c.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: c.text }]}>Heart PPG Monitor</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // Render permissions blocker
  if (hasPermission === false) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
        {renderHeader()}
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={64} color="#ef476f" style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: c.text }]}>Camera Permission Required</Text>
          <Text style={[styles.description, { color: c.sub, paddingHorizontal: 32 }]}>
            VitalHealth uses your rear camera lens and flashlight to read the pulse in your finger natively.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 24 }]}
            onPress={async () => {
              const { status } = await Camera.requestCameraPermissionsAsync();
              setHasPermission(status === "granted");
            }}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>
      {renderHeader()}

      {screenState === "intro" && (
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.introGraphicContainer}>
            <LinearGradient
              colors={["#ef476f", "#ffd166"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.introOrb}
            >
              <Ionicons name="heart-half-sharp" size={72} color="#fff" />
            </LinearGradient>
          </View>

          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: c.text }]}>Heart Rate Measurement</Text>
            <Text style={[styles.subtitle, { color: c.sub }]}>
              Measure your pulse instantly using the phone camera and torch.
            </Text>
          </View>

          <View style={[styles.instructionsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Instructions</Text>
            
            <View style={styles.instructionStep}>
              <View style={[styles.stepNum, { backgroundColor: c.accent + "20" }]}>
                <Text style={[styles.stepNumText, { color: c.accent }]}>1</Text>
              </View>
              <Text style={[styles.stepText, { color: c.text }]}>Sit comfortably and rest your hand still.</Text>
            </View>

            <View style={styles.instructionStep}>
              <View style={[styles.stepNum, { backgroundColor: c.accent + "20" }]}>
                <Text style={[styles.stepNumText, { color: c.accent }]}>2</Text>
              </View>
              <Text style={[styles.stepText, { color: c.text }]}>Cover the entire rear camera lens and flashlight completely with your index finger.</Text>
            </View>

            <View style={styles.instructionStep}>
              <View style={[styles.stepNum, { backgroundColor: c.accent + "20" }]}>
                <Text style={[styles.stepNumText, { color: c.accent }]}>3</Text>
              </View>
              <Text style={[styles.stepText, { color: c.text }]}>Hold your position steady for 30 seconds until the scan is complete.</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: c.accent }]} onPress={handleStart}>
            <Ionicons name="pulse" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Start Measurement</Text>
          </TouchableOpacity>

          {/* Past Scans / History Section */}
          {history.length > 0 && (
            <View style={styles.historyContainer}>
              <Text style={[styles.historyTitle, { color: c.text }]}>Previous Measurements</Text>
              {history.map((item) => (
                <View key={item.id} style={[styles.historyRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={[styles.historyIconBox, { backgroundColor: "#ef4444" + "15" }]}>
                    <Ionicons name="heart" size={18} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyBpmText, { color: c.text }]}>{Math.round(item.bpm)} BPM</Text>
                    <Text style={[styles.historyMetaText, { color: c.sub }]}>
                      Confidence: {Math.round((item.confidence || 1) * 100)}%
                    </Text>
                  </View>
                  <Text style={[styles.historyTimeText, { color: c.sub }]}>
                    {new Date(item.timestampMs).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} · {new Date(item.timestampMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {screenState === "measuring" && (
        <PPGMeasurementScreen
          uid={activeMemberId === "self" ? "self" : activeMemberId}
          onFinish={(bpm, spo2, confidence, status, snr) => {
            setFinalResult({
              bpm,
              spo2,
              confidence,
              signalQuality: confidence,
              source: status,
              duration: 30.0,
              timestamp: Date.now(),
              progress: 1.0,
              snr,
              qualityLabel: snr >= 6.0 ? "Excellent" : snr >= 2.5 ? "Good" : snr >= 0.0 ? "Fair" : "Poor",
              confidenceLabel: confidence >= 80.0 ? "Very High" : confidence >= 60.0 ? "High" : confidence >= 40.0 ? "Medium" : "Low",
            });
            setScreenState("results");
            Vibration.vibrate([0, 100, 80, 100]);
          }}
          onCancel={() => {
            setScreenState("intro");
          }}
        />
      )}

      {screenState === "results" && finalResult && (
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <View style={[styles.resultsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.resultsHeaderLabel, { color: c.sub }]}>MEASUREMENT COMPLETE</Text>
            
            <View style={{ alignItems: "center", marginVertical: 20 }}>
              <View style={styles.resultBpmContainer}>
                <Text style={[styles.resultBpmValue, { color: c.accent }]}>{(finalResult.bpm ?? 0).toFixed(0)}</Text>
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.resultBpmUnit, { color: c.accent }]}>BPM</Text>
                  <Text style={[styles.resultBpmLabel, { color: c.sub }]}>Heart Rate</Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            {/* Metrics */}
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

            {/* Health Connect Comparison */}
            {comparisonBpm !== null && (
              <View style={[styles.comparisonCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="shield-checkmark" size={16} color="#06b6d4" style={{ marginRight: 6 }} />
                <Text style={[styles.comparisonText, { color: c.sub }]}>
                  Previous calibrated baseline: <Text style={{ color: c.text, fontWeight: "bold" }}>{comparisonBpm} BPM</Text>
                </Text>
              </View>
            )}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: c.accent, flex: 1 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.buttonText}>Save Measurement</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.outlineButton, { borderColor: c.border, width: 64, marginLeft: 12 }]} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={22} color={c.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.textLinkButton, { marginTop: 12 }]} onPress={handleStart}>
            <Text style={[styles.textLink, { color: c.accent }]}>Measure Again</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {screenState === "error" && (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={64} color="#ef4444" style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: c.text }]}>Measurement Failed</Text>
          <Text style={[styles.description, { color: c.sub, paddingHorizontal: 32 }]}>
            {errorMessage || "Insufficient signal quality. Please cover both the camera lens and flashlight completely."}
          </Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: c.accent, marginTop: 24 }]} onPress={handleStart}>
            <Text style={styles.buttonText}>Retry Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.textLinkButton, { marginTop: 12 }]} onPress={() => setScreenState("intro")}>
            <Text style={[styles.textLink, { color: c.sub }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  introGraphicContainer: {
    alignItems: "center",
    marginVertical: 32,
  },
  introOrb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ef476f",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  textBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  instructionsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
  },
  instructionStep: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNumText: {
    fontWeight: "bold",
    fontSize: 14,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: "row",
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  measuringContainer: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  statusCircleContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  statusOuterRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  statusInnerCard: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  liveBpmText: {
    fontSize: 48,
    fontWeight: "bold",
    marginTop: 4,
  },
  liveBpmLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  statusLabelText: {
    fontSize: 14,
    fontWeight: "bold",
  },
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
  badgeLabel: {
    fontSize: 11,
  },
  badgeValue: {
    fontSize: 11,
    fontWeight: "bold",
    marginLeft: 4,
  },
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
    marginBottom: 20,
  },
  resultBpmValue: {
    fontSize: 64,
    fontWeight: "bold",
  },
  resultBpmUnit: {
    fontSize: 20,
    fontWeight: "bold",
  },
  resultBpmLabel: {
    fontSize: 12,
  },
  divider: {
    height: 1,
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: "bold",
  },
  comparisonCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  comparisonText: {
    fontSize: 12,
  },
  buttonGroup: {
    flexDirection: "row",
  },
  textLinkButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  textLink: {
    fontSize: 15,
    fontWeight: "bold",
  },
  description: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  historyContainer: {
    width: "100%",
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  historyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  historyBpmText: {
    fontSize: 15,
    fontWeight: "600",
  },
  historyMetaText: {
    fontSize: 11,
    marginTop: 1,
  },
  historyTimeText: {
    fontSize: 11,
    textAlign: "right",
  },
});