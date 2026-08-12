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
  onHeartRateFrame,
  onHeartRateUpdate,
  onHeartRateDone,
  onHeartRateError,
  type HeartRateFrameEvent,
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
  const [fingerDetected, setFingerDetected] = useState(false);
  const [waveHistory, setWaveHistory] = useState<number[]>(Array(60).fill(0));

  // Animations
  const pulseScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const skeletonPulse = useRef(new Animated.Value(0.4)).current;
  const resultsFadeAnim = useRef(new Animated.Value(0)).current;

  const prevStatusRef = useRef<OperationalStatus>("CALIBRATING");
  const isCompletedRef = useRef(false);
  const finalValuesRef = useRef({ bpm: 0, spo2: 0, confidence: 0, snr: -10 });

  // Skeleton shimmer during calibration
  useEffect(() => {
    if (status === "CALIBRATING") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonPulse, { toValue: 1.0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(skeletonPulse, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      skeletonPulse.setValue(1.0);
    }
  }, [status]);

  // Glow ring pulse animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.8, duration: 600, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.2, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

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
    const startTimer = setTimeout(() => {
      startHeartRateMeasurement(uid);
    }, 600);

    // 1. High-frequency 30 FPS Frame Listener for real-time waveform & finger contact
    const unsubFrame = onHeartRateFrame((event: HeartRateFrameEvent) => {
      if (isCompletedRef.current) return;
      setFingerDetected(event.fingerDetected);

      const val =
        event.pulseWave !== undefined && Math.abs(event.pulseWave) > 1e-6
          ? event.pulseWave
          : (event.ppgValue - 128) / 128;

      setWaveHistory((prev) => {
        const next = [...prev.slice(1)];
        next.push(val);
        return next;
      });
    });

    // 2. Periodic Live update events (Biometrics & Status)
    const unsubUpdate = onHeartRateUpdate((event) => {
      if (isCompletedRef.current) return;

      const rawStatus = event.status ?? "CALIBRATING";
      let nextStatus: OperationalStatus = "MEASURING";
      if (rawStatus === "CALIBRATING") nextStatus = "CALIBRATING";
      else if (rawStatus === "TOO_MUCH_PRESSURE") nextStatus = "TOO_MUCH_PRESSURE";
      else if (rawStatus === "MOTION_ARTIFACT_DETECTED") nextStatus = "MOTION_ARTIFACT_DETECTED";
      else if (rawStatus === "SIGNAL_LOW_QUALITY" || rawStatus === "LOW_SIGNAL_QUALITY") nextStatus = "SIGNAL_LOW_QUALITY";

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
        finalValuesRef.current = { bpm: nextBpm, spo2: nextSpo2 > 0 ? nextSpo2 : (finalValuesRef.current.spo2 || 0), confidence: nextConf, snr: nextSnr };
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
    });

    // 3. Done event — native module finished 30-second window
    const unsubDone = onHeartRateDone((event) => {
      handleComplete(
        event.bpm ?? 0,
        event.spo2 ?? 0,
        event.confidence ?? 0,
        event.snr ?? 0
      );
    });

    // 4. Error event
    const unsubError = onHeartRateError(() => {
      if (!isCompletedRef.current) {
        const fv = finalValuesRef.current;
        handleComplete(fv.bpm, fv.spo2, fv.confidence, fv.snr);
      }
    });

    return () => {
      clearTimeout(startTimer);
      unsubFrame();
      unsubUpdate();
      unsubDone();
      unsubError();
      stopHeartRateMeasurement();
    };
  }, [uid]);

  // Pulse ring spring animation driven by real-time pulse wave spikes
  useEffect(() => {
    if (fingerDetected && status !== "COMPLETED") {
      Animated.spring(pulseScale, {
        toValue: 1.0 + Math.max(-0.08, Math.min(0.2, pulseWave * 0.5)),
        useNativeDriver: true,
        friction: 3.5,
        tension: 50,
      }).start();
    } else {
      Animated.spring(pulseScale, { toValue: 1.0, useNativeDriver: true, friction: 6, tension: 30 }).start();
    }
  }, [pulseWave, fingerDetected, status]);

  const handleRestart = () => {
    isCompletedRef.current = false;
    finalValuesRef.current = { bpm: 0, spo2: 0, confidence: 0, snr: -10 };
    setProgressSecs(0);
    setBpm(0);
    setSpo2(0);
    setConfidence(0);
    setSnr(-10);
    setWaveHistory(Array(60).fill(0));
    setFingerDetected(false);
    setStatus("CALIBRATING");
    prevStatusRef.current = "CALIBRATING";
    resultsFadeAnim.setValue(0);
    stopHeartRateMeasurement();
    setTimeout(() => startHeartRateMeasurement(uid), 600);
  };

  // Guidance Details Header
  const getHeaderInfo = () => {
    if (!fingerDetected && status !== "COMPLETED") {
      return {
        title: "Place Index Finger",
        sub: "Cover both the camera lens and flashlight LED completely.",
        color: "#f59e0b",
        badgeText: "NO FINGER CONTACT DETECTED",
        badgeColor: "#ef4444",
        badgeBg: "rgba(239, 68, 68, 0.15)",
        icon: "finger-print-outline" as const,
      };
    }
    if (status === "TOO_MUCH_PRESSURE") {
      return {
        title: "Pressing Too Hard",
        sub: "Lighten your touch — pressing hard restricts blood flow in capillaries.",
        color: "#ef4444",
        badgeText: "RESTRICTED BLOOD FLOW",
        badgeColor: "#ef4444",
        badgeBg: "rgba(239, 68, 68, 0.15)",
        icon: "hand-left-outline" as const,
      };
    }
    if (status === "MOTION_ARTIFACT_DETECTED") {
      return {
        title: "Movement Detected",
        sub: "Hold completely still. Rest your elbow on a flat surface.",
        color: "#f59e0b",
        badgeText: "HOLD STILL · MOTION DETECTED",
        badgeColor: "#f59e0b",
        badgeBg: "rgba(245, 158, 11, 0.15)",
        icon: "walk-outline" as const,
      };
    }
    if (status === "SIGNAL_LOW_QUALITY") {
      return {
        title: "Adjust Contact",
        sub: "Cover the full camera lens and flash LED completely.",
        color: "#f59e0b",
        badgeText: "SIGNAL QUALITY WEAK",
        badgeColor: "#f59e0b",
        badgeBg: "rgba(245, 158, 11, 0.15)",
        icon: "warning-outline" as const,
      };
    }
    if (status === "CALIBRATING") {
      return {
        title: "Finger Contact Locked",
        sub: "Calibrating transillumination & locking pulse wave...",
        color: c.text,
        badgeText: "FINGER LOCKED · CALIBRATING",
        badgeColor: "#3b82f6",
        badgeBg: "rgba(59, 130, 246, 0.15)",
        icon: "pulse-outline" as const,
      };
    }
    if (status === "MEASURING") {
      return {
        title: "Keep Steady",
        sub: "Recording real-time cardiac pulse waveform...",
        color: c.text,
        badgeText: "FINGER LOCKED · SCANNING",
        badgeColor: "#10b981",
        badgeBg: "rgba(16, 185, 129, 0.15)",
        icon: "heart-outline" as const,
      };
    }
    return {
      title: "Scan Complete",
      sub: "Biometrics successfully collected.",
      color: "#10b981",
      badgeText: "COMPLETED",
      badgeColor: "#10b981",
      badgeBg: "rgba(16, 185, 129, 0.15)",
      icon: "checkmark-circle-outline" as const,
    };
  };

  const hdr = getHeaderInfo();

  const ringBorderColor =
    !fingerDetected ? "#ef4444"
    : status === "TOO_MUCH_PRESSURE" ? "#ef4444"
    : status === "SIGNAL_LOW_QUALITY" ? "#f59e0b"
    : status === "MOTION_ARTIFACT_DETECTED" ? "#f59e0b"
    : status === "MEASURING" ? "#10b981"
    : "#3b82f6";

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
        const y = H - (norm * (H - 16) + 8);
        return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // Leading edge dot on live SVG waveform
  const lastWaveVal = waveHistory[waveHistory.length - 1] ?? 0;
  const minW = Math.min(...waveHistory);
  const maxW = Math.max(...waveHistory);
  const rangeW = maxW - minW;
  const normLast = rangeW > 1e-5 ? (lastWaveVal - minW) / rangeW : 0.5;
  const dotX = width - 96;
  const dotY = 64 - (normLast * (64 - 16) + 8);

  const secondsRemaining = Math.max(0, TOTAL_SECS - Math.floor(progressSecs));
  const progressRatio = Math.min(1, progressSecs / TOTAL_SECS);
  const circumference = 2 * Math.PI * 95;

  const isActive = fingerDetected && status !== "COMPLETED";

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>

      {/* Header Guidance */}
      <View style={styles.topZone}>
        <Text style={[styles.title, { color: hdr.color }]}>{hdr.title}</Text>
        <Text style={[styles.subtext, { color: c.sub || "rgba(255,255,255,0.6)" }]}>{hdr.sub}</Text>
        
        {/* Dynamic Contact & Status Banner */}
        <View style={[styles.statusBadgeBanner, { backgroundColor: hdr.badgeBg }]}>
          <Ionicons name={hdr.icon} size={14} color={hdr.badgeColor} />
          <Text style={[styles.statusBadgeText, { color: hdr.badgeColor }]}>{hdr.badgeText}</Text>
        </View>
      </View>

      {/* Center Zone (Pulse Rings & Live Camera) */}
      <View style={styles.centerZone}>
        {status !== "COMPLETED" && (
          <View style={styles.ringsWrapper}>
            {/* Progress Outer Ring */}
            <Svg width={220} height={220} style={StyleSheet.absoluteFillObject}>
              <Circle cx={110} cy={110} r={95} stroke={c.border || "rgba(255,255,255,0.12)"} strokeWidth={4} fill="transparent" />
              <Circle
                cx={110} cy={110} r={95}
                stroke={fingerDetected ? (status === "MEASURING" ? "#10b981" : "#3b82f6") : "#ef4444"}
                strokeWidth={5}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - (fingerDetected ? progressRatio : 0))}
                strokeLinecap="round"
                transform="rotate(-90 110 110)"
              />
            </Svg>

            {/* Glowing Pulse Ring with live camera preview */}
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], borderColor: ringBorderColor }]}>
              <CameraPreview style={StyleSheet.absoluteFillObject} />

              {/* Translucent overlay backdrop */}
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.4)" }]} />

              {!fingerDetected ? (
                /* Contact Warning State */
                <View style={styles.centeredState}>
                  <Ionicons name="finger-print" size={50} color="#f87171" style={{ marginBottom: 6 }} />
                  <Text style={styles.stateLabelWarning}>Place Finger</Text>
                  <Text style={styles.stateSubWarning}>Cover camera & torch</Text>
                </View>
              ) : status === "CALIBRATING" || bpm === 0 ? (
                /* Calibrating / Signal Locking State */
                <View style={styles.centeredState}>
                  <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 8 }} />
                  <Text style={styles.stateLabel}>Locking Signal...</Text>
                  <Text style={styles.stateSub}>Hold steady</Text>
                </View>
              ) : (
                /* Live Heart Rate Metric Display */
                <View style={styles.metricsInner}>
                  <View style={styles.metricCol}>
                    <Ionicons name="heart" size={26} color="#ef476f" style={{ marginBottom: 2 }} />
                    <Animated.Text style={[styles.metricBig, { opacity: skeletonPulse }]}>
                      {Math.round(bpm)}
                    </Animated.Text>
                    <Text style={styles.metricUnit}>BPM</Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </View>
        )}

        {/* Completed Results Display */}
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
                <Text style={[styles.metaKey, { color: c.sub }]}>Signal Confidence</Text>
                <Text style={[styles.metaVal, { color: confidence >= 60 ? "#10b981" : "#f59e0b" }]}>{Math.round(confidence)}%</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaKey, { color: c.sub }]}>SNR (Signal-to-Noise)</Text>
                <Text style={[styles.metaVal, { color: snr >= 2.5 ? "#10b981" : "#f59e0b" }]}>{snr.toFixed(1)} dB</Text>
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
      </View>

      {/* Bottom Zone: Live 30 FPS PPG Signal Graph & Telemetry */}
      {status !== "COMPLETED" && (
        <View style={styles.bottomZone}>
          {/* Timer and Telemetry Row */}
          <View style={styles.timerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={[styles.liveIndicatorDot, { backgroundColor: fingerDetected ? "#10b981" : "#ef4444" }]} />
              <Text style={[styles.timerText, { color: c.text }]}>
                {fingerDetected ? `${secondsRemaining}s remaining` : "Waiting for contact..."}
              </Text>
            </View>
            <Text style={[styles.confText, { color: c.sub }]}>
              {fingerDetected ? `Confidence: ${Math.round(confidence)}%` : "Lens uncovered"}
            </Text>
          </View>

          {/* Live 30 FPS PPG Waveform Card */}
          <View style={[styles.waveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.waveHeader}>
              <View style={[styles.waveDot, { backgroundColor: fingerDetected ? "#10b981" : "#ef4444" }]} />
              <Text style={[styles.waveLabel, { color: c.sub }]}>LIVE 30 FPS PPG SIGNAL WAVEFORM</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 10, color: c.sub, fontWeight: "bold" }}>
                {fingerDetected ? "30 Hz" : "SEARCHING"}
              </Text>
            </View>

            <Svg width="100%" height={64}>
              <Defs>
                <LinearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={fingerDetected ? (c.primary || "#6366f1") : "#ef4444"} stopOpacity="0.35" />
                  <Stop offset="100%" stopColor={fingerDetected ? (c.primary || "#6366f1") : "#ef4444"} stopOpacity="0.0" />
                </LinearGradient>
              </Defs>
              <Path
                d={getWaveformPath()}
                fill="none"
                stroke={fingerDetected ? (c.primary || "#6366f1") : "#ef4444"}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Path
                d={`${getWaveformPath()} L ${width - 96} 64 L 0 64 Z`}
                fill="url(#wg)"
              />
              {/* Real-time Leading Edge Dot */}
              {fingerDetected && (
                <Circle cx={dotX} cy={dotY} r={4} fill={c.primary || "#6366f1"} />
              )}
            </Svg>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: c.border }]} onPress={onCancel}>
              <Text style={[styles.cancelBtnText, { color: c.text }]}>Cancel Scan</Text>
            </TouchableOpacity>
            {(!fingerDetected || status === "TOO_MUCH_PRESSURE" || status === "SIGNAL_LOW_QUALITY") && (
              <TouchableOpacity style={[styles.restartBtn, { backgroundColor: c.primary || "#6366f1" }]} onPress={handleRestart}>
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
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 44 : 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  topZone: { alignItems: "center", marginTop: 4 },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 4, letterSpacing: -0.3 },
  subtext: { fontSize: 13, textAlign: "center", lineHeight: 18, paddingHorizontal: 12, marginBottom: 10 },
  statusBadgeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "bold", letterSpacing: 0.5 },
  centerZone: { alignItems: "center", justifyContent: "center", flex: 1 },
  ringsWrapper: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  pulseRing: {
    width: 172, height: 172, borderRadius: 86, borderWidth: 3.5,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  centeredState: { alignItems: "center", justifyContent: "center" },
  stateLabel: { color: "#ffffff", fontSize: 13, fontWeight: "bold", marginTop: 4 },
  stateSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 2 },
  stateLabelWarning: { color: "#f87171", fontSize: 13, fontWeight: "bold" },
  stateSubWarning: { color: "rgba(255,255,255,0.8)", fontSize: 10, marginTop: 2 },
  metricsInner: { alignItems: "center", justifyContent: "center" },
  metricCol: { alignItems: "center" },
  metricBig: { color: "#ffffff", fontSize: 44, fontWeight: "bold", letterSpacing: -1 },
  metricUnit: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "bold", marginTop: -4 },
  bottomZone: { width: "100%" },
  timerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingHorizontal: 2 },
  liveIndicatorDot: { width: 8, height: 8, borderRadius: 4 },
  timerText: { fontSize: 13, fontWeight: "bold" },
  confText: { fontSize: 12 },
  waveCard: {
    borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
    marginBottom: 14, overflow: "hidden",
  },
  waveHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
  waveDot: { width: 7, height: 7, borderRadius: 4 },
  waveLabel: { fontSize: 10, fontWeight: "bold", letterSpacing: 0.8 },
  actionRow: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 15, fontWeight: "bold" },
  restartBtn: { flex: 1, height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
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
  metaGrid: { gap: 10, marginBottom: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaKey: { fontSize: 13 },
  metaVal: { fontSize: 13, fontWeight: "600" },
  saveBtn: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "bold" },
});
