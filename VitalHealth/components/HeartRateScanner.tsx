import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
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

interface ThemeColors {
  background: string;
  primary: string;
  surface: string;
  text: string;
  error: string;
  success: string;
}

interface Theme {
  colors: ThemeColors;
}

interface HeartRateScannerProps {
  theme?: Theme;
  uid?: string;
  onFinish?: (bpm: number, spo2: number, confidence: number, status: string, snr: number) => void;
  onCancel?: () => void;
}

export default function HeartRateScanner({
  theme: propTheme,
  uid = "self",
  onFinish,
  onCancel,
}: HeartRateScannerProps) {
  // Theme management integration
  const { theme: appThemeMode } = useTheme();
  const activeAppColors = colors[appThemeMode] || colors.dark;

  const activeTheme: Theme = propTheme || {
    colors: {
      background: activeAppColors.bg,
      primary: activeAppColors.primary,
      surface: activeAppColors.card,
      text: activeAppColors.text,
      error: activeAppColors.danger || "#ef4444",
      success: "#10b981",
    },
  };
  const themeColors = activeTheme.colors;

  // Local component states
  const [bpm, setBpm] = useState<number>(0);
  const [spo2, setSpo2] = useState<number>(98);
  const [confidence, setConfidence] = useState<number>(0);
  const [status, setStatus] = useState<string>("CALIBRATING");
  const [pulseWave, setPulseWave] = useState<number>(0);
  const [snr, setSnr] = useState<number>(-10.0);
  const [fingerDetected, setFingerDetected] = useState<boolean>(false);

  // Progress driven by native events (0–1)
  const [progressRatio, setProgressRatio] = useState<number>(0);

  // Waveform buffer
  const [waveHistory, setWaveHistory] = useState<number[]>(Array(60).fill(0));

  // Animated scale for the pulse ring
  const pulseScale = useRef(new Animated.Value(1)).current;

  // Track previous status to trigger haptics on change
  const prevStatusRef = useRef<string>("CALIBRATING");
  const isCompletedRef = useRef(false);

  // 1. Live Native Event Subscriptions
  useEffect(() => {
    isCompletedRef.current = false;
    startHeartRateMeasurement(uid);

    // 30 FPS Frame Listener for real-time waveform & contact state
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

    const unsubUpdate = onHeartRateUpdate((event) => {
      if (isCompletedRef.current) return;

      const nextBpm = event.bpm ?? 0;
      const nextSpo2 = event.spo2 ?? 0;
      const nextConfidence = event.confidence ?? 0;
      const nextStatus = event.status ?? "CALIBRATING";
      const nextPulseWave = event.pulseWave ?? 0;
      const nextSnr = event.snr ?? -10.0;
      const nextProgress = event.progress ?? 0;

      setBpm(nextBpm);
      setSpo2(nextSpo2);
      setConfidence(nextConfidence);
      setStatus(nextStatus);
      setPulseWave(nextPulseWave);
      setSnr(nextSnr);
      setProgressRatio(nextProgress);

      if (nextStatus !== prevStatusRef.current) {
        if (nextStatus === "TOO_MUCH_PRESSURE" || nextStatus === "MOTION_ARTIFACT_DETECTED") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (nextStatus === "MEASURING") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        prevStatusRef.current = nextStatus;
      }
    });

    // Native HeartRateDone drives completion — no JS timer needed
    const unsubDone = onHeartRateDone((event) => {
      if (isCompletedRef.current) return;
      isCompletedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (onFinish) onFinish(event.bpm, event.spo2, event.confidence, event.source, 0);
    });

    const unsubError = onHeartRateError(() => {
      if (isCompletedRef.current) return;
      isCompletedRef.current = true;
      if (onFinish) onFinish(bpm, spo2, confidence, status, snr);
    });

    return () => {
      unsubFrame();
      unsubUpdate();
      unsubDone();
      unsubError();
      stopHeartRateMeasurement();
    };
  }, [uid]);

  // Pulse animation driven by real-time pulseWave spikes
  useEffect(() => {
    if (fingerDetected && status === "MEASURING") {
      Animated.spring(pulseScale, {
        toValue: 1.0 + Math.max(-0.08, Math.min(0.2, pulseWave * 0.5)),
        useNativeDriver: true,
        friction: 3.5,
        tension: 50,
      }).start();
    } else {
      Animated.spring(pulseScale, {
        toValue: 1.0,
        useNativeDriver: true,
        friction: 6,
        tension: 30,
      }).start();
    }
  }, [pulseWave, fingerDetected, status]);

  // Status message text builder
  const getStatusText = (): { title: string; desc: string; color: string; badge: string } => {
    if (!fingerDetected) {
      return {
        title: "Place Index Finger",
        desc: "Cover the camera lens and flash LED completely with your finger.",
        color: themeColors.error,
        badge: "NO FINGER DETECTED",
      };
    }
    switch (status) {
      case "TOO_MUCH_PRESSURE":
        return {
          title: "Too Much Pressure",
          desc: "Press lighter on the lens. Hard pressure restricts blood flow.",
          color: themeColors.error,
          badge: "HIGH PRESSURE",
        };
      case "MOTION_ARTIFACT_DETECTED":
        return {
          title: "Motion Detected",
          desc: "Hold steady. Rest your elbow on a desk or leg to avoid movement.",
          color: "#f59e0b",
          badge: "HOLD STILL",
        };
      case "SIGNAL_LOW_QUALITY":
        return {
          title: "Low Signal Quality",
          desc: "Adjust position to completely cover the camera lens and flash.",
          color: "#f59e0b",
          badge: "WEAK SIGNAL",
        };
      case "MEASURING":
        return {
          title: "Measuring Pulse",
          desc: "Keep still and relax. Scanning cardiac capillary pulse...",
          color: themeColors.success,
          badge: "SCANNING ACTIVE",
        };
      case "CALIBRATING":
      default:
        return {
          title: "Finger Locked · Calibrating",
          desc: "Finger contact confirmed. Locking onto cardiac signal...",
          color: themeColors.primary,
          badge: "CALIBRATING",
        };
    }
  };

  const statusInfo = getStatusText();

  // Dynamic status ring color
  const getRingColor = (): string => {
    if (!fingerDetected) return themeColors.error;
    if (status === "TOO_MUCH_PRESSURE") return themeColors.error;
    if (status === "SIGNAL_LOW_QUALITY" || status === "MOTION_ARTIFACT_DETECTED") return "#f59e0b";
    if (status === "MEASURING") return themeColors.success;
    return themeColors.primary;
  };

  const ringColor = getRingColor();

  // Svg Waveform path construction
  const getWaveformPath = (): string => {
    const H = 60;
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

  const radius = 95;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - (fingerDetected ? progressRatio : 0));

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Top Header / Instructions */}
      <View style={styles.header}>
        <Text style={[styles.titleText, { color: statusInfo.color }]}>
          {statusInfo.title}
        </Text>
        <Text style={[styles.descText, { color: themeColors.text, opacity: 0.7 }]}>
          {statusInfo.desc}
        </Text>

        <View style={[styles.badgeContainer, { backgroundColor: statusInfo.color + "20" }]}>
          <View style={[styles.badgeDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.badgeText, { color: statusInfo.color }]}>
            {statusInfo.badge}
          </Text>
        </View>
      </View>

      {/* Main Center Rings & Preview */}
      <View style={styles.centerContainer}>
        {/* Progress SVG Outer Circle */}
        <Svg width={220} height={220} style={StyleSheet.absoluteFillObject}>
          <Circle
            cx={110}
            cy={110}
            r={radius}
            stroke={themeColors.surface}
            strokeWidth={4}
            fill="transparent"
          />
          <Circle
            cx={110}
            cy={110}
            r={radius}
            stroke={ringColor}
            strokeWidth={4}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 110 110)"
          />
        </Svg>

        {/* Pulse animated ring containing native camera preview */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: pulseScale }],
              borderColor: ringColor,
            },
          ]}
        >
          <CameraPreview style={StyleSheet.absoluteFillObject} />

          {/* Readability backdrop */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.4)" }]} />

          {!fingerDetected ? (
            <View style={styles.centeredState}>
              <Ionicons name="finger-print" size={48} color="#f87171" />
              <Text style={styles.stateLabelWarning}>Place Finger</Text>
            </View>
          ) : status === "CALIBRATING" || bpm === 0 ? (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={styles.stateLabel}>Calibrating...</Text>
            </View>
          ) : (
            <View style={styles.metricsInner}>
              <Ionicons name="heart" size={24} color="#ef476f" style={{ marginBottom: 2 }} />
              <Text style={styles.bpmNumber}>{Math.round(bpm)}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Bottom Waveform & Action Button */}
      <View style={styles.bottomContainer}>
        {/* Live 30 FPS Waveform SVG */}
        <View style={[styles.waveformCard, { backgroundColor: themeColors.surface, borderColor: themeColors.surface }]}>
          <View style={styles.waveformHeader}>
            <Ionicons name="pulse" size={14} color={ringColor} />
            <Text style={[styles.waveformTitle, { color: themeColors.text, opacity: 0.6 }]}>
              LIVE 30 FPS PPG WAVEFORM
            </Text>
          </View>
          <Svg width="100%" height={60}>
            <Defs>
              <LinearGradient id="scanWaveGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={ringColor} stopOpacity="0.35" />
                <Stop offset="100%" stopColor={ringColor} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            <Path
              d={getWaveformPath()}
              fill="none"
              stroke={ringColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={`${getWaveformPath()} L ${width - 96} 60 L 0 60 Z`}
              fill="url(#scanWaveGrad)"
            />
          </Svg>
        </View>

        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: themeColors.text + "30" }]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelText, { color: themeColors.text }]}>Cancel Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
  },
  header: {
    alignItems: "center",
  },
  titleText: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  descText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  pulseRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    alignItems: "center",
    justify: "center",
    overflow: "hidden",
  },
  centeredState: {
    alignItems: "center",
    justify: "center",
  },
  stateLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },
  stateLabelWarning: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 4,
  },
  metricsInner: {
    alignItems: "center",
  },
  bpmNumber: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "bold",
    letterSpacing: -1,
  },
  bpmLabel: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: -2,
  },
  bottomContainer: {
    width: "100%",
  },
  waveformCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    marginBottom: 16,
    overflow: "hidden",
  },
  waveformHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  waveformTitle: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  cancelButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justify: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
