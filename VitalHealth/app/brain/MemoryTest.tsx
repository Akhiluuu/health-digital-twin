// app/brain/MemoryTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Visual Object Learning Test (VOLT)
// Cognitive Domain: Spatial Episodic Memory
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
import Svg, { Path, Polygon, Circle, Ellipse, Defs, LinearGradient, Stop, G, Line } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
type Phase = "instructions" | "learning" | "testing" | "done";

// Definition of 20 unique 3D Isometric shapes
interface VisualObject3D {
  id: number;
  type:
    | "cube"
    | "pyramid"
    | "cylinder"
    | "prism"
    | "hollowCube"
    | "stair"
    | "cross3D"
    | "torus"
    | "arrow3D"
    | "doubleCylinder"
    | "octahedron"
    | "cone"
    | "doublePyramid"
    | "hollowCylinder"
    | "hexPrism"
    | "stepsDouble"
    | "intersectingBlocks"
    | "star3D"
    | "wedge3D"
    | "ringShield";
  colors: [string, string, string]; // Top/light, Left/medium, Right/dark shades
}

const SHAPES_POOL: VisualObject3D[] = [
  // Learning set (ID 1-10)
  { id: 1, type: "cube", colors: ["#a78bfa", "#7c3aed", "#5b21b6"] },
  { id: 2, type: "pyramid", colors: ["#f472b6", "#be185d", "#9d174d"] },
  { id: 3, type: "cylinder", colors: ["#38bdf8", "#0284c7", "#0369a1"] },
  { id: 4, type: "prism", colors: ["#34d399", "#059669", "#064e3b"] },
  { id: 5, type: "cross3D", colors: ["#fbbf24", "#d97706", "#92400e"] },
  { id: 6, type: "torus", colors: ["#fb7185", "#e11d48", "#9f1239"] },
  { id: 7, type: "stair", colors: ["#818cf8", "#4f46e5", "#3730a3"] },
  { id: 8, type: "hollowCube", colors: ["#2dd4bf", "#0d9488", "#115e59"] },
  { id: 9, type: "arrow3D", colors: ["#fb923c", "#ea580c", "#9a3412"] },
  { id: 10, type: "doubleCylinder", colors: ["#a3e635", "#65a30d", "#3f6212"] },
  // Distractor set (ID 11-20)
  { id: 11, type: "octahedron", colors: ["#c084fc", "#9333ea", "#6b21a8"] },
  { id: 12, type: "cone", colors: ["#f472b6", "#db2777", "#881337"] },
  { id: 13, type: "doublePyramid", colors: ["#60a5fa", "#2563eb", "#1e3a8a"] },
  { id: 14, type: "hollowCylinder", colors: ["#4ade80", "#16a34a", "#14532d"] },
  { id: 15, type: "hexPrism", colors: ["#fcd34d", "#ca8a04", "#78350f"] },
  { id: 16, type: "stepsDouble", colors: ["#fda4af", "#f43f5e", "#be123c"] },
  { id: 17, type: "intersectingBlocks", colors: ["#93c5fd", "#3b82f6", "#1d4ed8"] },
  { id: 18, type: "star3D", colors: ["#ffe17d", "#e5b810", "#a17e00"] },
  { id: 19, type: "wedge3D", colors: ["#86efac", "#22c55e", "#166534"] },
  { id: 20, type: "ringShield", colors: ["#e9d5ff", "#c084fc", "#7e22ce"] },
];

type Props = {
  onDone: (result: GameResult) => void;
};

