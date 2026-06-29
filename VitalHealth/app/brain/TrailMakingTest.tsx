// app/brain/TrailMakingTest.tsx
import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Dimensions } from "react-native";
import { useTheme } from "../../context/ThemeContext";
import { useCognitive } from "../../context/CognitiveContext";
import { GameResult } from "./brainEngine";

type Props = {
  onDone: (result: GameResult) => void;
};

type NodeItem = {
  label: string;
  x: number; // percentage of container width
  y: number; // percentage of container height
};

const PART_A_NODES: NodeItem[] = [
  { label: "1", x: 20, y: 25 },
  { label: "2", x: 75, y: 15 },
  { label: "3", x: 80, y: 55 },
  { label: "4", x: 50, y: 35 },
  { label: "5", x: 20, y: 65 },
  { label: "6", x: 50, y: 75 },
];

const PART_B_NODES: NodeItem[] = [
  { label: "1", x: 15, y: 20 },
  { label: "A", x: 50, y: 15 },
  { label: "2", x: 80, y: 30 },
  { label: "B", x: 55, y: 45 },
  { label: "3", x: 80, y: 75 },
  { label: "C", x: 45, y: 80 },
  { label: "4", x: 15, y: 70 },
  { label: "D", x: 15, y: 45 },
];

const W_WIDTH = Dimensions.get("window").width;

