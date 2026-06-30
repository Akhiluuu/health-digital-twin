// app/brain/NBackTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Fractal 2-Back (F2B)
// Cognitive Domain: Working Memory Capacity / Executive Focus
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
import Svg, { Path, Circle, G, Polygon, Rect } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 62;
const STIMULUS_DURATION = 1500;
const INTER_STIMULUS_INTERVAL = 500;

type Phase = "instructions" | "playing" | "blank" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function Fractal2Back({ onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#6366f1",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [sequence, setSequence] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [hasResponded, setHasResponded] = useState(false);
  const [correctHits, setCorrectHits] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [correctRejections, setCorrectRejections] = useState(0);
  const [misses, setMisses] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseStartRef = useRef<number>(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Generate sequence of 62 trials containing ~30% true matches
  useEffect(() => {
    const seq: number[] = [];
    // Start with 2 random fractals (ids 1-6)
    seq.push(Math.floor(1 + Math.random() * 6));
    seq.push(Math.floor(1 + Math.random() * 6));

    for (let i = 2; i < TOTAL_STIMULI; i++) {
      const isMatch = Math.random() < 0.33; // 33% match rate
      if (isMatch) {
        seq.push(seq[i - 2]); // Match the element 2 positions back
      } else {
        // Pick a fractal different from the match
        let nextVal = Math.floor(1 + Math.random() * 6);
        while (nextVal === seq[i - 2]) {
          nextVal = Math.floor(1 + Math.random() * 6);
        }
        seq.push(nextVal);
      }
    }
    setSequence(seq);
  }, []);

  const startTest = () => {
    setPhase("playing");
    setIndex(0);
    showStimulus(0);
  };

  const showStimulus = (idx: number) => {
    setIndex(idx);
    setHasResponded(false);
    setPhase("playing");
    responseStartRef.current = Date.now();

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    // After 1500ms, transition to the blank ISI screen
    timerRef.current = setTimeout(() => {
      // Evaluate if the user missed a true match
      if (idx >= 2) {
        const isTrueMatch = sequence[idx] === sequence[idx - 2];
        if (isTrueMatch && !hasResponded) {
          setMisses((m) => m + 1);
        } else if (!isTrueMatch && !hasResponded) {
          setCorrectRejections((c) => c + 1);
        }
      }

      setPhase("blank");

      // 500ms Blank screen Inter-Stimulus Interval (ISI)
      timerRef.current = setTimeout(() => {
        const nextIdx = idx + 1;
        if (nextIdx >= TOTAL_STIMULI) {
          finishTest();
        } else {
          showStimulus(nextIdx);
        }
      }, INTER_STIMULUS_INTERVAL);
    }, STIMULUS_DURATION);
  };

  const handleMatchResponse = () => {
    if (hasResponded || phase !== "playing") return;
    setHasResponded(true);

    const isTrueMatch = index >= 2 && sequence[index] === sequence[index - 2];

    try {
      Vibration.vibrate(isTrueMatch ? 15 : [0, 80]);
    } catch (_) {}

    if (isTrueMatch) {
      setCorrectHits((h) => h + 1);
    } else {
      setFalseAlarms((f) => f + 1);
    }
  };

  const finishTest = () => {
    setPhase("done");
    if (timerRef.current) clearTimeout(timerRef.current);

    // Score evaluation: hits / total possible match conditions
    const matchCount = sequence.slice(2).filter((val, i) => val === sequence[i]).length;
    const hitRate = matchCount > 0 ? correctHits / matchCount : 1.0;
    const finalScore = Math.max(10, Math.round(hitRate * 90 + 10 - falseAlarms * 3));

    onDone({
      game: "nback",
      score: finalScore,
      rawScore: correctHits,
      accuracy: hitRate,
      avgTimeMs: 0,
      label: "Fractal 2-Back",
    });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 6 Custom High-Fidelity SVG Fractal Patterns
  const renderFractal = (id: number) => {
    switch (id) {
      case 1: // Concentric Rotated Stars (Geometric Sun Mandala)
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,50)">
              <Circle cx="0" cy="0" r="45" fill="none" stroke="#6366f1" strokeWidth="2.5" />
              {[0, 30, 60, 90, 120, 150].map((angle) => (
                <Polygon
                  key={angle}
                  points="-30,-10 30,-10 0,40"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.5"
                  transform={`rotate(${angle})`}
                  opacity="0.85"
                />
              ))}
              <Circle cx="0" cy="0" r="10" fill="#6366f1" />
            </G>
          </Svg>
        );
      case 2: // Sierpinski Hexagon Mandala
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,50)">
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <G key={angle} transform={`rotate(${angle})`}>
                  <Polygon points="0,0 20,-35 40,0" fill="none" stroke="#ec4899" strokeWidth="2" />
                  <Circle cx="20" cy="-35" r="5" fill="#f43f5e" />
                </G>
              ))}
              <Circle cx="0" cy="0" r="18" fill="none" stroke="#f43f5e" strokeWidth="1.5" />
            </G>
          </Svg>
        );
      case 3: // Flower of Life Intersecting Rings
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,50)">
              <Circle cx="0" cy="0" r="15" fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <Circle
                  key={angle}
                  cx={18 * Math.cos((angle * Math.PI) / 180)}
                  cy={18 * Math.sin((angle * Math.PI) / 180)}
                  r="18"
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth="1.5"
                />
              ))}
            </G>
          </Svg>
        );
      case 4: // Concentric Spindle Wheel
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,50)">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <G key={angle} transform={`rotate(${angle})`}>
                  <Path d="M 0 0 L 0 -45 L 12 -35 Z" fill="none" stroke="#10b981" strokeWidth="1.8" />
                  <Circle cx="0" cy="-45" r="4" fill="#10b981" />
                </G>
              ))}
              <Circle cx="0" cy="0" r="8" fill="none" stroke="#34d399" strokeWidth="2" />
            </G>
          </Svg>
        );
      case 5: // Recursive Concentric Triangles (Gasket)
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,55)">
              <Polygon points="0,-45 -40,25 40,25" fill="none" stroke="#f59e0b" strokeWidth="2.5" />
              <Polygon points="0,25 -20,-10 20,-10" fill="none" stroke="#fcd34d" strokeWidth="2" />
              <Circle cx="0" cy="-45" r="4" fill="#f59e0b" />
              <Circle cx="-40" cy="25" r="4" fill="#f59e0b" />
              <Circle cx="40" cy="25" r="4" fill="#f59e0b" />
            </G>
          </Svg>
        );
      case 6: // Spiral Star Matrix
        return (
          <Svg width="180" height="180" viewBox="0 0 100 100">
            <G transform="translate(50,50)">
              {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((angle, idx) => (
                <Rect
                  key={angle}
                  x="-15"
                  y="-15"
                  width="30"
                  height="30"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.2"
                  transform={`rotate(${angle}) scale(${1 - idx * 0.07})`}
                />
              ))}
            </G>
          </Svg>
        );
      default:
        return null;
    }
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>FRACTAL 2-BACK (F2B)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Working Memory Probe</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            A sequence of complex geometric fractals will flash on screen.{"\n"}{"\n"}
            Tap the <Text style={{ color: colors.accent, fontWeight: "900" }}>MATCH</Text> button if the active fractal is exactly the same as the one shown <Text style={{ color: colors.accent, fontWeight: "900" }}>2 items ago</Text>.{"\n"}{"\n"}
            React quickly before the stimulus transitions. The test contains 62 consecutive trials.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.accent }]} onPress={startTest}>
            <Text style={styles.btnText}>Start Test</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentFractalId = sequence[index];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>FRACTAL 2-BACK</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Stimulus {index + 1} of {TOTAL_STIMULI}
      </Text>

      {/* Fractal screen area */}
      <View style={[styles.displayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {phase === "playing" ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            {renderFractal(currentFractalId)}
          </Animated.View>
        ) : (
          <View style={styles.blankScreen} />
        )}
      </View>

      {/* Action Button */}
      <TouchableOpacity
        style={[
          styles.matchBtn,
          {
            backgroundColor: hasResponded ? "#475569" : colors.accent,
            opacity: phase === "blank" ? 0.5 : 1,
          },
        ]}
        onPress={handleMatchResponse}
        disabled={hasResponded || phase === "blank"}
      >
        <Text style={styles.matchBtnText}>{hasResponded ? "REGISTERED" : "MATCH (2-BACK)"}</Text>
      </TouchableOpacity>
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
    color: "#6366f1",
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
    marginBottom: 30,
  },
  displayCard: {
    width: W - 48,
    height: 240,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    elevation: 2,
    overflow: "hidden",
  },
  blankScreen: {
    width: 180,
    height: 180,
  },
  matchBtn: {
    width: W - 48,
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  matchBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});
