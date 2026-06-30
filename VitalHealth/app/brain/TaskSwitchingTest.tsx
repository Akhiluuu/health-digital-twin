// app/brain/TaskSwitchingTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Abstract Matching (AM)
// Cognitive Domain: Cognitive Flexibility / Shifting / Executive Function
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
import Svg, { Path, Circle, Rect, Polygon, G } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 30;

type Phase = "instructions" | "playing" | "done";
type Rule = "color" | "shape" | "size";

interface GameObject {
  color: "red" | "blue" | "green";
  shape: "circle" | "square" | "triangle" | "star";
  size: "small" | "large";
  count: 1 | 2;
}

const COLORS_HEX = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#10b981",
};

type Props = {
  onDone: (result: GameResult) => void;
};

export default function AbstractMatching({ onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#ec4899",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [trial, setTrial] = useState(0);
  const [target, setTarget] = useState<GameObject>({
    color: "red",
    shape: "circle",
    size: "large",
    count: 1,
  });
  const [leftPair, setLeftPair] = useState<GameObject>({
    color: "red",
    shape: "square",
    size: "small",
    count: 2,
  });
  const [rightPair, setRightPair] = useState<GameObject>({
    color: "blue",
    shape: "circle",
    size: "large",
    count: 1,
  });

  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const feedbackAnim = useRef(new Animated.Value(0)).current;

  const setupTrial = (trialIndex: number) => {
    setFeedback(null);
    feedbackAnim.setValue(0);

    // Rules shift implicitly: 0-9 color, 10-19 shape, 20-29 size
    const activeRule: Rule =
      trialIndex < 10 ? "color" : trialIndex < 20 ? "shape" : "size";

    const shapesList: Array<GameObject["shape"]> = ["circle", "square", "triangle", "star"];
    const colorsList: Array<GameObject["color"]> = ["red", "blue", "green"];

    // Generate random target
    const tgt: GameObject = {
      color: colorsList[Math.floor(Math.random() * 3)],
      shape: shapesList[Math.floor(Math.random() * 4)],
      size: Math.random() < 0.5 ? "small" : "large",
      count: Math.random() < 0.5 ? 1 : 2,
    };
    setTarget(tgt);

    // Build left & right choice objects
    // Left choice will match target on the active rule feature; right choice will mismatch
    let left: GameObject;
    let right: GameObject;

    if (activeRule === "color") {
      const wrongColor = colorsList.filter((c) => c !== tgt.color)[Math.floor(Math.random() * 2)];
      left = {
        color: tgt.color,
        shape: shapesList.filter((s) => s !== tgt.shape)[Math.floor(Math.random() * 3)],
        size: tgt.size === "large" ? "small" : "large",
        count: tgt.count === 1 ? 2 : 1,
      };
      right = {
        color: wrongColor,
        shape: tgt.shape,
        size: tgt.size,
        count: tgt.count,
      };
    } else if (activeRule === "shape") {
      const wrongShape = shapesList.filter((s) => s !== tgt.shape)[Math.floor(Math.random() * 3)];
      left = {
        color: colorsList.filter((c) => c !== tgt.color)[Math.floor(Math.random() * 2)],
        shape: tgt.shape,
        size: tgt.size === "large" ? "small" : "large",
        count: tgt.count === 1 ? 2 : 1,
      };
      right = {
        color: tgt.color,
        shape: wrongShape,
        size: tgt.size,
        count: tgt.count,
      };
    } else {
      // Rule is Size/Count
      left = {
        color: colorsList.filter((c) => c !== tgt.color)[Math.floor(Math.random() * 2)],
        shape: shapesList.filter((s) => s !== tgt.shape)[Math.floor(Math.random() * 3)],
        size: tgt.size,
        count: tgt.count,
      };
      right = {
        color: tgt.color,
        shape: tgt.shape,
        size: tgt.size === "large" ? "small" : "large",
        count: tgt.count === 1 ? 2 : 1,
      };
    }

    // Shuffle left/right pairs so the match is randomly left or right
    if (Math.random() < 0.5) {
      setLeftPair(left);
      setRightPair(right);
    } else {
      setLeftPair(right);
      setRightPair(left);
    }
  };

  const handleChoice = (side: "left" | "right") => {
    if (feedback !== null) return;

    const activeRule: Rule =
      trial < 10 ? "color" : trial < 20 ? "shape" : "size";

    const chosen = side === "left" ? leftPair : rightPair;
    let isCorrect = false;

    if (activeRule === "color" && chosen.color === target.color) isCorrect = true;
    else if (activeRule === "shape" && chosen.shape === target.shape) isCorrect = true;
    else if (activeRule === "size" && chosen.size === target.size && chosen.count === target.count) isCorrect = true;

    setFeedback(isCorrect ? "correct" : "incorrect");
    if (isCorrect) setCorrectCount((c) => c + 1);

    try {
      Vibration.vibrate(isCorrect ? 15 : [0, 80]);
    } catch (_) {}

    Animated.timing(feedbackAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      const nextTrial = trial + 1;
      if (nextTrial >= TOTAL_STIMULI) {
        setPhase("done");
        const score = Math.round((correctCount / TOTAL_STIMULI) * 100);

        onDone({
          game: "switching",
          score,
          rawScore: correctCount,
          accuracy: correctCount / TOTAL_STIMULI,
          avgTimeMs: 0,
          label: "Abstract Matching",
        });
      } else {
        setTrial(nextTrial);
        setupTrial(nextTrial);
      }
    }, 1000);
  };

  const renderSingleShape = (obj: GameObject, canvasSize: number) => {
    const color = COLORS_HEX[obj.color];
    const shapeSize = obj.size === "large" ? canvasSize * 0.7 : canvasSize * 0.4;
    const center = canvasSize / 2;
    const r = shapeSize / 2;

    return (
      <Svg width={canvasSize} height={canvasSize} viewBox={`0 0 ${canvasSize} ${canvasSize}`}>
        {obj.shape === "circle" && (
          <Circle cx={center} cy={center} r={r} fill={color} />
        )}
        {obj.shape === "square" && (
          <Rect
            x={center - r}
            y={center - r}
            width={shapeSize}
            height={shapeSize}
            rx={4}
            fill={color}
          />
        )}
        {obj.shape === "triangle" && (
          <Polygon
            points={`${center},${center - r} ${center - r},${center + r} ${center + r},${center + r}`}
            fill={color}
          />
        )}
        {obj.shape === "star" && (
          <G transform={`translate(${center}, ${center}) scale(${shapeSize / 60})`}>
            <Path
              d="M 0,-25 L 7,-8 L 25,-8 L 11,5 L 16,22 L 0,12 L -16,22 L -11,5 L -25,-8 L -7,-8 Z"
              fill={color}
            />
          </G>
        )}
      </Svg>
    );
  };

  const renderPair = (obj: GameObject, containerSize: number) => {
    return (
      <View style={[styles.pairContainer, { width: containerSize, height: containerSize }]}>
        {obj.count === 1 ? (
          renderSingleShape(obj, containerSize)
        ) : (
          <View style={styles.pairRow}>
            {renderSingleShape({ ...obj, size: "small" }, containerSize * 0.48)}
            {renderSingleShape({ ...obj, size: "small" }, containerSize * 0.48)}
          </View>
        )}
      </View>
    );
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>ABSTRACT MATCHING TEST (AM)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Executive Adaptability</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            A target item is displayed in the upper-middle. Two choice categories are at the bottom.{"\n"}{"\n"}
            Classify the target by matching it to the correct bottom pair based on an <Text style={{ color: colors.accent, fontWeight: "900" }}>implicit matching rule</Text> (Color, Shape, or Size/Count).{"\n"}{"\n"}
            The rule is not stated directly, and <Text style={{ color: colors.accent, fontWeight: "900" }}>shifts every 10 trials</Text>. Deduce the rules from feedback!
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setPhase("playing");
              setupTrial(0);
            }}
          >
            <Text style={styles.btnText}>Start Test</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>ABSTRACT MATCHING</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Trial {trial + 1} of {TOTAL_STIMULI}
      </Text>

      {/* Target object */}
      <View style={[styles.targetWrapper, { borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.subText }]}>TARGET</Text>
        <View style={styles.targetContent}>
          {renderPair(target, 90)}
        </View>
      </View>

      {/* Choice columns */}
      <View style={styles.choicesRow}>
        <TouchableOpacity
          style={[styles.choiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleChoice("left")}
          activeOpacity={0.7}
        >
          {renderPair(leftPair, 70)}
          <Text style={[styles.choiceLabel, { color: colors.subText }]}>Option A</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.choiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => handleChoice("right")}
          activeOpacity={0.7}
        >
          {renderPair(rightPair, 70)}
          <Text style={[styles.choiceLabel, { color: colors.subText }]}>Option B</Text>
        </TouchableOpacity>
      </View>

      {/* Feedback banner */}
      {feedback && (
        <Animated.View style={[styles.feedbackBanner, { opacity: feedbackAnim }]}>
          <Text
            style={[
              styles.feedbackText,
              { color: feedback === "correct" ? "#10b981" : "#ef4444" },
            ]}
          >
            {feedback === "correct" ? "✓ Correct Match" : "✗ Incorrect Match"}
          </Text>
        </Animated.View>
      )}
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
    color: "#ec4899",
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
  targetWrapper: {
    width: 150,
    height: 150,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 36,
  },
  targetContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  pairContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  pairRow: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  choicesRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
    justifyContent: "space-between",
  },
  choiceCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  choiceLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginTop: 10,
  },
  feedbackBanner: {
    marginTop: 40,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "900",
  },
});