export default function TrailMakingTest({ onDone }: Props) {
  const { theme } = useTheme();
  const { triggerHaptic, accessibilitySettings } = useCognitive();

  const isDark = theme === "dark";
  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#0f172a",
    subText: isDark ? "#94a3b8" : "#475569",
    border: isDark ? "#1e293b" : "#e2e8f0",
    accent: "#a855f7",
    success: "#22c55e",
    error: "#ef4444",
  };

  const [phase, setPhase] = useState<"instructions" | "countdown" | "partA" | "transition" | "partB" | "done">("instructions");
  const [countdown, setCountdown] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [clickedNodes, setClickedNodes] = useState<string[]>([]);
  const [wrongNode, setWrongNode] = useState<string | null>(null);

  // Timers
  const startTime = useRef(0);
  const totalDuration = useRef(0);

  // Countdown timer
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      setPhase("partA");
      setCurrentIndex(0);
      setClickedNodes([]);
      startTime.current = Date.now();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => c - 1);
      triggerHaptic("light");
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  const handleNodePress = (node: NodeItem) => {
    const activeNodes = phase === "partA" ? PART_A_NODES : PART_B_NODES;
    const currentTarget = activeNodes[currentIndex];

    if (node.label === currentTarget.label) {
      // Correct node tapped
      triggerHaptic("light");
      setClickedNodes((prev) => [...prev, node.label]);
      
      if (currentIndex + 1 >= activeNodes.length) {
        // Complete current part
        if (phase === "partA") {
          const duration = Date.now() - startTime.current;
          totalDuration.current += duration;
          setPhase("transition");
        } else {
          const duration = Date.now() - startTime.current;
          totalDuration.current += duration;
          finishGame();
        }
      } else {
        setCurrentIndex((i) => i + 1);
      }
    } else {
      // Incorrect node tapped
      triggerHaptic("warning");
      setErrorCount((e) => e + 1);
      setWrongNode(node.label);
      setTimeout(() => setWrongNode(null), 500);
    }
  };

  const startPartB = () => {
    setPhase("partB");
    setCurrentIndex(0);
    setClickedNodes([]);
    startTime.current = Date.now();
  };

  const finishGame = () => {
    setPhase("done");
    const avgTime = totalDuration.current; // Total test duration in ms

    // Normalised accuracy based on errors (capped)
    const accuracy = Math.max(0.1, 1 - (errorCount * 0.15));
    
    // Normalised score calculation: base speed + penalty for errors
    let score = Math.round(accuracy * 100);
    
    // Speed adjustments (Part A + Part B target total: ~20 seconds)
    if (avgTime > 30000) score -= 15;
    else if (avgTime < 18000 && score > 0) score += 5;
    score = Math.max(10, Math.min(100, score));

    onDone({
      game: "trail" as any,
      score,
      rawScore: errorCount,
      accuracy,
      avgTimeMs: avgTime / 14, // Average reaction time per node
      label: "Executive Function",
    });
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Executive Function</Text>
          <Text style={[styles.scienceText, { color: colors.accent }]}>Trail Making Test</Text>

          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Connect the scattered circles in the correct order.{"\n\n"}
            1️⃣ <Text style={{ fontWeight: "700" }}>Part A</Text>: Connect numbers in ascending order:{"\n"}
            <Text style={{ fontWeight: "800", color: colors.accent }}>1 → 2 → 3 → 4 → 5 → 6</Text>{"\n\n"}
            2️⃣ <Text style={{ fontWeight: "700" }}>Part B</Text>: Alternate numbers and letters:{"\n"}
            <Text style={{ fontWeight: "800", color: colors.accent }}>1 → A → 2 → B → 3 → C → 4 → D</Text>
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => setPhase("countdown")}
          >
            <Text style={styles.btnText}>START PART A</Text>
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

  if (phase === "transition") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Part A Complete!</Text>
          <Text style={[styles.scienceText, { color: colors.success }]}>Excellent progress</Text>
          
          <Text style={[styles.desc, { color: colors.subText, fontSize: accessibilitySettings.largeText ? 17 : 14 }]}>
            Now prepare for <Text style={{ fontWeight: "800", color: colors.accent }}>Part B</Text>.{"\n\n"}
            You must alternate between numbers and letters:{"\n\n"}
            <Text style={{ fontWeight: "900", color: colors.accent }}>1 → A → 2 → B → 3 → C → 4 → D</Text>
          </Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={startPartB}
          >
            <Text style={styles.btnText}>START PART B</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const nodes = phase === "partA" ? PART_A_NODES : PART_B_NODES;
  const targetLabel = nodes[currentIndex]?.label;

  return (
    <View style={[styles.gameContainer, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerText, { color: colors.text }]}>
          {phase === "partA" ? "Part A: Connect Numbers" : "Part B: Alternate Number/Letter"}
        </Text>
        <Text style={[styles.targetInfo, { color: colors.accent }]}>
          Target: {targetLabel}
        </Text>
      </View>

      <View style={styles.canvas}>
        {nodes.map((node) => {
          const isClicked = clickedNodes.includes(node.label);
          const isCurrent = node.label === targetLabel;
          const isWrong = wrongNode === node.label;

          let btnBg = colors.card;
          let textCol = colors.text;
          let borderCol = colors.border;

          if (isClicked) {
            btnBg = colors.success + "22";
            textCol = colors.success;
            borderCol = colors.success;
          } else if (isCurrent) {
            borderCol = colors.accent;
            textCol = colors.accent;
          } else if (isWrong) {
            btnBg = colors.error + "22";
            textCol = colors.error;
            borderCol = colors.error;
          }

          return (
            <TouchableOpacity
              key={node.label}
              style={[
                styles.node,
                {
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  backgroundColor: btnBg,
                  borderColor: borderCol,
                },
                accessibilitySettings.largeText && { width: 56, height: 56, borderRadius: 28 },
              ]}
              onPress={() => handleNodePress(node)}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  styles.nodeLabel,
                  { color: textCol },
                  accessibilitySettings.largeText && { fontSize: 20 },
                ]}
              >
                {node.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center" },
  gameContainer: { flex: 1, paddingVertical: 44, paddingHorizontal: 16 },
  center: { alignItems: "center" },
  card: { borderRadius: 28, padding: 28, borderWidth: 1, elevation: 4, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 4 },
  scienceText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginBottom: 20 },
  desc: { lineHeight: 24, marginBottom: 32, textAlign: "center" },
  btn: { borderRadius: 20, paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#ffffff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  countdownText: { fontSize: 100, fontWeight: "900", marginBottom: 16 },
  subText: { fontSize: 18, fontWeight: "600" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 8 },
  headerText: { fontSize: 14, fontWeight: "800" },
  targetInfo: { fontSize: 16, fontWeight: "900" },
  canvas: { flex: 1, position: "relative", borderWidth: 1, borderColor: "transparent" },
  node: { position: "absolute", width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, justifyContent: "center", alignItems: "center", elevation: 2 },
  nodeLabel: { fontSize: 16, fontWeight: "900" },
});
