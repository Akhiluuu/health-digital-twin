// app/brain/StroopTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Emotion Recognition Task (ERT)
// Cognitive Domain: Social Cognition / Emotion Processing
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Animated,
  Vibration,
} from "react-native";
import Svg, { Circle, Path, Ellipse, G } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 40;

type Phase = "instructions" | "playing" | "done";
type EmotionCategory = "happy" | "sad" | "angry" | "fearful" | "neutral";

interface EmotionStimulus {
  id: number;
  category: EmotionCategory;
  intensity: "mild" | "intense";
}

// Generate pool of 40 trials: 8 of each of the 5 categories (4 mild, 4 intense each)
const generateStimuliPool = (): EmotionStimulus[] => {
  const pool: EmotionStimulus[] = [];
  const categories: EmotionCategory[] = ["happy", "sad", "angry", "fearful", "neutral"];
  let id = 1;

  categories.forEach((cat) => {
    for (let i = 0; i < 4; i++) {
      pool.push({ id: id++, category: cat, intensity: "mild" });
      pool.push({ id: id++, category: cat, intensity: "intense" });
    }
  });

  return pool.sort(() => Math.random() - 0.5);
};

type Props = {
  onDone: (result: GameResult) => void;
};

export default function EmotionRecognitionTest({ onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#a855f7",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [trial, setTrial] = useState(0);
  const [stimuli, setStimuli] = useState<EmotionStimulus[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);

  const startTrialTimeRef = useRef<number>(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setStimuli(generateStimuliPool());
  }, []);

  const startTest = () => {
    setPhase("playing");
    setTrial(0);
    setCorrectAnswers(0);
    startTrialTimeRef.current = Date.now();
  };

  const handleSelectLabel = (selected: EmotionCategory) => {
    const elapsed = Date.now() - startTrialTimeRef.current;
    const currentStimulus = stimuli[trial];
    const isCorrect = currentStimulus.category === selected;

    try {
      Vibration.vibrate(isCorrect ? 12 : [0, 60]);
    } catch (_) {}

    if (isCorrect) setCorrectAnswers((c) => c + 1);
    const newTimes = [...responseTimes, elapsed];
    setResponseTimes(newTimes);

    const nextTrial = trial + 1;
    if (nextTrial >= TOTAL_STIMULI) {
      setPhase("done");
      const avgTime = newTimes.reduce((a, b) => a + b, 0) / newTimes.length;
      const accuracy = correctAnswers / TOTAL_STIMULI;
      // Convert accuracy and time to 0-100 score
      const score = Math.max(10, Math.round(accuracy * 90 + 10 - Math.min(15, (avgTime - 700) / 100)));

      setTimeout(() => {
        onDone({
          game: "stroop", // mapped to stroop in engine
          score,
          rawScore: correctAnswers,
          accuracy,
          avgTimeMs: avgTime,
          label: "Emotion Recognition Task",
        });
      }, 500);
    } else {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
      setTrial(nextTrial);
      startTrialTimeRef.current = Date.now();
    }
  };

  // Styled Vector Face Renderer using SVG
  const renderEmotionFace = (category: EmotionCategory, intensity: "mild" | "intense") => {
    const faceColor = isDark ? "#1e293b" : "#f1f5f9";
    const strokeColor = isDark ? "#f8fafc" : "#0f172a";
    const accentColor = "#a855f7";

    const isIntense = intensity === "intense";

    return (
      <Svg width="180" height="180" viewBox="0 0 100 100">
        <G>
          {/* Base Face Circle */}
          <Circle cx="50" cy="50" r="42" fill={faceColor} stroke={strokeColor} strokeWidth="3" />

          {/* Ears */}
          <Circle cx="7" cy="50" r="6" fill={faceColor} stroke={strokeColor} strokeWidth="2.5" />
          <Circle cx="93" cy="50" r="6" fill={faceColor} stroke={strokeColor} strokeWidth="2.5" />

          {/* Nose */}
          <Path d="M 50 44 L 47 52 L 53 52 Z" fill="none" stroke={strokeColor} strokeWidth="2" />

          {/* Happy Face */}
          {category === "happy" && (
            <G>
              {/* Smiling Mouth */}
              <Path
                d={isIntense ? "M 32 60 Q 50 82 68 60 Z" : "M 35 62 Q 50 74 65 62"}
                fill={isIntense ? accentColor : "none"}
                stroke={strokeColor}
                strokeWidth="3.5"
              />
              {/* Raised Eyebrows */}
              <Path d="M 24 30 Q 34 22 42 27" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              <Path d="M 76 30 Q 66 22 58 27" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              {/* Happy squinty eyes */}
              <Path d="M 28 38 Q 34 32 40 38" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Path d="M 60 38 Q 66 32 72 38" fill="none" stroke={strokeColor} strokeWidth="3" />
            </G>
          )}

          {/* Sad Face */}
          {category === "sad" && (
            <G>
              {/* Frowning Mouth */}
              <Path d="M 34 66 Q 50 54 66 66" fill="none" stroke={strokeColor} strokeWidth="3.5" />
              {/* Slanted sad eyebrows */}
              <Path d="M 24 26 Q 34 29 42 22" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              <Path d="M 76 26 Q 66 29 58 22" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              {/* Tear drops */}
              <Path
                d="M 32 46 Q 32 54 30 54 Q 28 54 28 46 Z"
                fill="#3b82f6"
                opacity={isIntense ? 1.0 : 0.4}
              />
              {/* Downcast eyes */}
              <Path d="M 28 36 Q 34 40 40 36" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Path d="M 60 36 Q 66 40 72 36" fill="none" stroke={strokeColor} strokeWidth="3" />
            </G>
          )}

          {/* Angry Face */}
          {category === "angry" && (
            <G>
              {/* Gritting mouth */}
              <Path
                d={isIntense ? "M 32 66 L 68 66 Q 50 54 32 66" : "M 35 64 Q 50 58 65 64"}
                fill={isIntense ? strokeColor : "none"}
                stroke={strokeColor}
                strokeWidth="3.5"
              />
              {/* Angry slanted eyebrows */}
              <Path d="M 24 22 L 42 30" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Path d="M 76 22 L 58 30" fill="none" stroke={strokeColor} strokeWidth="3" />
              {/* Angled narrow eyes */}
              <Path d="M 26 36 L 40 39" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Path d="M 74 36 L 60 39" fill="none" stroke={strokeColor} strokeWidth="3" />
            </G>
          )}

          {/* Fearful Face */}
          {category === "fearful" && (
            <G>
              {/* Open gasp mouth */}
              <Ellipse
                cx="50"
                cy="68"
                rx={isIntense ? "16" : "10"}
                ry={isIntense ? "12" : "7"}
                fill={strokeColor}
              />
              {/* High raised wavy eyebrows */}
              <Path d="M 22 24 Q 32 18 42 22" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              <Path d="M 78 24 Q 68 18 58 22" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              {/* Wide open eyes with small pupils */}
              <Circle cx="34" cy="38" r="7" fill="none" stroke={strokeColor} strokeWidth="2" />
              <Circle cx="34" cy="38" r="2.5" fill={strokeColor} />
              <Circle cx="66" cy="38" r="7" fill="none" stroke={strokeColor} strokeWidth="2" />
              <Circle cx="66" cy="38" r="2.5" fill={strokeColor} />
            </G>
          )}

          {/* Neutral Face */}
          {category === "neutral" && (
            <G>
              {/* Straight line mouth */}
              <Path d="M 35 64 L 65 64" fill="none" stroke={strokeColor} strokeWidth="3.5" />
              {/* Flat horizontal eyebrows */}
              <Path d="M 24 26 L 42 26" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              <Path d="M 76 26 L 58 26" fill="none" stroke={strokeColor} strokeWidth="2.5" />
              {/* Standard eyes */}
              <Circle cx="34" cy="38" r="4.5" fill={strokeColor} />
              <Circle cx="66" cy="38" r="4.5" fill={strokeColor} />
            </G>
          )}
        </G>
      </Svg>
    );
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>EMOTION RECOGNITION TASK (ERT)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Social Emotion Cognition</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            In this task, you will see stylized facial expressions.{"\n"}{"\n"}
            Select the category that correctly describes the emotion being portrayed: <Text style={{ fontWeight: "800" }}>Happy</Text>, <Text style={{ fontWeight: "800" }}>Sad</Text>, <Text style={{ fontWeight: "800" }}>Angry</Text>, <Text style={{ fontWeight: "800" }}>Fearful</Text>, or <Text style={{ fontWeight: "800" }}>Neutral</Text>.{"\n"}{"\n"}
            The expressions vary in intensity (mild vs intense). Respond as fast and accurately as possible across 40 trials.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.accent }]} onPress={startTest}>
            <Text style={styles.btnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const current = stimuli[trial];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>EMOTION RECOGNITION</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Trial {trial + 1} of {TOTAL_STIMULI}
      </Text>

      <Animated.View style={[styles.displayCard, { opacity: fadeAnim, backgroundColor: colors.card, borderColor: colors.border }]}>
        {current && renderEmotionFace(current.category, current.intensity)}
      </Animated.View>

      <Text style={[styles.questionText, { color: colors.text }]}>
        Identify the facial emotion:
      </Text>

      <View style={styles.labelsGrid}>
        {(["happy", "sad", "angry", "fearful", "neutral"] as EmotionCategory[]).map((label) => (
          <TouchableOpacity
            key={label}
            style={[styles.labelBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSelectLabel(label)}
          >
            <Text style={[styles.labelBtnText, { color: colors.text }]}>
              {label.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
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
    color: "#a855f7",
    marginTop: 60,
    marginBottom: 10,
    textAlign: "center",
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
  progressText: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 20,
  },
  displayCard: {
    width: W - 48,
    height: 200,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  questionText: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 18,
    textAlign: "center",
  },
  labelsGrid: {
    width: "100%",
    gap: 8,
    marginBottom: 30,
  },
  labelBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
    width: "100%",
    elevation: 1,
  },
  labelBtnText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});