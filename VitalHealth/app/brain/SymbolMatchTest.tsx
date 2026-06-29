// app/brain/SymbolMatchTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

const SYMBOLS = [
  { symbol: "⭐️", digit: 1 },
  { symbol: "🌀", digit: 2 },
  { symbol: "🔺", digit: 3 },
  { symbol: "🌙", digit: 4 },
];

const TOTAL_ROUNDS = 12;

export default function SymbolMatchTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#0ea5e9",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "playing" | "done">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentRound, setCurrentRound] = useState(0);
  const [targetItem, setTargetItem] = useState<{ symbol: string; digit: number }>(SYMBOLS[0]);

  // Metrics
  const correctMatches = useRef(0);
  const responseTimes = useRef<number[]>([]);
  const roundStartTime = useRef(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("playing");
      nextRound();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
      triggerHaptic("light");
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  const nextRound = () => {
    const randomIndex = Math.floor(Math.random() * SYMBOLS.length);
    setTargetItem(SYMBOLS[randomIndex]);
    roundStartTime.current = Date.now();

    scaleAnim.setValue(0.7);
    Animated.spring(scaleAnim, {
      toValue: 1.0,
      friction: 6,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = (digit: number) => {
    if (phase !== "playing") return;

    const rt = Date.now() - roundStartTime.current;
    const isCorrect = digit === targetItem.digit;

    responseTimes.current.push(rt);

    if (isCorrect) {
      correctMatches.current += 1;
      triggerHaptic("light");
    } else {
      triggerHaptic("warning");
    }

    if (currentRound + 1 >= TOTAL_ROUNDS) {
      finishGame();
    } else {
      setCurrentRound((r) => r + 1);
      nextRound();
    }
  };

  const finishGame = () => {
    setPhase("done");
    const avgTime = responseTimes.current.length > 0
      ? responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length
      : 0;

    const accuracy = correctMatches.current / TOTAL_ROUNDS;
    let score = Math.round(accuracy * 100);

    // Speed adjustment
    if (avgTime > 1500) score -= 15;
    else if (avgTime < 800 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "symbol" as any,
      score,
      rawScore: correctMatches.current,
      accuracy,
      avgTimeMs: avgTime,
      label: "Processing Speed",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Processing Speed</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>Symbol Match Test</Text>

          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Use the key grid at the top to match the target symbol with its correct digit number.{"\n\n"}
            👉 Tap the button (1, 2, 3, or 4) corresponding to the target symbol as fast as possible.
          </Text>

          <View style={styles.exampleContainer}>
            <Text style={[styles.exampleText, { color: colors.subText }]}>Key Grid Mapping:</Text>
            <View style={styles.gridRow}>
              {SYMBOLS.map((s) => (
                <View key={s.digit} style={styles.gridItem}>
                  <Text style={styles.gridSym}>{s.symbol}</Text>
                  <Text style={[styles.gridNum, { color: colors.accent }]}>{s.digit}</Text>
                </View>
              ))}
            </View>
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.subText }]}>
          Round {currentRound + 1} of {TOTAL_ROUNDS}
        </Text>
      </View>

      {/* Key Mapping Header */}
      <View style={[styles.keyHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.keyTitle, { color: colors.subText }]}>REFERENCE KEY</Text>
        <View style={styles.gridRow}>
          {SYMBOLS.map((s) => (
            <View key={s.digit} style={styles.keyGridItem}>
              <Text style={styles.keyGridSym}>{s.symbol}</Text>
              <View style={styles.divider} />
              <Text style={[styles.keyGridNum, { color: colors.text }]}>{s.digit}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Target display */}
      <View style={styles.targetContainer}>
        <Animated.Text style={[styles.targetSymbol, { transform: [{ scale: scaleAnim }] }]}>
          {targetItem.symbol}
        </Animated.Text>
        <Text style={[styles.targetLabel, { color: colors.subText }]}>What is the correct digit?</Text>
      </View>

      {/* Digit Selectors */}
      <View style={styles.digitsRow}>
        {[1, 2, 3, 4].map((num) => (
          <TouchableOpacity
            key={num}
            style={[styles.digitBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handlePress(num)}
            activeOpacity={0.7}
          >
            <Text style={[styles.digitBtnText, { color: colors.accent }]}>{num}</Text>
          </TouchableOpacity>
        ))}
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
  desc: { lineHeight: 24, marginBottom: 20, textAlign: "center" },
  exampleContainer: { alignItems: "center", padding: 16, borderRadius: 20, backgroundColor: "rgba(14, 165, 233, 0.08)", marginBottom: 28 },
  exampleText: { fontSize: 12, fontWeight: "700", marginBottom: 12 },
  gridRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", gap: 8 },
  gridItem: { alignItems: "center", padding: 8 },
  gridSym: { fontSize: 28, marginBottom: 4 },
  gridNum: { fontSize: 16, fontWeight: "900" },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  progressRow: { alignItems: "center", marginBottom: 24 },
  progressText: { fontSize: 14, fontWeight: "700" },
  keyHeader: { borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 32 },
  keyTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 2, textAlign: "center", marginBottom: 12 },
  keyGridItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderWidth: 1, borderColor: "transparent" },
  keyGridSym: { fontSize: 24 },
  divider: { height: 1, width: "60%", backgroundColor: "rgba(100,116,139,0.2)", marginVertical: 6 },
  keyGridNum: { fontSize: 16, fontWeight: "800" },
  targetContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 42 },
  targetSymbol: { fontSize: 80, marginBottom: 12 },
  targetLabel: { fontSize: 14, fontWeight: "600" },
  digitsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 30 },
  digitBtn: { flex: 1, height: 70, borderRadius: 20, borderWidth: 2, justifyContent: "center", alignItems: "center", elevation: 2 },
  digitBtnText: { fontSize: 26, fontWeight: "900" },
});
