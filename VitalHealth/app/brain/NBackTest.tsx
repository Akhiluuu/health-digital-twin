// app/brain/NBackTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

const DISPLAY_TIME = 1500; // ms letter is visible
const INTERVAL_TIME = 700; // ms blank gap
const TOTAL_ROUNDS = 16;

export default function NBackTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#8b5cf6",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "playing" | "done">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentLetter, setCurrentLetter] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [respondedThisRound, setRespondedThisRound] = useState(false);
  const [sequence] = useState<string[]>(() => {
    const pool = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const list: string[] = [];
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      if (i >= 2 && Math.random() < 0.35) {
        // 35% chance to make it a match with 2 steps back
        list.push(list[i - 2]);
      } else {
        // Get a letter, preferably not a match to control probability
        let letter = pool[Math.floor(Math.random() * pool.length)];
        if (i >= 2) {
          let attempts = 0;
          while (letter === list[i - 2] && attempts < 10) {
            letter = pool[Math.floor(Math.random() * pool.length)];
            attempts++;
          }
        }
        list.push(letter);
      }
    }
    return list;
  });

  // Metrics
  const correctMatches = useRef(0);
  const falseAlarms = useRef(0); // Tapped when not a match
  const missedMatches = useRef(0); // Didn't tap when it was a match
  const correctRejections = useRef(0); // Didn't tap and not a match
  const responseTimes = useRef<number[]>([]);
  const trialStartTime = useRef(0);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("playing");
      setCurrentIndex(0);
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

    if (currentIndex >= sequence.length) {
      finishGame();
      return;
    }

    const letter = sequence[currentIndex];
    setCurrentLetter(letter);
    setIsVisible(true);
    setRespondedThisRound(false);
    trialStartTime.current = Date.now();

    scaleAnim.setValue(0.5);
    Animated.spring(scaleAnim, {
      toValue: 1.0,
      friction: 5,
      useNativeDriver: true,
    }).start();

    const displayTimer = setTimeout(() => {
      setIsVisible(false);

      // Evaluate non-response at the end of the trial window
      const isTarget = currentIndex >= 2 && sequence[currentIndex] === sequence[currentIndex - 2];
      if (!respondedThisRound) {
        if (isTarget) {
          missedMatches.current += 1;
          triggerHaptic("warning");
        } else {
          correctRejections.current += 1;
        }
      }

      const gapTimer = setTimeout(() => {
        setCurrentIndex((i) => i + 1);
      }, INTERVAL_TIME);

      return () => clearTimeout(gapTimer);
    }, DISPLAY_TIME);

    return () => clearTimeout(displayTimer);
  }, [currentIndex, phase]);

  const handleMatchPress = () => {
    if (respondedThisRound || !isVisible) return;
    setRespondedThisRound(true);

    const rt = Date.now() - trialStartTime.current;
    const isTarget = currentIndex >= 2 && sequence[currentIndex] === sequence[currentIndex - 2];

    triggerHaptic("medium");

    if (isTarget) {
      correctMatches.current += 1;
      responseTimes.current.push(rt);
    } else {
      falseAlarms.current += 1;
      triggerHaptic("warning");
    }
  };

  const finishGame = () => {
    setPhase("done");
    const avgTime = responseTimes.current.length > 0
      ? responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length
      : 0;

    const totalTrialsEvaluated = TOTAL_ROUNDS;
    const totalCorrect = correctMatches.current + correctRejections.current;
    const accuracy = totalCorrect / totalTrialsEvaluated;

    let score = Math.round(accuracy * 100);
    // Speed adjustment
    if (avgTime > 1100) score -= 10;
    else if (avgTime < 700 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "nback" as any,
      score,
      rawScore: correctMatches.current,
      accuracy,
      avgTimeMs: avgTime,
      label: "Working Memory",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Working Memory</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>2-Back Task</Text>

          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Letters will appear one by one.{"\n\n"}
            👉 Tap <Text style={{ fontWeight: "700", color: colors.accent }}>MATCH</Text> if the current letter is the <Text style={{ fontWeight: "900", color: colors.accent }}>SAME</Text> as the one shown <Text style={{ fontWeight: "700" }}>2 steps back</Text>.{"\n\n"}
            Do nothing if it does not match.
          </Text>

          <View style={styles.exampleContainer}>
            <Text style={[styles.exampleText, { color: colors.subText }]}>Example sequence:</Text>
            <Text style={[styles.exampleSequence, { color: colors.text }]}>
              A  →  B  →  <Text style={{ color: colors.accent, fontWeight: "900" }}>A</Text>  →  C  →  D
            </Text>
            <Text style={[styles.exampleText, { color: colors.accent, fontWeight: "700" }]}>
              (Third letter 'A' matches the first letter 'A')
            </Text>
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
          Round {currentIndex + 1} of {TOTAL_ROUNDS}
        </Text>
      </View>

      <View style={styles.letterContainer}>
        {isVisible && (
          <Animated.Text
            style={[
              styles.letter,
              { color: colors.text },
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
          styles.matchBtn,
          { backgroundColor: respondedThisRound ? colors.border : colors.accent },
        ]}
        onPress={handleMatchPress}
        disabled={respondedThisRound}
        activeOpacity={0.8}
      >
        <Text style={[styles.matchBtnText, { color: respondedThisRound ? colors.subText : "#ffffff" }]}>
          {respondedThisRound ? "RECORDED" : "MATCH"}
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
  desc: { lineHeight: 24, marginBottom: 16, textAlign: "center" },
  exampleContainer: { alignItems: "center", padding: 12, borderRadius: 16, backgroundColor: "rgba(139, 92, 246, 0.08)", marginBottom: 28 },
  exampleText: { fontSize: 12, marginVertical: 2 },
  exampleSequence: { fontSize: 20, fontWeight: "800", letterSpacing: 1, marginVertical: 6 },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  progressRow: { alignItems: "center", marginBottom: 40 },
  progressText: { fontSize: 14, fontWeight: "700" },
  letterContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  letter: { fontSize: 110, fontWeight: "900" },
  matchBtn: { borderRadius: 24, paddingVertical: 20, alignItems: "center", marginBottom: 40, elevation: 2 },
  matchBtnText: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },
});