export default function VisualObjectLearningTest({ onDone }: Props) {
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
  const [learnIndex, setLearnIndex] = useState(0);
  const [testIndex, setTestIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<{ objId: number; response: number }>>([]);
  const [testSequence, setTestSequence] = useState<VisualObject3D[]>([]);
  const [learningSet, setLearningSet] = useState<VisualObject3D[]>([]);
  const [learningIds, setLearningIds] = useState<number[]>([]);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Initialize and randomize test trials (all 20 objects)
  useEffect(() => {
    // Select 10 random shapes to serve as the learning set
    const shuffledPool = [...SHAPES_POOL].sort(() => Math.random() - 0.5);
    const selectedLearning = shuffledPool.slice(0, 10);
    setLearningSet(selectedLearning);
    setLearningIds(selectedLearning.map(s => s.id));

    // Test sequence has all 20 shapes, shuffled
    const shuffledTest = [...SHAPES_POOL].sort(() => Math.random() - 0.5);
    setTestSequence(shuffledTest);
  }, []);

  // Learning timer: 2 seconds per shape
  useEffect(() => {
    if (phase !== "learning") return;

    if (learnIndex >= 10) {
      setPhase("testing");
      return;
    }

    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      setLearnIndex((i) => i + 1);
    }, 2000);

    return () => clearTimeout(t);
  }, [phase, learnIndex]);

  const handleTestAnswer = (responseVal: number) => {
    try {
      Vibration.vibrate(10);
    } catch (_) {}

    const currentObj = testSequence[testIndex];
    const newAnswers = [...answers, { objId: currentObj.id, response: responseVal }];
    setAnswers(newAnswers);

    const nextIndex = testIndex + 1;
    if (nextIndex >= 20) {
      // Confidence-weighted grading matching clinical guidelines
      let totalPoints = 0;
      newAnswers.forEach((ans) => {
        const isOld = learningIds.includes(ans.objId);
        if (isOld) {
          if (ans.response === 1) totalPoints += 10; // Definitely yes
          else if (ans.response === 2) totalPoints += 7;  // Probably yes
          else if (ans.response === 3) totalPoints += 2;  // Probably no
        } else {
          if (ans.response === 4) totalPoints += 10; // Definitely no
          else if (ans.response === 3) totalPoints += 7;  // Probably no
          else if (ans.response === 2) totalPoints += 2;  // Probably yes
        }
      });

      const maxPoints = 200;
      const finalScore = Math.round((totalPoints / maxPoints) * 100);
      const accuracy = totalPoints / maxPoints;

      setTimeout(() => {
        onDone({
          game: "memory",
          score: finalScore,
          rawScore: totalPoints,
          accuracy,
          avgTimeMs: 0,
          label: "Visual Object Learning",
        });
      }, 500);
      setPhase("done");
    } else {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      setTestIndex(nextIndex);
    }
  };

  const renderIsometricShape = (obj: VisualObject3D) => {
    const c = obj.colors;
    return (
      <Svg width="180" height="180" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="gradTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c[0]} />
            <Stop offset="100%" stopColor={c[1]} />
          </LinearGradient>
          <LinearGradient id="gradLeft" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={c[1]} />
            <Stop offset="100%" stopColor={c[2]} />
          </LinearGradient>
          <LinearGradient id="gradRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c[2]} stopOpacity="0.8" />
            <Stop offset="100%" stopColor={c[2]} />
          </LinearGradient>
        </Defs>

        {obj.type === "cube" && (
          <G>
            {/* Top face */}
            <Polygon points="50,15 85,35 50,55 15,35" fill="url(#gradTop)" />
            {/* Left face */}
            <Polygon points="15,35 50,55 50,90 15,70" fill="url(#gradLeft)" />
            {/* Right face */}
            <Polygon points="50,55 85,35 85,70 50,90" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "pyramid" && (
          <G>
            {/* Left face */}
            <Polygon points="50,15 15,70 50,85" fill="url(#gradLeft)" />
            {/* Right face */}
            <Polygon points="50,15 50,85 85,70" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "cylinder" && (
          <G>
            {/* Main body */}
            <Path d="M 25 35 L 25 75 A 25 10 0 0 0 75 75 L 75 35 Z" fill="url(#gradLeft)" />
            {/* Top ellipse */}
            <Ellipse cx="50" cy="35" rx="25" ry="10" fill="url(#gradTop)" />
          </G>
        )}

        {obj.type === "prism" && (
          <G>
            {/* Front triangular face */}
            <Polygon points="20,75 50,30 80,75" fill="url(#gradLeft)" />
            {/* Shaded side */}
            <Polygon points="50,30 80,75 90,65 60,20" fill="url(#gradRight)" />
            {/* Top edge */}
            <Polygon points="50,30 20,75 30,65 60,20" fill="url(#gradTop)" />
          </G>
        )}

        {obj.type === "cross3D" && (
          <G>
            <Polygon points="40,20 60,20 60,40 80,40 80,60 60,60 60,80 40,80 40,60 20,60 20,40 40,40" fill="url(#gradLeft)" />
            <Polygon points="60,20 60,40 80,40 80,45 60,45 60,25" fill="url(#gradTop)" />
            <Polygon points="80,40 80,60 85,55 85,35" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "torus" && (
          <G>
            {/* Outer ring */}
            <Circle cx="50" cy="50" r="35" fill="url(#gradLeft)" />
            {/* Inner cutout to form ring */}
            <Circle cx="50" cy="50" r="15" fill={colors.background} />
            {/* 3D shading ring */}
            <Circle cx="50" cy="48" r="33" fill="none" stroke="url(#gradTop)" strokeWidth="4" />
          </G>
        )}

        {obj.type === "stair" && (
          <G>
            {/* Top Step */}
            <Polygon points="35,30 65,30 50,45 20,45" fill="url(#gradTop)" />
            {/* Side step wall */}
            <Polygon points="20,45 50,45 50,75 20,75" fill="url(#gradLeft)" />
            {/* Right step facade */}
            <Polygon points="50,45 80,45 80,75 50,75" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "hollowCube" && (
          <G>
            <Polygon points="50,15 85,35 50,55 15,35" fill="url(#gradTop)" />
            <Polygon points="15,35 50,55 50,90 15,70" fill="url(#gradLeft)" />
            <Polygon points="50,55 85,35 85,70 50,90" fill="url(#gradRight)" />
            {/* Hollow center cut */}
            <Polygon points="50,30 65,40 50,50 35,40" fill={colors.background} />
          </G>
        )}

        {obj.type === "arrow3D" && (
          <G>
            <Polygon points="50,15 85,50 65,50 65,85 35,85 35,50 15,50" fill="url(#gradLeft)" />
            <Polygon points="50,15 85,50 90,45 55,10" fill="url(#gradTop)" />
          </G>
        )}

        {obj.type === "doubleCylinder" && (
          <G>
            {/* Back cylinder */}
            <Path d="M 45 20 L 45 60 A 15 6 0 0 0 75 60 L 75 20 Z" fill="url(#gradRight)" />
            <Ellipse cx="60" cy="20" rx="15" ry="6" fill="url(#gradTop)" />
            {/* Front cylinder */}
            <Path d="M 25 40 L 25 80 A 15 6 0 0 0 55 80 L 55 40 Z" fill="url(#gradLeft)" />
            <Ellipse cx="40" cy="40" rx="15" ry="6" fill="url(#gradTop)" />
          </G>
        )}

        {/* Fallback shapes for distractor sets to ensure distinct designs */}
        {obj.type === "octahedron" && (
          <G>
            <Polygon points="50,10 15,50 50,90" fill="url(#gradLeft)" />
            <Polygon points="50,10 85,50 50,90" fill="url(#gradRight)" />
            <Line x1="15" y1="50" x2="85" y2="50" stroke={c[0]} strokeWidth="2" />
          </G>
        )}

        {obj.type === "cone" && (
          <G>
            <Polygon points="50,15 20,75 80,75" fill="url(#gradLeft)" />
            <Ellipse cx="50" cy="75" rx="30" ry="10" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "doublePyramid" && (
          <G>
            <Polygon points="50,15 20,50 50,50" fill="url(#gradTop)" />
            <Polygon points="50,15 80,50 50,50" fill="url(#gradLeft)" />
            <Polygon points="50,85 20,50 50,50" fill="url(#gradRight)" />
            <Polygon points="50,85 80,50 50,50" fill="url(#gradTop)" />
          </G>
        )}

        {obj.type === "hollowCylinder" && (
          <G>
            <Path d="M 25 35 L 25 75 A 25 10 0 0 0 75 75 L 75 35 Z" fill="url(#gradLeft)" />
            <Ellipse cx="50" cy="35" rx="25" ry="10" fill="url(#gradTop)" />
            <Ellipse cx="50" cy="35" rx="12" ry="5" fill={colors.background} />
          </G>
        )}

        {obj.type === "hexPrism" && (
          <G>
            {/* Hexagonal top */}
            <Polygon points="50,15 75,25 75,45 50,55 25,45 25,25" fill="url(#gradTop)" />
            {/* Front facets */}
            <Polygon points="25,45 50,55 50,85 25,75" fill="url(#gradLeft)" />
            <Polygon points="50,55 75,45 75,75 50,85" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "stepsDouble" && (
          <G>
            <Polygon points="20,30 45,30 45,55 20,55" fill="url(#gradLeft)" />
            <Polygon points="45,55 70,55 70,80 45,80" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "intersectingBlocks" && (
          <G>
            <Polygon points="20,20 60,20 60,60 20,60" fill="url(#gradLeft)" />
            <Polygon points="40,40 80,40 80,80 40,80" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "star3D" && (
          <G>
            <Path d="M 50 10 L 60 40 L 90 50 L 60 60 L 50 90 L 40 60 L 10 50 L 40 40 Z" fill="url(#gradTop)" />
            <Circle cx="50" cy="50" r="10" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "wedge3D" && (
          <G>
            <Polygon points="15,75 50,15 85,75" fill="url(#gradLeft)" />
            <Polygon points="85,75 50,15 85,15" fill="url(#gradRight)" />
          </G>
        )}

        {obj.type === "ringShield" && (
          <G>
            <Circle cx="50" cy="50" r="38" fill="none" stroke="url(#gradTop)" strokeWidth="8" />
            <Polygon points="50,25 70,45 50,75 30,45" fill="url(#gradLeft)" />
          </G>
        )}
      </Svg>
    );
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>VISUAL OBJECT LEARNING TEST (VOLT)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Visuospatial Episodic Memory</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            1. You will be shown <Text style={{ color: colors.accent, fontWeight: "900" }}>10 unique 3D figures</Text> sequentially (2 seconds each). Memorize them.{"\n"}{"\n"}
            2. In the recall phase, you will view 20 figures. Some are old, others are distractors.{"\n"}{"\n"}
            3. Rate your recognition confidence: Definitely Yes, Probably Yes, Probably No, or Definitely No.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => setPhase("learning")}
          >
            <Text style={styles.btnText}>Start Memorizing</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === "learning") {
    const currentObj = learningSet[learnIndex];
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>MEMORIZATION PHASE</Text>
        <Text style={[styles.progressText, { color: colors.subText }]}>
          Figure {learnIndex + 1} of 10
        </Text>
        <Animated.View style={[styles.displayArea, { opacity: fadeAnim }]}>
          {currentObj && renderIsometricShape(currentObj)}
        </Animated.View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(learnIndex + 1) * 10}%` }]} />
        </View>
      </View>
    );
  }

  if (phase === "testing") {
    const currentObj = testSequence[testIndex];
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>RECALL TESTING</Text>
        <Text style={[styles.progressText, { color: colors.subText }]}>
          Figure {testIndex + 1} of 20
        </Text>

        <Animated.View style={[styles.displayArea, { opacity: fadeAnim }]}>
          {currentObj && renderIsometricShape(currentObj)}
        </Animated.View>

        <Text style={[styles.questionText, { color: colors.text }]}>
          Did you see this exact figure in the learning phase?
        </Text>

        <View style={styles.optionsContainer}>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionBtn, { backgroundColor: "#22c55e" }]} onPress={() => handleTestAnswer(1)}>
              <Text style={styles.optionText}>Definitely Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionBtn, { backgroundColor: "#8b5cf6" }]} onPress={() => handleTestAnswer(2)}>
              <Text style={styles.optionText}>Probably Yes</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.optionRow}>
            <TouchableOpacity style={[styles.optionBtn, { backgroundColor: "#f97316" }]} onPress={() => handleTestAnswer(3)}>
              <Text style={styles.optionText}>Probably No</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.optionBtn, { backgroundColor: "#ef4444" }]} onPress={() => handleTestAnswer(4)}>
              <Text style={styles.optionText}>Definitely No</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
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
  displayArea: {
    width: 220,
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(100,116,139,0.08)",
    width: "100%",
    borderRadius: 3,
    position: "absolute",
    bottom: 50,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#a855f7",
    borderRadius: 3,
  },
  questionText: {
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  optionsContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 40,
  },
  optionRow: {
    flexDirection: "row",
    gap: 12,
  },
  optionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  optionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
});