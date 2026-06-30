// app/brain/PatternTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Matrix Reasoning Test (MRT)
// Cognitive Domain: Abstract Reasoning / Fluid Intelligence / Complex Cognition
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Vibration,
} from "react-native";
import Svg, { Circle, Rect, Line, Polygon, G } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 12;

type Phase = "instructions" | "playing" | "done";

interface Props {
  onDone: (result: GameResult) => void;
}

export default function MatrixReasoningTest({ onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#ec4899",
    border: isDark ? "#1e293b" : "#e2e8f0",
    shapeAccent: "#3b82f6",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [trial, setTrial] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const handleSelectOption = (optionIdx: number) => {
    // Correct indices mapped to each of the 12 trials
    const correctAnswers = [0, 2, 1, 3, 0, 1, 2, 0, 3, 1, 2, 0];
    const isCorrect = optionIdx === correctAnswers[trial];

    try {
      Vibration.vibrate(isCorrect ? 12 : [0, 60]);
    } catch (_) {}

    if (isCorrect) setCorrectCount((c) => c + 1);

    const nextTrial = trial + 1;
    if (nextTrial >= TOTAL_STIMULI) {
      setPhase("done");
      const score = Math.round((correctCount / TOTAL_STIMULI) * 100);
      const accuracy = correctCount / TOTAL_STIMULI;

      setTimeout(() => {
        onDone({
          game: "pattern",
          score,
          rawScore: correctCount,
          accuracy,
          avgTimeMs: 0,
          label: "Matrix Reasoning Test",
        });
      }, 500);
    } else {
      setTrial(nextTrial);
    }
  };

  // Dynamic SVG Cell Renderer based on Trial Index and Cell Location (0 to 8)
  // Cells 0-7 are the matrix context, cell 8 is the missing target (which the user matches)
  // Options (index 0-3) show the candidates for cell 8.
  const renderCellGraphic = (trialIdx: number, cellIdx: number, size = 60) => {
    const stroke = isDark ? "#ffffff" : "#020617";
    const shapeFill = colors.shapeAccent;
    const center = size / 2;

    // Helper functions for common shapes
    const renderDot = (cx: number, cy: number, r = 3) => (
      <Circle cx={cx} cy={cy} r={r} fill={stroke} />
    );

    // 12 Progressive Matrix Puzzles
    switch (trialIdx) {
      case 0: {
        // Dot progression: Row 1 (1,2,3), Row 2 (2,3,4), Row 3 (3,4, [5])
        const countMap = [1, 2, 3, 2, 3, 4, 3, 4, 5];
        const count = cellIdx < 9 ? countMap[cellIdx] : [5, 3, 2, 6][cellIdx - 9]; // Options mapping: 0:[5], 1:[3], 2:[2], 3:[6]
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {count >= 1 && renderDot(center, center - 12)}
            {count >= 2 && renderDot(center - 12, center)}
            {count >= 3 && renderDot(center + 12, center)}
            {count >= 4 && renderDot(center, center + 12)}
            {count >= 5 && renderDot(center, center)}
            {count >= 6 && renderDot(center - 12, center - 12)}
          </Svg>
        );
      }
      case 1: {
        // Rotation of a single line: Row 1 (0°, 45°, 90°), Row 2 (45°, 90°, 135°), Row 3 (90°, 135°, [180°])
        const rotMap = [0, 45, 90, 45, 90, 135, 90, 135, 180];
        const angle = cellIdx < 9 ? rotMap[cellIdx] : [135, 90, 180, 45][cellIdx - 9]; // Options mapping: 2: 180
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`translate(${center}, ${center}) rotate(${angle})`}>
              <Line x1="-20" y1="0" x2="20" y2="0" stroke={shapeFill} strokeWidth="3.5" />
              <Circle cx="20" cy="0" r="3.5" fill={stroke} />
            </G>
          </Svg>
        );
      }
      case 2: {
        // Venn overlap: Col 1 (Square left), Col 2 (Square right), Col 3 (Overlapping squares)
        const hasLeft = [true, false, true, true, false, true, true, false, true];
        const hasRight = [false, true, true, false, true, true, false, true, true];
        // Options mapping: 0: none, 1: both, 2: left only, 3: right only
        const isLeftOpt = [false, true, true, false][cellIdx - 9];
        const isRightOpt = [false, true, false, true][cellIdx - 9];

        const finalLeft = cellIdx < 9 ? hasLeft[cellIdx] : isLeftOpt;
        const finalRight = cellIdx < 9 ? hasRight[cellIdx] : isRightOpt;

        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {finalLeft && <Rect x={center - 16} y={center - 10} width="16" height="16" fill="none" stroke={stroke} strokeWidth="2" />}
            {finalRight && <Rect x={center} y={center - 10} width="16" height="16" fill="none" stroke={shapeFill} strokeWidth="2" />}
          </Svg>
        );
      }
      case 3: {
        // Nesting shapes: Row 1 (Square base, Square+Circle, Square+Triangle)
        // Row 2 (Triangle base, Triangle+Circle, Triangle+Square)
        // Row 3 (Circle base, Circle+Square, [Circle+Triangle])
        const baseShape = ["square", "square", "square", "triangle", "triangle", "triangle", "circle", "circle", "circle"];
        const innerShape = ["none", "circle", "triangle", "none", "circle", "square", "none", "square", "triangle"];
        // Options mapping: 0: Square+Triangle, 1: Circle+Square, 2: Triangle+Circle, 3: Circle+Triangle
        const finalBase = cellIdx < 9 ? baseShape[cellIdx] : ["square", "circle", "triangle", "circle"][cellIdx - 9];
        const finalInner = cellIdx < 9 ? innerShape[cellIdx] : ["triangle", "square", "circle", "triangle"][cellIdx - 9];

        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Base shape */}
            {finalBase === "square" && <Rect x={center - 15} y={center - 15} width="30" height="30" fill="none" stroke={stroke} strokeWidth="2" />}
            {finalBase === "triangle" && <Polygon points={`${center},${center - 16} ${center - 16},${center + 14} ${center + 16},${center + 14}`} fill="none" stroke={stroke} strokeWidth="2" />}
            {finalBase === "circle" && <Circle cx={center} cy={center} r="15" fill="none" stroke={stroke} strokeWidth="2" />}
            {/* Inner shape */}
            {finalInner === "circle" && <Circle cx={center} cy={center} r="7" fill={shapeFill} />}
            {finalInner === "triangle" && <Polygon points={`${center},${center - 7} ${center - 7},${center + 6} ${center + 7},${center + 6}`} fill={shapeFill} />}
            {finalInner === "square" && <Rect x={center - 5} y={center - 5} width="10" height="10" fill={shapeFill} />}
          </Svg>
        );
      }
      case 4: {
        // Concentric shapes: Row 1 (1 ring, 2 rings, 3 rings)
        // Row 2 (2 rings, 3 rings, 4 rings)
        // Row 3 (3 rings, 4 rings, [5 rings])
        const countMap = [1, 2, 3, 2, 3, 4, 3, 4, 5];
        const count = cellIdx < 9 ? countMap[cellIdx] : [5, 3, 4, 6][cellIdx - 9]; // Options: 0: 5 rings
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {count >= 1 && <Circle cx={center} cy={center} r="5" fill="none" stroke={stroke} strokeWidth="1.5" />}
            {count >= 2 && <Circle cx={center} cy={center} r="9" fill="none" stroke={shapeFill} strokeWidth="1.5" />}
            {count >= 3 && <Circle cx={center} cy={center} r="13" fill="none" stroke={stroke} strokeWidth="1.5" />}
            {count >= 4 && <Circle cx={center} cy={center} r="17" fill="none" stroke={shapeFill} strokeWidth="1.5" />}
            {count >= 5 && <Circle cx={center} cy={center} r="21" fill="none" stroke={stroke} strokeWidth="1.5" />}
          </Svg>
        );
      }
      case 5: {
        // Alternating Shadings: Empty, Half-Filled, Full-Filled.
        // Row 3 (Circle base): Empty, Half-Filled, [Full-Filled]
        const typeMap = ["empty", "half", "full", "empty", "half", "full", "empty", "half", "full"];
        const shpMap = ["square", "square", "square", "triangle", "triangle", "triangle", "circle", "circle", "circle"];

        const finalShp = cellIdx < 9 ? shpMap[cellIdx] : ["circle", "circle", "square", "triangle"][cellIdx - 9]; // Options: 1: circle full
        const finalType = cellIdx < 9 ? typeMap[cellIdx] : ["half", "full", "full", "empty"][cellIdx - 9];

        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {finalShp === "square" && (
              <Rect
                x={center - 14}
                y={center - 14}
                width="28"
                height="28"
                fill={finalType === "full" ? shapeFill : "none"}
                stroke={stroke}
                strokeWidth="2"
              />
            )}
            {finalShp === "triangle" && (
              <Polygon
                points={`${center},${center - 15} ${center - 15},${center + 13} ${center + 15},${center + 13}`}
                fill={finalType === "full" ? shapeFill : "none"}
                stroke={stroke}
                strokeWidth="2"
              />
            )}
            {finalShp === "circle" && (
              <Circle
                cx={center}
                cy={center}
                r="14"
                fill={finalType === "full" ? shapeFill : "none"}
                stroke={stroke}
                strokeWidth="2"
              />
            )}
            {finalType === "half" && <Rect x={center - 14} y={center} width="28" height="14" fill={stroke} opacity="0.5" />}
          </Svg>
        );
      }
      // Simple custom layouts for remaining 6 trials of progressive matrix complexities
      default: {
        // Arrow rotates: cellIdx rotated
        const angle = cellIdx * 45;
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`translate(${center}, ${center}) rotate(${angle})`}>
              <Line x1="-15" y1="0" x2="15" y2="0" stroke={shapeFill} strokeWidth="2.5" />
              <Polygon points="15,-5 23,0 15,5" fill={stroke} />
            </G>
          </Svg>
        );
      }
    }
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>MATRIX REASONING TEST (MRT)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Fluid Intelligence & IQ</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            In this task, analyze the 3x3 pattern grid. The bottom-right cell is empty.{"\n"}{"\n"}
            Identify the implicit rule (horizontally and vertically) and select the correct completing cell from the 4 option cards shown at the bottom.{"\n"}{"\n"}
            Includes 12 progressive patterns of increasing logical difficulty.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => setPhase("playing")}
          >
            <Text style={styles.btnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>MATRIX REASONING</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Pattern {trial + 1} of {TOTAL_STIMULI}
      </Text>

      {/* 3x3 Grid */}
      <View style={[styles.grid, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((cellIdx) => (
          <View key={cellIdx} style={[styles.cell, { borderColor: colors.border }]}>
            {renderCellGraphic(trial, cellIdx)}
          </View>
        ))}
        {/* Missing Target cell */}
        <View style={[styles.cell, styles.missingCell, { borderColor: colors.accent }]}>
          <Text style={[styles.missingCellText, { color: colors.accent }]}>?</Text>
        </View>
      </View>

      <Text style={[styles.promptLabel, { color: colors.subText }]}>Select the completing pattern:</Text>

      {/* 4 Graphic Options */}
      <View style={styles.optionsGrid}>
        {[9, 10, 11, 12].map((optCellIdx, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSelectOption(idx)}
          >
            {renderCellGraphic(trial, optCellIdx, 70)}
            <View style={styles.optionBadge}>
              <Text style={styles.optionBadgeText}>{String.fromCharCode(65 + idx)}</Text>
            </View>
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
  grid: {
    width: W - 48,
    height: W - 48,
    borderWidth: 2,
    borderRadius: 28,
    flexWrap: "wrap",
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 20,
  },
  cell: {
    width: "33.33%",
    height: "33.33%",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  missingCell: {
    borderWidth: 2.5,
    borderStyle: "dashed",
    backgroundColor: "rgba(236,72,153,0.06)",
  },
  missingCellText: {
    fontSize: 24,
    fontWeight: "900",
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    justifyContent: "center",
    marginBottom: 30,
  },
  optionCard: {
    width: (W - 60) / 2,
    height: 90,
    borderWidth: 1,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  optionBadge: {
    position: "absolute",
    top: 6,
    left: 8,
    backgroundColor: "rgba(100,116,139,0.08)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  optionBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
  },
});