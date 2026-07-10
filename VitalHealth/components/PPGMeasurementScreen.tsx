import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
  Easing,
  TextInput,
  ScrollView,
  Alert,
} from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import CameraPreview from "./CameraPreview";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import {
  startHeartRateMeasurement,
  stopHeartRateMeasurement,
  onHeartRateUpdate,
  onHeartRateDone,
  onHeartRateError,
  getHeartRateFftSpectrum,
  getHeartRateDetectedPeaks,
  calibrateHeartRateDevice,
} from "../services/heartRateNative";

const { width } = Dimensions.get("window");

interface PPGMeasurementScreenProps {
  uid?: string;
  onFinish?: (bpm: number, spo2: number, confidence: number, status: string, snr: number) => void;
  onCancel?: () => void;
}

type OperationalStatus =
  | "CALIBRATING"
  | "MEASURING"
  | "TOO_MUCH_PRESSURE"
  | "MOTION_ARTIFACT_DETECTED"
  | "SIGNAL_LOW_QUALITY"
  | "COMPLETED";

const TOTAL_SECS = 30;

export default function PPGMeasurementScreen({
  uid = "self",
  onFinish,
  onCancel,
}: PPGMeasurementScreenProps) {
  const { theme: appThemeMode } = useTheme();
  const c = colors[appThemeMode] || colors.dark;

  const [bpm, setBpm] = useState(0);
  const [spo2, setSpo2] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [snr, setSnr] = useState(-10.0);
  const [status, setStatus] = useState<OperationalStatus>("CALIBRATING");
  const [pulseWave, setPulseWave] = useState(0);
  const [progressSecs, setProgressSecs] = useState(0);
  const [waveHistory, setWaveHistory] = useState<number[]>(Array(60).fill(0));

  // Debug Panel States
  const [showDebug, setShowDebug] = useState(false);
  const [fftData, setFftData] = useState<number[]>([]);
  const [peaksData, setPeaksData] = useState<number[]>([]);
  const [refHr, setRefHr] = useState("");
  const [refSpo2, setRefSpo2] = useState("");

  // Animations
  const pulseScale = useRef(new Animated.Value(1)).current;
  const skeletonPulse = useRef(new Animated.Value(0.4)).current;
  const resultsFadeAnim = useRef(new Animated.Value(0)).current;

  const prevStatusRef = useRef<OperationalStatus>("CALIBRATING");
  const isCompletedRef = useRef(false);
  const finalValuesRef = useRef({ bpm: 0, spo2: 98, confidence: 0, snr: -10 });

  // Skeleton shimmer during calibration
  useEffect(() => {
    if (status === "CALIBRATING") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonPulse, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(skeletonPulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      skeletonPulse.setValue(1.0);
    }
  }, [status]);

  const handleComplete = useCallback(
    (finalBpm: number, finalSpo2: number, finalConf: number, finalSnr: number) => {
      if (isCompletedRef.current) return;
      isCompletedRef.current = true;
      finalValuesRef.current = { bpm: finalBpm, spo2: finalSpo2, confidence: finalConf, snr: finalSnr };
      setBpm(finalBpm);
      setSpo2(finalSpo2);
      setConfidence(finalConf);
      setSnr(finalSnr);
      setStatus("COMPLETED");
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        console.warn("Haptics feedback failed:", e);
      }
      Animated.timing(resultsFadeAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }).start();
    },
    []
  );

  // Subscribe to native events
  useEffect(() => {
    isCompletedRef.current = false;

    // Delay start slightly so the CameraPreview native view has time to mount
    // and register itself with CameraPreviewShared before the native module tries
    // to bind the camera to the lifecycle.
    const startTimer = setTimeout(() => {
      startHeartRateMeasurement(uid);
    }, 600);

    // Live update events
    const unsubUpdate = onHeartRateUpdate((event) => {
      if (isCompletedRef.current) return;

      const rawStatus = event.status ?? "CALIBRATING";
      let nextStatus: OperationalStatus = "MEASURING";
      if (rawStatus === "CALIBRATING") nextStatus = "CALIBRATING";
      else if (rawStatus === "TOO_MUCH_PRESSURE") nextStatus = "TOO_MUCH_PRESSURE";
      else if (rawStatus === "MOTION_ARTIFACT_DETECTED") nextStatus = "MOTION_ARTIFACT_DETECTED";
      else if (rawStatus === "SIGNAL_LOW_QUALITY") nextStatus = "SIGNAL_LOW_QUALITY";

      const nextBpm = event.bpm ?? 0;
      const nextSpo2 = event.spo2 ?? 0;
      const nextConf = event.confidence ?? 0;
      const nextSnr = event.snr ?? -10;
      const nextPulse = event.pulseWave ?? 0;
      const nextProgress = event.progress ?? 0;

      setBpm(nextBpm);
      setSpo2(nextSpo2);
      setConfidence(nextConf);
      setSnr(nextSnr);
      setStatus(nextStatus);
      setPulseWave(nextPulse);
      setProgressSecs(nextProgress * TOTAL_SECS);

      if (nextBpm > 0) {
        finalValuesRef.current = { bpm: nextBpm, spo2: nextSpo2 > 0 ? nextSpo2 : 98, confidence: nextConf, snr: nextSnr };
      }

      if (nextStatus !== prevStatusRef.current) {
        try {
          if (nextStatus === "TOO_MUCH_PRESSURE" || nextStatus === "SIGNAL_LOW_QUALITY") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } else if (nextStatus === "MEASURING") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        } catch (e) {
          console.warn("Haptics feedback failed:", e);
        }
        prevStatusRef.current = nextStatus;
      }

      setWaveHistory((prev) => {
        const next = [...prev.slice(1)];
        next.push(nextPulse);
        return next;
      });

      // Retrieve live spectral data and peak list for research telemetry
      getHeartRateFftSpectrum().then((spectrum) => {
        if (spectrum && spectrum.length > 0) setFftData(spectrum);
      });
      getHeartRateDetectedPeaks().then((peaks) => {
        if (peaks && peaks.length > 0) setPeaksData(peaks);
      });
    });

    // Done event — native module finished the 30-second window
    const unsubDone = onHeartRateDone((event) => {
      handleComplete(
        event.bpm ?? 0,
        event.spo2 ?? 98,
        event.confidence ?? 0,
        event.snr ?? 0
      );
    });

    // Error event
    const unsubError = onHeartRateError((event) => {
      if (!isCompletedRef.current) {
        // Treat error as completion with whatever values we have
        const fv = finalValuesRef.current;
        handleComplete(fv.bpm, fv.spo2, fv.confidence, fv.snr);
      }
    });

    return () => {
      clearTimeout(startTimer);
      unsubUpdate();
      unsubDone();
      unsubError();
      stopHeartRateMeasurement();
    };
  }, [uid]);

  // Pulse ring spring animation
  useEffect(() => {
    if (status === "MEASURING") {
      Animated.spring(pulseScale, {
        toValue: 1.0 + Math.max(-0.1, Math.min(0.18, pulseWave * 0.5)),
        useNativeDriver: true,
        friction: 3.5,
        tension: 50,
      }).start();
    } else {
      Animated.spring(pulseScale, { toValue: 1.0, useNativeDriver: true, friction: 6, tension: 30 }).start();
    }
  }, [pulseWave, status]);

  const handleRestart = () => {
    isCompletedRef.current = false;
    finalValuesRef.current = { bpm: 0, spo2: 98, confidence: 0, snr: -10 };
    setProgressSecs(0);
    setBpm(0);
    setSpo2(0);
    setConfidence(0);
    setSnr(-10);
    setWaveHistory(Array(60).fill(0));
    setStatus("CALIBRATING");
    prevStatusRef.current = "CALIBRATING";
    resultsFadeAnim.setValue(0);
    stopHeartRateMeasurement();
    setTimeout(() => startHeartRateMeasurement(uid), 600);
  };

  const headerConfig = {
    CALIBRATING: { title: "Calibrating", sub: "Place your finger firmly over the camera and flash.", color: c.text },
    MEASURING: { title: "Keep Steady", sub: "Measuring your cardiac pulse...", color: c.text },
    TOO_MUCH_PRESSURE: { title: "Pressing Too Hard", sub: "Lighten your touch — blood is being restricted.", color: "#ef4444" },
    SIGNAL_LOW_QUALITY: { title: "No Finger Detected", sub: "Cover the camera lens and flash completely.", color: "#f59e0b" },
    MOTION_ARTIFACT_DETECTED: { title: "Movement Detected", sub: "Hold completely still for accurate readings.", color: "#f59e0b" },
    COMPLETED: { title: "Scan Complete", sub: "Biometrics successfully collected.", color: "#10b981" },
  };
  const hdr = headerConfig[status];

  const ringColor =
    status === "TOO_MUCH_PRESSURE" ? "#ef4444"
    : status === "SIGNAL_LOW_QUALITY" ? "#f59e0b"
    : status === "MOTION_ARTIFACT_DETECTED" ? "#f59e0b"
    : status === "MEASURING" ? "#10b981"
    : c.border || "rgba(255,255,255,0.2)";

  const getWaveformPath = (): string => {
    const H = 64;
    const W = width - 96;
    const minVal = Math.min(...waveHistory);
    const maxVal = Math.max(...waveHistory);
    const range = maxVal - minVal;
    return waveHistory
      .map((val, idx) => {
        const x = (idx / 59) * W;
        const norm = range > 1e-5 ? (val - minVal) / range : 0.5;
        const y = H - (norm * (H - 12) + 6);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const getFftPath = (): string => {
    if (fftData.length < 68) return "M 0 80";
    const bins = fftData.slice(12, 68); // 0.7 to 4.0 Hz
    const maxVal = Math.max(...bins, 1e-5);
    const H = 80;
    const W = width - 96;
    return bins
      .map((val, idx) => {
        const x = (idx / (bins.length - 1)) * W;
        const norm = val / maxVal;
        const y = H - norm * H;
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const handleCalibrate = () => {
    const hrVal = parseFloat(refHr);
    const spo2Val = parseFloat(refSpo2);
    if (isNaN(hrVal) || isNaN(spo2Val) || hrVal < 35 || hrVal > 220 || spo2Val < 80 || spo2Val > 100) {
      Alert.alert("Invalid Input", "Please enter valid reference values:\nHeart Rate: 35 - 220 BPM\nSpO2: 80 - 100%");
      return;
    }
    calibrateHeartRateDevice(hrVal, spo2Val);
    Alert.alert("Success", "Device calibrated successfully against reference readings!");
  };

  const secondsRemaining = Math.max(0, TOTAL_SECS - Math.floor(progressSecs));
  const progressRatio = Math.min(1, progressSecs / TOTAL_SECS);
  const circumference = 2 * Math.PI * 95;

  const isActive = status !== "CALIBRATING" && status !== "SIGNAL_LOW_QUALITY" && status !== "COMPLETED";
  const showDashes = status === "CALIBRATING" || status === "SIGNAL_LOW_QUALITY";

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>

      {/* Header */}
      <View style={styles.topZone}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingHorizontal: 4 }}>
          <View style={{ width: 32 }} />
          <Text style={[styles.title, { color: hdr.color, flex: 1, textAlign: "center" }]}>{hdr.title}</Text>
          <TouchableOpacity onPress={() => setShowDebug(!showDebug)} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="bug-outline" size={22} color={showDebug ? "#ef476f" : c.text} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.subtext, { color: c.sub || "rgba(255,255,255,0.6)" }]}>{hdr.sub}</Text>
      </View>

      {/* Debug Panel Overlay */}
      {showDebug && (
        <View style={[styles.debugOverlay, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.debugHeader}>
            <Ionicons name="bug-outline" size={20} color="#ef476f" />
            <Text style={[styles.debugTitle, { color: c.text }]}>DSP Telemetry & Calibration</Text>
            <TouchableOpacity onPress={() => setShowDebug(false)} style={styles.debugCloseBtn}>
              <Ionicons name="close" size={20} color={c.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.debugScroll} showsVerticalScrollIndicator={false}>
            {/* Telemetry Metrics */}
            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: c.sub }]}>SIGNAL QUALITY INDEX (SQI)</Text>
              <View style={styles.debugGrid}>
                <View style={[styles.debugCard, { backgroundColor: c.bg }]}>
                  <Text style={[styles.debugCardLabel, { color: c.sub }]}>SNR</Text>
                  <Text style={[styles.debugCardValue, { color: snr >= 2.5 ? "#10b981" : "#ef4444" }]}>
                    {snr.toFixed(2)} dB
                  </Text>
                </View>
                <View style={[styles.debugCard, { backgroundColor: c.bg }]}>
                  <Text style={[styles.debugCardLabel, { color: c.sub }]}>Confidence</Text>
                  <Text style={[styles.debugCardValue, { color: confidence >= 65 ? "#10b981" : "#f59e0b" }]}>
                    {confidence.toFixed(1)}%
                  </Text>
                </View>
              </View>
              <View style={[styles.debugGrid, { marginTop: 8 }]}>
                <View style={[styles.debugCard, { backgroundColor: c.bg }]}>
                  <Text style={[styles.debugCardLabel, { color: c.sub }]}>PPG AC/DC</Text>
                  <Text style={[styles.debugCardValue, { color: c.text }]}>
                    {pulseWave.toFixed(4)}
                  </Text>
                </View>
                <View style={[styles.debugCard, { backgroundColor: c.bg }]}>
                  <Text style={[styles.debugCardLabel, { color: c.sub }]}>DSP Status</Text>
                  <Text style={[styles.debugCardValue, { color: c.text, fontSize: 11 }]}>
                    {status}
                  </Text>
                </View>
              </View>
            </View>

            {/* FFT Spectrum */}
            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: c.sub }]}>FFT CARDIAC POWER SPECTRUM (0.7 - 4.0 Hz)</Text>
              <View style={[styles.fftCardBg, { backgroundColor: c.bg, borderColor: c.border }]}>
                {fftData.length > 0 ? (
                  <Svg width="100%" height={80}>
                    <Path d={getFftPath()} fill="none" stroke="#ef476f" strokeWidth={2} />
                  </Svg>
                ) : (
                  <Text style={[styles.noFftText, { color: c.sub }]}>Waiting for first 3s epoch...</Text>
                )}
              </View>
            </View>

            {/* Detected Peaks */}
            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: c.sub }]}>DETECTED PEAKS (INDEX BUFFER)</Text>
              <View style={[styles.peaksContainer, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Text style={[styles.peaksText, { color: c.text }]}>
                  {peaksData.length > 0 ? peaksData.slice(0, 10).join(", ") : "No peaks detected yet"}
                </Text>
              </View>
            </View>

            {/* Device Calibration */}
            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: c.sub }]}>GOLD-STANDARD DEVICE CALIBRATION</Text>
              <View style={[styles.calibCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Text style={[styles.calibDesc, { color: c.sub }]}>
                  Enter reference values from a clinical device to lock calibration offsets.
                </Text>
                <View style={styles.calibInputsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: c.sub }]}>Ref HR (BPM)</Text>
                    <TextInput
                      style={[styles.calibInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
                      keyboardType="numeric"
                      value={refHr}
                      onChangeText={setRefHr}
                      placeholder="e.g. 72"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputLabel, { color: c.sub }]}>Ref SpO2 (%)</Text>
                    <TextInput
                      style={[styles.calibInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
                      keyboardType="numeric"
                      value={refSpo2}
                      onChangeText={setRefSpo2}
                      placeholder="e.g. 98"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />
                  </View>
                </View>
                <TouchableOpacity style={[styles.calibBtn, { backgroundColor: c.primary || "#6366f1" }]} onPress={handleCalibrate}>
                  <Text style={styles.calibBtnText}>Lock Calibration</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Center ring zone */}
      <View style={styles.centerZone}>
        {status !== "COMPLETED" && (
          <View style={styles.ringsWrapper}>
            {/* Progress ring */}
            <Svg width={220} height={220} style={StyleSheet.absoluteFillObject}>
              <Circle cx={110} cy={110} r={95} stroke={c.border || "rgba(255,255,255,0.12)"} strokeWidth={4} fill="transparent" />
              <Circle
                cx={110} cy={110} r={95}
                stroke={isActive ? "#10b981" : c.primary || "#6366f1"}
                strokeWidth={4}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (isActive ? progressRatio : 0))}
                strokeLinecap="round"
                transform="rotate(-90 110 110)"
              />
            </Svg>

            {/* Pulse ring with live camera */}
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], borderColor: ringColor }]}>
              <CameraPreview style={StyleSheet.absoluteFillObject} />

              {/* Dark overlay for readability */}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.35)" }]} />

              {status === "SIGNAL_LOW_QUALITY" ? (
                <View style={styles.centeredState}>
                  <Ionicons name="finger-print-outline" size={48} color="#ffffff" style={{ opacity: 0.9 }} />
                  <Text style={styles.stateLabel}>Place Finger</Text>
                </View>
              ) : status === "CALIBRATING" ? (
                <View style={styles.centeredState}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.stateLabel}>Calibrating...</Text>
                </View>
              ) : (
                /* Live heart rate metric */
                <View style={styles.metricsInner}>
                  <View style={styles.metricCol}>
                    <Ionicons name="heart" size={24} color="#ef476f" style={{ marginBottom: 4 }} />
                    <Animated.Text style={[styles.metricBig, { opacity: skeletonPulse, fontSize: 36 }]}>
                      {bpm > 0 ? Math.round(bpm) : "--"}
                    </Animated.Text>
                    <Text style={styles.metricUnit}>BPM</Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {/* Completed results card */}
        {status === "COMPLETED" && (
          <Animated.View style={[styles.completedCard, { opacity: resultsFadeAnim, backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.completedHeader}>
              <Ionicons name="checkmark-circle" size={48} color="#10b981" />
              <Text style={[styles.completedTitle, { color: c.text }]}>Scan Complete</Text>
              <Text style={[styles.completedSub, { color: c.sub }]}>30-second biometric sweep finished</Text>
            </View>

            <View style={[styles.dividerH, { backgroundColor: c.border }]} />

            <View style={styles.resultsRow}>
              <View style={styles.resultCell}>
                <Ionicons name="heart" size={26} color="#ef476f" style={{ marginBottom: 6 }} />
                <Text style={[styles.resultBig, { color: c.text }]}>{bpm > 0 ? Math.round(bpm) : "--"}</Text>
                <Text style={[styles.resultUnit, { color: c.sub }]}>BPM</Text>
                <Text style={[styles.resultDesc, { color: c.sub }]}>Heart Rate</Text>
              </View>
            </View>

            <View style={[styles.dividerH, { backgroundColor: c.border }]} />

            <View style={styles.metaGrid}>
              <View style={styles.metaRow}>
                <Text style={[styles.metaKey, { color: c.sub }]}>Confidence</Text>
                <Text style={[styles.metaVal, { color: confidence >= 60 ? "#10b981" : "#f59e0b" }]}>{Math.round(confidence)}%</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: c.primary || "#6366f1" }]}
              onPress={() => onFinish && onFinish(bpm, 0, confidence, "COMPLETED", snr)}
            >
              <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save Results</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Status banners */}
        {status === "MOTION_ARTIFACT_DETECTED" && (
          <View style={styles.statusBanner}>
            <Ionicons name="walk" size={14} color="#f59e0b" />
            <Text style={[styles.statusBannerText, { color: "#f59e0b" }]}>Motion detected — hold still</Text>
          </View>
        )}
        {status === "TOO_MUCH_PRESSURE" && (
          <View style={styles.statusBanner}>
            <Ionicons name="hand-left-outline" size={14} color="#ef4444" />
            <Text style={[styles.statusBannerText, { color: "#ef4444" }]}>Lighten finger pressure</Text>
          </View>
        )}
      </View>

      {/* Bottom zone */}
      {status !== "COMPLETED" && (
        <View style={styles.bottomZone}>
          {/* Timer row */}
          <View style={styles.timerRow}>
            <Text style={[styles.timerText, { color: c.text }]}>
              {isActive ? `${secondsRemaining}s remaining` : "Waiting for contact..."}
            </Text>
            <Text style={[styles.confText, { color: c.sub }]}>
              {status === "CALIBRATING" ? "Locking signal..." : `Confidence: ${Math.round(confidence)}%`}
            </Text>
          </View>

          {/* Live waveform */}
          <View style={[styles.waveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.waveHeader}>
              <View style={[styles.waveDot, { backgroundColor: status === "MEASURING" ? "#10b981" : "#6b7280" }]} />
              <Text style={[styles.waveLabel, { color: c.sub }]}>LIVE PPG SIGNAL</Text>
            </View>
            <Svg width="100%" height={64}>
              <Defs>
                <LinearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={c.primary || "#6366f1"} stopOpacity="0.4" />
                  <Stop offset="100%" stopColor={c.primary || "#6366f1"} stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              <Path d={getWaveformPath()} fill="none" stroke={c.primary || "#6366f1"} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <Path d={`${getWaveformPath()} L ${width - 96} 64 L 0 64 Z`} fill="url(#wg)" />
            </Svg>
          </View>

          {/* Tip card */}
          <View style={[styles.tipCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="bulb-outline" size={16} color={c.primary || "#6366f1"} />
            <Text style={[styles.tipText, { color: c.sub }]}>
              {status === "TOO_MUCH_PRESSURE"
                ? "Rest your finger gently — pressing hard blocks capillary blood flow."
                : status === "MOTION_ARTIFACT_DETECTED"
                ? "Keep completely still. Rest your elbow on a flat surface."
                : "Cover both the camera lens and flash LED with the pad of your finger."}
            </Text>
          </View>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: c.border }]} onPress={onCancel}>
              <Text style={[styles.cancelBtnText, { color: c.text }]}>Cancel</Text>
            </TouchableOpacity>
            {(status === "TOO_MUCH_PRESSURE" || status === "SIGNAL_LOW_QUALITY") && (
              <TouchableOpacity style={[styles.restartBtn, { backgroundColor: "#ef4444" }]} onPress={handleRestart}>
                <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.restartBtnText}>Restart</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 28,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  topZone: { alignItems: "center", marginTop: 8 },
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center", marginBottom: 6, letterSpacing: -0.4 },
  subtext: { fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 16 },
  centerZone: { alignItems: "center", justifyContent: "center", flex: 1 },
  ringsWrapper: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  pulseRing: {
    width: 172, height: 172, borderRadius: 86, borderWidth: 3,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  centeredState: { alignItems: "center", justifyContent: "center" },
  stateLabel: { color: "#ffffff", fontSize: 13, fontWeight: "600", marginTop: 8 },
  metricsInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  metricCol: { alignItems: "center", flex: 1 },
  metricBig: { color: "#ffffff", fontSize: 30, fontWeight: "bold", marginTop: 2, marginBottom: 1 },
  metricUnit: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "bold" },
  metricDivider: { width: 1, height: 48, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 4 },
  statusBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statusBannerText: { fontSize: 12, fontWeight: "600" },
  bottomZone: { width: "100%" },
  timerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 2 },
  timerText: { fontSize: 13, fontWeight: "bold" },
  confText: { fontSize: 12 },
  waveCard: {
    borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    marginBottom: 14, overflow: "hidden",
  },
  waveHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
  waveDot: { width: 7, height: 7, borderRadius: 4 },
  waveLabel: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  tipCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16,
  },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "bold" },
  restartBtn: { flex: 1, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  restartBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "bold" },
  completedCard: { width: "100%", borderRadius: 24, borderWidth: 1, padding: 24, elevation: 4 },
  completedHeader: { alignItems: "center", marginBottom: 16 },
  completedTitle: { fontSize: 22, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  completedSub: { fontSize: 13, textAlign: "center" },
  dividerH: { height: 1, width: "100%", marginVertical: 16 },
  resultsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 4 },
  resultCell: { alignItems: "center", flex: 1 },
  resultBig: { fontSize: 38, fontWeight: "bold" },
  resultUnit: { fontSize: 14, fontWeight: "600", marginTop: -2 },
  resultDesc: { fontSize: 11, marginTop: 2 },
  vertDivider: { width: 1, height: 72, marginHorizontal: 8 },
  metaGrid: { gap: 10, marginBottom: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaKey: { fontSize: 13 },
  metaVal: { fontSize: 13, fontWeight: "600" },
  saveBtn: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "bold" },
  // Debug Panel Styles
  debugOverlay: {
    position: "absolute",
    top: 100, bottom: 20, left: 16, right: 16,
    borderRadius: 24, borderWidth: 1, padding: 18,
    zIndex: 1000,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 12,
  },
  debugHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)",
    paddingBottom: 10, marginBottom: 12,
  },
  debugTitle: { fontSize: 15, fontWeight: "bold", marginLeft: 6, flex: 1 },
  debugCloseBtn: { padding: 4 },
  debugScroll: { flex: 1 },
  debugSection: { marginBottom: 16 },
  debugSectionTitle: { fontSize: 9, fontWeight: "bold", letterSpacing: 1, marginBottom: 6 },
  debugGrid: { flexDirection: "row", gap: 10 },
  debugCard: { flex: 1, padding: 10, borderRadius: 12 },
  debugCardLabel: { fontSize: 9, fontWeight: "600", marginBottom: 2 },
  debugCardValue: { fontSize: 14, fontWeight: "bold" },
  fftCardBg: { height: 100, borderRadius: 14, borderWidth: 1, padding: 10, justifyContent: "center", alignItems: "center" },
  noFftText: { fontSize: 12, fontStyle: "italic" },
  peaksContainer: { padding: 10, borderRadius: 12, borderWidth: 1 },
  peaksText: { fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
  calibCard: { padding: 12, borderRadius: 14, borderWidth: 1 },
  calibDesc: { fontSize: 11, lineHeight: 16, marginBottom: 10 },
  calibInputsRow: { flexDirection: "row", marginBottom: 12 },
  inputLabel: { fontSize: 9, fontWeight: "bold", marginBottom: 4 },
  calibInput: { height: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 13 },
  calibBtn: { height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  calibBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "bold" },
});
