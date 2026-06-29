// app/brain/TaskSwitchingTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

type CardItem = {
  text: string;
  number: number;
  letter: string;
  rule: "number" | "letter"; // cued by color
  correctAnswer: "odd" | "even" | "vowel" | "consonant";
};

const VOWELS = ["A", "E", "I", "O", "U"];
const LETTERS = ["B", "D", "F", "G", "H", "J", "K", "L", "M", "N"];

const TRIALS: CardItem[] = [
  { text: "3G", number: 3, letter: "G", rule: "number", correctAnswer: "odd" },
  { text: "6E", number: 6, letter: "E", rule: "letter", correctAnswer: "vowel" },
  { text: "4K", number: 4, letter: "K", rule: "number", correctAnswer: "even" },
  { text: "7A", number: 7, letter: "A", rule: "letter", correctAnswer: "vowel" },
  { text: "2L", number: 2, letter: "L", rule: "number", correctAnswer: "even" },
  { text: "9H", number: 9, letter: "H", rule: "letter", correctAnswer: "consonant" },
  { text: "5B", number: 5, letter: "B", rule: "number", correctAnswer: "odd" },
  { text: "8U", number: 8, letter: "U", rule: "letter", correctAnswer: "vowel" },
  { text: "1N", number: 1, letter: "N", rule: "number", correctAnswer: "odd" },
  { text: "3D", number: 3, letter: "D", rule: "letter", correctAnswer: "consonant" },
  { text: "8M", number: 8, letter: "M", rule: "number", correctAnswer: "even" },
  { text: "5O", number: 5, letter: "O", rule: "letter", correctAnswer: "vowel" },
];

const TOTAL_ROUNDS = TRIALS.length;

export default function TaskSwitchingTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#ec4899",
    blueRule: "#3b82f6",
    yellowRule: "#eab308",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "playing" | "done">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentRound, setCurrentRound] = useState(0);

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

  const handleSelect = (choice: "odd" | "even" | "vowel" | "consonant") => {
    if (phase !== "playing") return;

    const rt = Date.now() - roundStartTime.current;
    const item = TRIALS[currentRound];
    const isCorrect = choice === item.correctAnswer;

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

    // Speed adjustment (Switching is demanding, base ~2 seconds)
    if (avgTime > 2200) score -= 15;
    else if (avgTime < 1300 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "switching" as any,
      score,
      rawScore: correctAnswers.current,
      accuracy,
      avgTimeMs: avgTime,
      label: "Cognitive Flexibility",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Executive Function</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>Task Switching</Text>

          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Cards showing a number and a letter will appear. The rules shift depending on the background color:{"\n\n"}
            🔵 If the card is <Text style={{ color: colors.blueRule, fontWeight: "800" }}>BLUE</Text>: Classify the number as <Text style={{ fontWeight: "700" }}>ODD</Text> or <Text style={{ fontWeight: "700" }}>EVEN</Text>.{"\n\n"}
            🟡 If the card is <Text style={{ color: colors.yellowRule, fontWeight: "800" }}>YELLOW</Text>: Classify the letter as <Text style={{ fontWeight: "700" }}>VOWEL</Text> or <Text style={{ fontWeight: "700" }}>CONSONANT</Text>.
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

  const currentItem = TRIALS[currentRound];
  const isNumberRule = currentItem.rule === "number";
  const ruleColor = isNumberRule ? colors.blueRule : colors.yellowRule;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.subText }]}>
          Round {currentRound + 1} of {TOTAL_ROUNDS}
        </Text>
      </View>

      {/* Cue Indicator */}
      <View style={[styles.cueCard, { backgroundColor: ruleColor + "15", borderColor: ruleColor }]}>
        <Text style={[styles.cueText, { color: ruleColor }]}>
          {isNumberRule ? "CLASSIFY NUMBER (ODD / EVEN)" : "CLASSIFY LETTER (VOWEL / CONSONANT)"}
        </Text>
      </View>

      {/* Target card */}
      <View style={styles.cardContainer}>
        <Animated.View
          style={[
            styles.targetCard,
            { backgroundColor: ruleColor, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text style={styles.targetText}>{currentItem.text}</Text>
        </Animated.View>
      </View>

      {/* Choice Buttons */}
      <View style={styles.choicesRow}>
        {isNumberRule ? (
          <>
            <TouchableOpacity
              style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelect("odd")}
              activeOpacity={0.7}
            >
              <Text style={[styles.choiceBtnText, { color: colors.blueRule }]}>ODD</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelect("even")}
              activeOpacity={0.7}
            >
              <Text style={[styles.choiceBtnText, { color: colors.blueRule }]}>EVEN</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelect("vowel")}
              activeOpacity={0.7}
            >
              <Text style={[styles.choiceBtnText, { color: colors.yellowRule }]}>VOWEL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.choiceBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleSelect("consonant")}
              activeOpacity={0.7}
            >
              <Text style={[styles.choiceBtnText, { color: colors.yellowRule }]}>CONSONANT</Text>
            </TouchableOpacity>
          </>
        )}
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
  desc: { lineHeight: 24, marginBottom: 32, textAlign: "center" },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  progressRow: { alignItems: "center", marginBottom: 20 },
  progressText: { fontSize: 14, fontWeight: "700" },
  cueCard: { borderRadius: 16, padding: 12, borderWidth: 1.5, alignItems: "center", marginBottom: 32 },
  cueText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  cardContainer: { flex: 1, justifyContent: "center", alignItems: "center", marginBottom: 40 },
  targetCard: { width: 160, height: 220, borderRadius: 24, justifyContent: "center", alignItems: "center", elevation: 4 },
  targetText: { fontSize: 50, fontWeight: "900", color: "#ffffff" },
  choicesRow: { flexDirection: "row", gap: 16, marginBottom: 30 },
  choiceBtn: { flex: 1, height: 75, borderRadius: 20, borderWidth: 2.5, justifyContent: "center", alignItems: "center", elevation: 2 },
  choiceBtnText: { fontSize: 16, fontWeight: "900", letterSpacing: 1 },
});
