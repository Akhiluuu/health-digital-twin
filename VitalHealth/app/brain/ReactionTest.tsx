// app/brain/ReactionTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Motor Praxis Task (MP)
// Cognitive Domain: Processing Speed / Sensorimotor Speed
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
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

const { width: W, height: H } = Dimensions.get("window");
const ROUNDS = 10;

type Phase = "instructions" | "playing" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function MotorPraxisTest({ onDone }: Props) {
  useStackBackHandler();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#6366f1",
    targetOuter: "#ef4444",
    targetInner: "#ffffff",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [round, setRound] = useState(0);
  const [targetPos, setTargetPos] = useState({ x: W / 2 - 40, y: H / 3 });
  const [targetSize, setTargetSize] = useState(90);
  const [clickTimes, setClickTimes] = useState<number[]>([]);

  const clickStartRef = useRef<number>(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the active target
  useEffect(() => {
    if (phase !== "playing") return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [phase, round]);

  const startNextRound = useCallback((r: number) => {
    if (r >= ROUNDS) {
      setPhase("done");
      return;
    }

    setRound(r);

    // Calculate new target size: starts at 90 and decreases progressively
    // 90, 82, 74, 66, 58, 50, 42, 34, 26, 18
    const newSize = Math.max(18, 90 - r * 8);
    setTargetSize(newSize);

    // Precise safe-area boundaries to keep target accessible and within container limits
    const padding = 50;
    const minX = padding;
    const maxX = W - newSize - padding;
    const minY = 180;
    const maxY = H - newSize - 200;

    const newX = minX + Math.random() * (maxX - minX);
    const newY = minY + Math.random() * (maxY - minY);

    setTargetPos({ x: newX, y: newY });

    // Spring entry animation
    scaleAnim.setValue(0.2);
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 180,
      friction: 7,
      useNativeDriver: true,
    }).start();

    clickStartRef.current = Date.now();
  }, [scaleAnim]);

  const handleTargetClick = () => {
    const elapsed = Date.now() - clickStartRef.current;
    try {
      Vibration.vibrate(10);
    } catch (_) {}

    const nextTimes = [...clickTimes, elapsed];
    setClickTimes(nextTimes);

    const nextRound = round + 1;
    if (nextRound >= ROUNDS) {
      const avg = nextTimes.reduce((a, b) => a + b, 0) / nextTimes.length;
      // Clinical sensorimotor speed scoring: elite is < 280ms, scaling down to 10
      const score = Math.max(10, Math.round(Math.min(100, 100 - (avg - 260) / 10)));

      setTimeout(() => {
        onDone({
          game: "reaction",
          score,
          rawScore: Math.round(avg),
          accuracy: 1.0,
          avgTimeMs: avg,
          label: "Motor Praxis Task",
        });
      }, 500);
      setPhase("done");
    } else {
      startNextRound(nextRound);
    }
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>MOTOR PRAXIS TASK (MP)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Sensorimotor Speed</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            This task measures basic motor speed and coordination.{"\n"}{"\n"}
            A target bullseye will appear in random locations on the screen. Tap it as fast as you can.{"\n"}{"\n"}
            With each click, the target will become <Text style={{ color: colors.accent, fontWeight: "900" }}>smaller and harder to track</Text>. Maintain maximum focus!
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setPhase("playing");
              startNextRound(0);
            }}
          >
            <Text style={styles.btnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calculate stats for HUD
  const avgSoFar = clickTimes.length
    ? Math.round(clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sleek top HUD */}
      <View style={[styles.hudHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.hudStat}>
          <Text style={[styles.hudLabel, { color: colors.subText }]}>ROUND</Text>
          <Text style={[styles.hudVal, { color: colors.text }]}>{round + 1} / {ROUNDS}</Text>
        </View>
        <View style={styles.hudStat}>
          <Text style={[styles.hudLabel, { color: colors.subText }]}>SIZE</Text>
          <Text style={[styles.hudVal, { color: colors.accent }]}>{Math.round(targetSize)}px</Text>
        </View>
        <View style={styles.hudStat}>
          <Text style={[styles.hudLabel, { color: colors.subText }]}>AVG TIME</Text>
          <Text style={[styles.hudVal, { color: colors.text }]}>{avgSoFar || "—"} ms</Text>
        </View>
      </View>

      {/* Target Render Area */}
      {phase === "playing" && (
        <Animated.View
          style={[
            styles.targetWrapper,
            {
              transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
              left: targetPos.x,
              top: targetPos.y,
              width: targetSize,
              height: targetSize,
            },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={handleTargetClick}
            activeOpacity={0.6}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              {/* Outer circle */}
              <Circle cx="50" cy="50" r="45" fill={colors.targetOuter} />
              {/* Middle white ring */}
              <Circle cx="50" cy="50" r="30" fill={colors.targetInner} />
              {/* Inner red bullseye */}
              <Circle cx="50" cy="50" r="15" fill={colors.targetOuter} />
              {/* Center point */}
              <Circle cx="50" cy="50" r="4" fill={colors.targetInner} />
              {/* Crosshair lines */}
              <Line x1="50" y1="0" x2="50" y2="100" stroke={colors.targetInner} strokeWidth="1.5" strokeOpacity="0.4" />
              <Line x1="0" y1="50" x2="100" y2="50" stroke={colors.targetInner} strokeWidth="1.5" strokeOpacity="0.4" />
            </Svg>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gameTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 3,
    color: "#6366f1",
    marginTop: 60,
    textAlign: "center",
  },
  card: {
    marginHorizontal: 24,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
    marginTop: 80,
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
  hudHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14,
    borderBottomWidth: 1,
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    elevation: 2,
    zIndex: 10,
  },
  hudStat: {
    alignItems: "center",
  },
  hudLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  hudVal: {
    fontSize: 15,
    fontWeight: "900",
  },
  targetWrapper: {
    position: "absolute",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
});