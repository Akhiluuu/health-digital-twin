import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
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

  // Progress driven by native events (0–1)
  const [progressRatio, setProgressRatio] = useState<number>(0);

  // Waveform buffer
  const [waveHistory, setWaveHistory] = useState<number[]>(Array(60).fill(0));

  // Animated scale for the pulse ring
  const pulseScale = useRef(new Animated.Value(1)).current;

  // Track previous status to trigger haptics on change
  const prevStatusRef = useRef<string>("CALIBRATING");
  const isCompletedRef = useRef(false);

  // 1. Live Native Event Subscription
  useEffect(() => {
    isCompletedRef.current = false;
    startHeartRateMeasurement(uid);

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

      setWaveHistory((prev) => {
        const next = [...prev.slice(1)];
        next.push(nextPulseWave);
        return next;
      });
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
      // Surface the best values collected so far
      if (onFinish) onFinish(bpm, spo2, confidence, status, snr);
    });

    return () => {
      unsubUpdate();
      unsubDone();
      unsubError();
      stopHeartRateMeasurement();
    };
  }, [uid]);

  // 2. High-Performance Animations: Pulse Ring scale logic
  useEffect(() => {
    Animated.spring(pulseScale, {
      toValue: 1.0 + Math.max(-0.15, Math.min(0.25, pulseWave * 0.6)),
      useNativeDriver: true,
      friction: 4,
      tension: 45,
    }).start();
  }, [pulseWave]);

  // 4. Dynamic UX Text & State Logic
  const getHeaderDetails = () => {
    if (status === "TOO_MUCH_PRESSURE") {
      return {
        title: "Pressing Too Hard",
        subtext: "Lighten your touch. Rest your finger gently over the camera lens.",
        color: themeColors.error,
      };
    }
    if (status === "MEASURING") {
      return {
        title: "Keep steady",
        subtext: "Scanning your cardiac pulse wave...",
        color: themeColors.text,
      };
    }
    return {
      title: "Calibrating...",
      subtext: "Analyzing skin tone and contact patch...",
      color: themeColors.text,
    };
  };

  const header = getHeaderDetails();

  // 5. Smooth Line Waveform Path Generation
  const getWaveformPath = (): string => {
    const H = 80;
    const W = width - 48;
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

  const secondsRemaining = Math.max(0, Math.round(30 * (1 - progressRatio)));

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* ZONE 1: Top (Guidance Header) */}
      <View style={styles.topZone}>
        <Text style={[styles.title, { color: header.color }]}>
          {header.title}
        </Text>
        <Text style={[styles.subtext, { color: themeColors.text, opacity: 0.7 }]}>
          {header.subtext}
        </Text>
      </View>

      {/* ZONE 2: Center (Animate Pulse Ring & Core BPM/SpO2 Values with Progress Ring) */}
      <View style={styles.centerZone}>
        <View style={styles.ringsWrapper}>
          {/* Progress Ring wrapping the centerpiece */}
          <Svg width={220} height={220} style={StyleSheet.absoluteFillObject}>
            <Circle
              cx={110}
              cy={110}
              r={95}
              stroke={themeColors.surface}
              strokeWidth={5}
              fill="transparent"
              opacity={0.2}
            />
            <Circle
              cx={110}
              cy={110}
              r={95}
              stroke={themeColors.primary}
              strokeWidth={5}
              fill="transparent"
              strokeDasharray={2 * Math.PI * 95}
              strokeDashoffset={2 * Math.PI * 95 * (1 - progressRatio)}
              strokeLinecap="round"
              transform="rotate(-90 110 110)"
            />
          </Svg>

          {/* Scale Animated Pulse Ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                backgroundColor: themeColors.surface,
                borderColor: status === "TOO_MUCH_PRESSURE" ? themeColors.error : themeColors.primary,
              },
            ]}
          >
            <CameraPreview style={StyleSheet.absoluteFillObject} />
            <View style={styles.cameraOverlay} />

            <View style={styles.bpmDisplayContainer}>
              <View style={styles.metricsCenterRow}>
                {/* Heart Rate Column */}
                <View style={styles.metricCenterItem}>
                  <Ionicons
                    name="heart"
                    size={24}
                    color={status === "TOO_MUCH_PRESSURE" ? themeColors.error : themeColors.primary}
                    style={styles.heartIcon}
                  />
                  <Text style={[styles.bpmText, { color: "#ffffff" }]}>
                      {bpm > 0 ? Math.round(bpm) : "--"}
                    </Text>
                  <Text style={[styles.bpmLabel, { color: "rgba(255,255,255,0.7)" }]}>
                    BPM
                  </Text>
                </View>

                {/* Vertical Divider */}
                <View style={styles.dividerVertical} />

                {/* SpO2 Column */}
                <View style={styles.metricCenterItem}>
                  <Ionicons
                    name="water"
                    size={24}
                    color="#06b6d4"
                    style={styles.heartIcon}
                  />
                  <Text style={[styles.bpmText, { color: "#ffffff" }]}>
                      {spo2 > 0 ? Math.round(spo2) : "--"}
                    </Text>
                  <Text style={[styles.bpmLabel, { color: "rgba(255,255,255,0.7)" }]}>
                    % SpO₂
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Quality indicator / Status message in Center */}
        {status === "MOTION_ARTIFACT_DETECTED" && (
          <View style={[styles.statusBanner, { backgroundColor: themeColors.error + "20" }]}>
            <Ionicons name="walk" size={16} color={themeColors.error} />
            <Text style={[styles.statusBannerText, { color: themeColors.error }]}>
              Hold still · Motion detected
            </Text>
          </View>
        )}
      </View>

      {/* ZONE 3: Bottom (Real-time wave graph and progress indicator) */}
      <View style={styles.bottomZone}>
        <View style={styles.countdownContainer}>
          <Text style={[styles.countdownLabel, { color: themeColors.text }]}>
            {secondsRemaining}s remaining
          </Text>
          <Text style={[styles.confidenceLabel, { color: themeColors.text, opacity: 0.6 }]}>
            Confidence: {status === "CALIBRATING" ? "Scanning" : `${confidence}%`}
          </Text>
        </View>

        {/* Live Waveform Graph */}
        <View style={[styles.waveformCard, { backgroundColor: themeColors.surface, borderColor: themeColors.primary + "30" }]}>
          <Svg width="100%" height={80}>
            <Defs>
              <LinearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={themeColors.primary} stopOpacity="0.3" />
                <Stop offset="100%" stopColor={themeColors.primary} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            <Path
              d={getWaveformPath()}
              fill="none"
              stroke={themeColors.primary}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Filled area underneath path */}
            <Path
              d={`${getWaveformPath()} L ${width - 48} 80 L 0 80 Z`}
              fill="url(#waveGrad)"
            />
          </Svg>
        </View>

        {/* Action Controls */}
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: themeColors.primary + "50" }]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, { color: themeColors.text }]}>
            Cancel Scan
          </Text>
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
    paddingTop: Platform.OS === "ios" ? 40 : 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },
  topZone: {
    alignItems: "center",
    marginTop: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  centerZone: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  ringsWrapper: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  bpmDisplayContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  metricsCenterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 8,
  },
  metricCenterItem: {
    alignItems: "center",
    flex: 1,
  },
  dividerVertical: {
    width: 1,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginHorizontal: 2,
  },
  heartIcon: {
    marginBottom: 4,
  },
  bpmText: {
    fontSize: 32,
    fontWeight: "bold",
  },
  bpmLabel: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginTop: 24,
    gap: 6,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: "600",
  },
  bottomZone: {
    width: "100%",
    marginBottom: 10,
  },
  countdownContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  countdownLabel: {
    fontSize: 14,
    fontWeight: "bold",
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  waveformCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    height: 104,
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 20,
  },
  cancelButton: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
