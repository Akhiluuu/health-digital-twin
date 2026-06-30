// app/brain/ContinuousPerformanceTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Psychomotor Vigilance Test (PVT)
// Cognitive Domain: Vigilant Attention / Visual Response Speed
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Animated,
  Vibration,
} from "react-native";
import Svg, { Circle, G, Line } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const ROUNDS = 10;
const MIN_WAIT_MS = 2000;
const MAX_WAIT_MS = 5000;
const LAPSE_THRESHOLD_MS = 355;

type Phase = "instructions" | "waiting" | "active" | "falsestart" | "showing_result" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function PsychomotorVigilanceTest({ onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#ef4444",
    success: "#10b981",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [round, setRound] = useState(0);
  const [timerMs, setTimerMs] = useState(0);
  const [lapses, setLapses] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);

  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation during the focus/waiting phase
  useEffect(() => {
    if (phase !== "waiting") return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [phase]);

  const startNextRound = useCallback((r: number) => {
    if (r >= ROUNDS) {
      setPhase("done");
      return;
    }

    setRound(r);
    setTimerMs(0);
    setPhase("waiting");

    const delay = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
    waitTimeoutRef.current = setTimeout(() => {
      setPhase("active");
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setTimerMs(Date.now() - startTimeRef.current);
      }, 9); // High frequency polling for accurate millisecond display
    }, delay);
  }, []);

  const handleTap = () => {
    if (phase === "waiting") {
      // False start (early tap)
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
      setPhase("falsestart");
      setFalseStarts((f) => f + 1);
      try {
        Vibration.vibrate([0, 80, 40, 80]);
      } catch (_) {}

      setTimeout(() => {
        startNextRound(round);
      }, 1200);
      return;
    }

    if (phase !== "active") return;

    // Successful reaction tap
    if (intervalRef.current) clearInterval(intervalRef.current);
    const reaction = Date.now() - startTimeRef.current;
    setTimerMs(reaction);

    const isLapse = reaction > LAPSE_THRESHOLD_MS;
    if (isLapse) {
      setLapses((l) => l + 1);
      try {
        Vibration.vibrate([0, 120]);
      } catch (_) {}
    } else {
      try {
        Vibration.vibrate(10);
      } catch (_) {}
    }

    const nextTimes = [...reactionTimes, reaction];
    setReactionTimes(nextTimes);
    setPhase("showing_result");

    setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= ROUNDS) {
        setPhase("done");
        const avg = nextTimes.reduce((a, b) => a + b, 0) / nextTimes.length;
        // Standard clinical scoring penalizing slow reaction times and early taps
        const baseScore = Math.max(10, Math.round(Math.min(100, 100 - (avg - 230) / 6)));
        const finalScore = Math.max(10, baseScore - lapses * 8 - falseStarts * 5);
        const accuracy = Math.max(0, 1 - lapses / ROUNDS);

        onDone({
          game: "cpt",
          score: finalScore,
          rawScore: Math.round(avg),
          accuracy,
          avgTimeMs: avg,
          label: "Psychomotor Vigilance",
        });
      } else {
        startNextRound(nextRound);
      }
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
    };
  }, []);

  const renderFocusCircle = () => {
    return (
      <Svg width={120} height={120} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={44} fill="none" stroke={colors.border} strokeWidth={2.5} />
        <Circle cx={50} cy={50} r={30} fill="none" stroke={colors.accent} strokeWidth={1.5} strokeDasharray={[6, 4]} />
        <Circle cx={50} cy={50} r={6} fill={colors.accent} />
        {/* Reticle marks */}
        <Line x1={50} y1={2} x2={50} y2={12} stroke={colors.accent} strokeWidth={2} />
        <Line x1={50} y1={88} x2={50} y2={98} stroke={colors.accent} strokeWidth={2} />
        <Line x1={2} y1={50} x2={12} y2={50} stroke={colors.accent} strokeWidth={2} />
        <Line x1={88} y1={50} x2={98} y2={50} stroke={colors.accent} strokeWidth={2} />
      </Svg>
    );
  };

  const isLapse = phase === "showing_result" && timerMs > LAPSE_THRESHOLD_MS;

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.container, { backgroundColor: colors.background }]}
      onPress={handleTap}
    >
      <Text style={styles.gameTitle}>PSYCHOMOTOR VIGILANCE TEST (PVT)</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Round {round + 1} of {ROUNDS}
      </Text>

      {/* LED Display Screen */}
      <View
        style={[
          styles.targetScreen,
          {
            backgroundColor: isDark ? "#090d16" : "#f1f5f9",
            borderColor: phase === "active" ? colors.accent : colors.border,
          },
        ]}
      >
        {phase === "waiting" && (
          <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
            {renderFocusCircle()}
            <Text style={[styles.promptText, { color: colors.subText, marginTop: 12 }]}>FOCUS ON CENTER</Text>
          </Animated.View>
        )}

        {phase === "active" && (
          <Text style={[styles.timerText, { color: colors.accent }]}>
            {timerMs} ms
          </Text>
        )}

        {phase === "falsestart" && (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.accent }]}>⚠️ EARLY TAP</Text>
            <Text style={[styles.statusSubText, { color: colors.subText }]}>Wait for the timer to start</Text>
          </View>
        )}

        {phase === "showing_result" && (
          <View style={styles.center}>
            <Text style={[styles.timerText, { color: isLapse ? colors.accent : colors.success }]}>
              {timerMs} ms
            </Text>
            <Text style={[styles.statusSubText, { color: isLapse ? colors.accent : colors.success }]}>
              {isLapse ? "Attention Lapse (>355ms)" : "Good Reaction Speed"}
            </Text>
          </View>
        )}
      </View>

      {/* Lapses HUD */}
      <View style={styles.hudRow}>
        <View style={styles.hudBox}>
          <Text style={[styles.hudVal, { color: colors.accent }]}>{lapses}</Text>
          <Text style={[styles.hudLabel, { color: colors.subText }]}>Lapses</Text>
        </View>
        <View style={styles.hudBox}>
          <Text style={[styles.hudVal, { color: colors.text }]}>{falseStarts}</Text>
          <Text style={[styles.hudLabel, { color: colors.subText }]}>Early Taps</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  gameTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    color: "#ef4444",
    marginTop: 60,
    marginBottom: 10,
    textAlign: "center",
  },
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 30,
  },
  targetScreen: {
    width: W - 48,
    height: 240,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  promptText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  timerText: {
    fontSize: 48,
    fontWeight: "900",
    fontFamily: "monospace",
  },
  errorText: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statusSubText: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
    textAlign: "center",
  },
  center: {
    alignItems: "center",
  },
  hudRow: {
    flexDirection: "row",
    gap: 60,
    marginBottom: 30,
  },
  hudBox: {
    alignItems: "center",
  },
  hudVal: {
    fontSize: 32,
    fontWeight: "900",
  },
  hudLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
    width: "100%",
    marginTop: 60,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardHeading: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 16,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 32,
  },
  btn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
