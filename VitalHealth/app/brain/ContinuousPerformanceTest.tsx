// app/brain/ContinuousPerformanceTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

const LETTERS = ["A", "B", "C", "F", "X", "H", "J", "L", "X", "P", "R", "S", "X", "T", "V"];
const DISPLAY_DURATION = 900; // ms letter is visible
const INTERVAL_DURATION = 600; // ms blank gap
const TOTAL_TRIALS = LETTERS.length;

export default function ContinuousPerformanceTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#0284c7",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "playing" | "results">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentTrial, setCurrentTrial] = useState(0);
  const [currentLetter, setCurrentLetter] = useState("");
  const [isLetterVisible, setIsLetterVisible] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  // Metrics
  const responseTimes = useRef<number[]>([]);
  const correctTaps = useRef(0);
  const commissionErrors = useRef(0); // tapped on X
  const omissionErrors = useRef(0); // missed non-X
  const correctInhibitions = useRef(0); // did not tap on X
  const trialStartTime = useRef<number>(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("playing");
      setCurrentTrial(0);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
      triggerHaptic("light");
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  // Main game loop
  useEffect(() => {
    if (phase !== "playing") return;

    if (currentTrial >= TOTAL_TRIALS) {
      finishGame();
      return;
    }

    const letter = LETTERS[currentTrial];
    setCurrentLetter(letter);
    setIsLetterVisible(true);
    setHasResponded(false);
    trialStartTime.current = Date.now();

    // Scale animation on letter reveal
    scaleAnim.setValue(0.5);
    Animated.spring(scaleAnim, {
      toValue: 1.0,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Timeout for letter display duration
    const displayTimer = setTimeout(() => {
      setIsLetterVisible(false);

      // Evaluate trial if no response made
      if (!hasResponded) {
        if (letter === "X") {
          correctInhibitions.current += 1;
        } else {
          omissionErrors.current += 1;
          triggerHaptic("warning");
        }
      }

      // Inter-stimulus interval gap
      const intervalTimer = setTimeout(() => {
        setCurrentTrial((t) => t + 1);
      }, INTERVAL_DURATION);

      return () => clearTimeout(intervalTimer);
    }, DISPLAY_DURATION);

    return () => clearTimeout(displayTimer);
  }, [currentTrial, phase]);

  const handleTap = () => {
    if (!isLetterVisible || hasResponded) return;
    setHasResponded(true);
    const rt = Date.now() - trialStartTime.current;
    const letter = LETTERS[currentTrial];

    triggerHaptic("medium");

    if (letter === "X") {
      commissionErrors.current += 1;
      triggerHaptic("warning");
    } else {
      correctTaps.current += 1;
      responseTimes.current.push(rt);
    }
  };

  const finishGame = () => {
    setPhase("results");
    const avgTime = responseTimes.current.length > 0
      ? responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length
      : 0;

    const totalValidTargets = LETTERS.filter((l) => l !== "X").length;
    const totalInhibitions = LETTERS.filter((l) => l === "X").length;
    
    // Overall accuracy
    const accuracy = (correctTaps.current + correctInhibitions.current) / TOTAL_TRIALS;
    
    // Normalized score (0-100)
    let score = Math.round(accuracy * 100);
    if (avgTime > 600) score -= 10;
    else if (avgTime < 450 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "cpt" as any,
      score,
      rawScore: correctTaps.current,
      accuracy,
      avgTimeMs: avgTime,
      label: "Sustained Attention",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Sustained Attention</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>Continuous Performance Test</Text>
          
          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Letters will flash sequentially on screen.{"\n\n"}
            👉 Tap <Text style={{ fontWeight: "700", color: colors.accent }}>TAP NOW</Text> as fast as possible for every letter.{"\n\n"}
            ⚠️ Do <Text style={{ fontWeight: "700", color: colors.error }}>NOT</Text> tap when the letter is <Text style={{ fontWeight: "900", color: colors.error }}>X</Text>.
          </Text>

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
          Round {currentTrial + 1} of {TOTAL_TRIALS}
        </Text>
      </View>

      <View style={styles.letterContainer}>
        {isLetterVisible && (
          <Animated.Text
            style={[
              styles.letter,
              { color: currentLetter === "X" ? colors.error : colors.text },
              { transform: [{ scale: scaleAnim }] },
              accessibilitySettings.largeText && { fontSize: 130 },
            ]}
          >
            {currentLetter}
          </Animated.Text>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.actionBtn,
          { backgroundColor: hasResponded ? colors.border : colors.accent },
        ]}
        onPress={handleTap}
        disabled={hasResponded}
        activeOpacity={0.7}
      >
        <Text style={[styles.actionBtnText, { color: hasResponded ? colors.subText : "#ffffff" }]}>
          {hasResponded ? "RECORDED" : "TAP NOW"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  center: { alignItems: "center" },
  card: { borderRadius: 28, padding: 28, borderWidth: 1, elevation: 4, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 4 },
  scienceText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginBottom: 20 },
  desc: { lineHeight: 24, marginBottom: 32, textAlign: "center" },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  progressRow: { alignItems: "center", marginBottom: 40 },
  progressText: { fontSize: 14, fontWeight: "700" },
  letterContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  letter: { fontSize: 110, fontWeight: "900" },
  actionBtn: { borderRadius: 24, paddingVertical: 20, alignItems: "center", marginBottom: 40, elevation: 2 },
  actionBtnText: { fontSize: 20, fontWeight: "900", letterSpacing: 1.5 },
});
