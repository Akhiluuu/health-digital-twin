// app/brain/FlankerTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

type FlankerItem = {
  display: string;
  target: "left" | "right";
  isCongruent: boolean;
};

function makeFlankerItem(): FlankerItem {
  const target: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
  const isCongruent = Math.random() < 0.5;
  let display = "";
  if (isCongruent) {
    display = target === "left" ? "◀ ◀ ◀ ◀ ◀" : "▶ ▶ ▶ ▶ ▶";
  } else {
    display = target === "left" ? "▶ ▶ ◀ ▶ ▶" : "◀ ◀ ▶ ◀ ◀";
  }
  return { display, target, isCongruent };
}

const TOTAL_ROUNDS = 12;

export default function FlankerTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#6366f1",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "playing" | "done">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentRound, setCurrentRound] = useState(0);
  const [flankers] = useState<FlankerItem[]>(() =>
    Array.from({ length: TOTAL_ROUNDS }, () => makeFlankerItem())
  );

  const correctAnswers = useRef(0);
  const responseTimes = useRef<number[]>([]);
  const roundStartTime = useRef(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("playing");
      roundStartTime.current = Date.now();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
      triggerHaptic("light");
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  // Handle choice selection
  const handleSelect = (direction: "left" | "right") => {
    if (phase !== "playing") return;

    const rt = Date.now() - roundStartTime.current;
    const item = flankers[currentRound];
    const isCorrect = direction === item.target;

    responseTimes.current.push(rt);

    if (isCorrect) {
      correctAnswers.current += 1;
      triggerHaptic("light");
    } else {
      triggerHaptic("warning");
    }

    if (currentRound + 1 >= TOTAL_ROUNDS) {
      finishGame();
    } else {
      setCurrentRound((r) => r + 1);
      roundStartTime.current = Date.now();
      // Animate transition
      scaleAnim.setValue(0.8);
      Animated.spring(scaleAnim, {
        toValue: 1.0,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
  };

  const finishGame = () => {
    setPhase("done");
    const avgTime = responseTimes.current.length > 0
      ? responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length
      : 0;

    const accuracy = correctAnswers.current / TOTAL_ROUNDS;
    let score = Math.round(accuracy * 100);

    // Speed adjustment
    if (avgTime > 1200) score -= 15;
    else if (avgTime < 700 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "flanker" as any,
      score,
      rawScore: correctAnswers.current,
      accuracy,
      avgTimeMs: avgTime,
      label: "Selective Attention",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Selective Attention</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>Flanker Task</Text>

          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Look at the middle arrow in each display.{"\n\n"}
            👉 Press the <Text style={{ fontWeight: "700", color: colors.accent }}>LEFT</Text> or <Text style={{ fontWeight: "700", color: colors.accent }}>RIGHT</Text> arrow button below corresponding to the direction of the <Text style={{ fontWeight: "900", color: colors.accent }}>MIDDLE</Text> arrow.{"\n\n"}
            Ignore the side arrows! Keep your eyes on the center.
          </Text>

          <View style={styles.exampleContainer}>
            <Text style={[styles.exampleText, { color: colors.subText }]}>Example incongruent:</Text>
            <Text style={[styles.exampleArrows, { color: colors.text }]}>◀ ◀ ▶ ◀ ◀</Text>
            <Text style={[styles.exampleText, { color: colors.accent, fontWeight: "700" }]}>Press RIGHT (▶)</Text>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => setPhase("countdown")}
          >
            <Text style={styles.btnText}>START TEST</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === "countdown") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.center]}>
        <Text style={[styles.countdownText, { color: colors.accent }]}>{countdown}</Text>
        <Text style={[styles.subText, { color: colors.subText }]}>Get Ready...</Text>
      </View>
    );
  }

  const currentItem = flankers[currentRound];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.subText }]}>
          Trial {currentRound + 1} of {TOTAL_ROUNDS}
        </Text>
      </View>

      <View style={styles.displayContainer}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Text
            style={[
              styles.arrows,
              { color: colors.text },
              accessibilitySettings.largeText && { fontSize: 36 },
            ]}
          >
            {currentItem.display}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleSelect("left")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={32} color={colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleSelect("right")}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-forward" size={32} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  center: { alignItems: "center" },
  card: { borderRadius: 28, padding: 28, borderWidth: 1, elevation: 4, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 4 },
  scienceText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginBottom: 20 },
  desc: { lineHeight: 24, marginBottom: 16, textAlign: "center" },
  exampleContainer: { alignItems: "center", padding: 12, borderRadius: 16, backgroundColor: "rgba(99, 102, 241, 0.08)", marginBottom: 28 },
  exampleText: { fontSize: 12, marginVertical: 2 },
  exampleArrows: { fontSize: 22, fontWeight: "800", letterSpacing: 2, marginVertical: 4 },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  progressRow: { alignItems: "center", marginBottom: 40 },
  progressText: { fontSize: 14, fontWeight: "700" },
  displayContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 40 },
  arrows: { fontSize: 32, fontWeight: "900", letterSpacing: 4 },
  actionButtons: { flexDirection: "row", justifyContent: "space-around", marginBottom: 40 },
  actionBtn: { width: 80, height: 80, borderRadius: 40, borderStyle: "solid", borderWidth: 2, justifyContent: "center", alignItems: "center", elevation: 2 },
});
