// app/brain/PatternTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Matrix Reasoning Test (MRT)
// Cognitive Domain: Abstract Reasoning / Fluid Intelligence / Complex Cognition
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
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
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 12;

type Phase = "instructions" | "playing" | "done";

interface Props {
  onDone: (result: GameResult) => void;
}

interface MatrixTrial {
  type: "count" | "rotation" | "concentric" | "nesting" | "shading";
  contextCells: any[];
  options: any[];
  correctOptionIndex: number;
}

// Generate pool of 12 progressive randomized matrix reasoning puzzles
const generateMatrixTrials = (): MatrixTrial[] => {
  const trials: MatrixTrial[] = [];
  const types: Array<MatrixTrial["type"]> = ["count", "rotation", "concentric", "nesting", "shading"];
  
  for (let t = 0; t < 12; t++) {
    const type = types[t % types.length];
    let contextCells: any[] = [];
    let correctCell: any = null;
    let distractorCells: any[] = [];
    
    if (type === "count") {
      const steps = [-1, 1];
      const stepX = steps[Math.floor(Math.random() * steps.length)];
      const stepY = steps[Math.floor(Math.random() * steps.length)];
      
      let startCount = 3;
      for (let s = 1; s <= 6; s++) {
        let ok = true;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const val = s + r * stepY + c * stepX;
            if (val < 1 || val > 6) ok = false;
          }
        }
        if (ok) {
          startCount = s;
          break;
        }
      }
      
      const getCount = (r: number, c: number) => startCount + r * stepY + c * stepX;
      
      for (let idx = 0; idx < 8; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        contextCells.push({ count: getCount(r, c) });
      }
      correctCell = { count: getCount(2, 2) };
      
      const countsUsed = new Set<number>([correctCell.count]);
      while (distractorCells.length < 3) {
        const distCount = Math.floor(Math.random() * 6) + 1;
        if (!countsUsed.has(distCount)) {
          countsUsed.add(distCount);
          distractorCells.push({ count: distCount });
        }
      }
      
    } else if (type === "rotation") {
      const shapes: Array<"line" | "arrow" | "triangle"> = ["line", "arrow", "triangle"];
      const chosenShape = shapes[Math.floor(Math.random() * shapes.length)];
      
      const startAngle = [0, 45, 90, 135][Math.floor(Math.random() * 4)];
      const steps = [-90, -45, 45, 90];
      const stepX = steps[Math.floor(Math.random() * steps.length)];
      const stepY = steps[Math.floor(Math.random() * steps.length)];
      
      const getAngle = (r: number, c: number) => ((startAngle + r * stepY + c * stepX) % 360 + 360) % 360;
      
      for (let idx = 0; idx < 8; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        contextCells.push({ angle: getAngle(r, c), shape: chosenShape });
      }
      correctCell = { angle: getAngle(2, 2), shape: chosenShape };
      
      const anglesUsed = new Set<number>([correctCell.angle]);
      while (distractorCells.length < 3) {
        const distAngle = ((correctCell.angle + [45, 90, 135, 180, 225, 270][Math.floor(Math.random() * 6)]) % 360 + 360) % 360;
        if (!anglesUsed.has(distAngle)) {
          anglesUsed.add(distAngle);
          distractorCells.push({ angle: distAngle, shape: chosenShape });
        }
      }
      
    } else if (type === "concentric") {
      const shapes: Array<"circle" | "square"> = ["circle", "square"];
      const chosenShape = shapes[Math.floor(Math.random() * shapes.length)];
      
      const steps = [-1, 1];
      const stepX = steps[Math.floor(Math.random() * steps.length)];
      const stepY = steps[Math.floor(Math.random() * steps.length)];
      
      let startCount = 3;
      for (let s = 1; s <= 5; s++) {
        let ok = true;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const val = s + r * stepY + c * stepX;
            if (val < 1 || val > 5) ok = false;
          }
        }
        if (ok) {
          startCount = s;
          break;
        }
      }
      
      const getCount = (r: number, c: number) => startCount + r * stepY + c * stepX;
      
      for (let idx = 0; idx < 8; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        contextCells.push({ count: getCount(r, c), shape: chosenShape });
      }
      correctCell = { count: getCount(2, 2), shape: chosenShape };
      
      const countsUsed = new Set<number>([correctCell.count]);
      while (distractorCells.length < 3) {
        const distCount = Math.floor(Math.random() * 5) + 1;
        if (!countsUsed.has(distCount)) {
          countsUsed.add(distCount);
          distractorCells.push({ count: distCount, shape: chosenShape });
        }
      }
      
    } else if (type === "nesting") {
      const baseShapes = ["square", "triangle", "circle", "diamond"];
      const innerShapes = ["circle", "triangle", "square", "diamond"];
      
      const shufBase = [...baseShapes].sort(() => Math.random() - 0.5);
      const shufInner = [...innerShapes].sort(() => Math.random() - 0.5);
      
      const getBase = (r: number) => shufBase[r];
      const getInner = (c: number) => shufInner[c];
      
      for (let idx = 0; idx < 8; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        contextCells.push({ baseShape: getBase(r), innerShape: getInner(c) });
      }
      correctCell = { baseShape: getBase(2), innerShape: getInner(2) };
      
      distractorCells.push({ baseShape: getBase(2), innerShape: getInner(1) });
      distractorCells.push({ baseShape: getBase(1), innerShape: getInner(2) });
      distractorCells.push({ baseShape: getBase(0), innerShape: getInner(0) });
      
    } else if (type === "shading") {
      const baseShapes = ["square", "triangle", "circle"];
      const shadings = ["empty", "half", "full"];
      
      const shufBase = [...baseShapes].sort(() => Math.random() - 0.5);
      const shufShading = [...shadings].sort(() => Math.random() - 0.5);
      
      const getShape = (r: number) => shufBase[r];
      const getShading = (c: number) => shufShading[c];
      
      for (let idx = 0; idx < 8; idx++) {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        contextCells.push({ shape: getShape(r), shading: getShading(c) });
      }
      correctCell = { shape: getShape(2), shading: getShading(2) };
      
      distractorCells.push({ shape: getShape(2), shading: getShading(1) });
      distractorCells.push({ shape: getShape(1), shading: getShading(2) });
      distractorCells.push({ shape: getShape(0), shading: getShading(0) });
    }
    
    const allOptions = [correctCell, ...distractorCells];
    const shuffledOptions = [...allOptions].sort(() => Math.random() - 0.5);
    const correctOptionIndex = shuffledOptions.findIndex(
      (opt) => JSON.stringify(opt) === JSON.stringify(correctCell)
    );
    
    trials.push({
      type,
      contextCells,
      options: shuffledOptions,
      correctOptionIndex,
    });
  }
  
  return trials;
};

export default function MatrixReasoningTest({ onDone }: Props) {
  useStackBackHandler();
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
  const [trials, setTrials] = useState<MatrixTrial[]>([]);

  useEffect(() => {
    setTrials(generateMatrixTrials());
  }, []);

  const handleSelectOption = (optionIdx: number) => {
    const currentTrial = trials[trial];
    if (!currentTrial) return;

    const isCorrect = optionIdx === currentTrial.correctOptionIndex;

    try {
      Vibration.vibrate(isCorrect ? 12 : [0, 60]);
    } catch (_) {}

    let newCorrectCount = correctCount;
    if (isCorrect) {
      newCorrectCount += 1;
      setCorrectCount(newCorrectCount);
    }

    const nextTrial = trial + 1;
    if (nextTrial >= TOTAL_STIMULI) {
      setPhase("done");
      const score = Math.round((newCorrectCount / TOTAL_STIMULI) * 100);
      const accuracy = newCorrectCount / TOTAL_STIMULI;

      setTimeout(() => {
        onDone({
          game: "pattern",
          score,
          rawScore: newCorrectCount,
          accuracy,
          avgTimeMs: 0,
          label: "Matrix Reasoning Test",
        });
      }, 500);
    } else {
      setTrial(nextTrial);
    }
  };

  const renderCellGraphic = (cellData: any, size = 60) => {
    if (!cellData) return null;
    const stroke = isDark ? "#ffffff" : "#020617";
    const shapeFill = colors.shapeAccent;
    const center = size / 2;

    const renderDot = (cx: number, cy: number, r = 3) => (
      <Circle cx={cx} cy={cy} r={r} fill={stroke} />
    );

    if (cellData.count !== undefined && cellData.shape === undefined) {
      const count = cellData.count;
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

    if (cellData.angle !== undefined) {
      const { angle, shape } = cellData;
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G transform={`translate(${center}, ${center}) rotate(${angle})`}>
            {shape === "line" && (
              <>
                <Line x1="-20" y1="0" x2="20" y2="0" stroke={shapeFill} strokeWidth="3.5" />
                <Circle cx="20" cy="0" r="3.5" fill={stroke} />
              </>
            )}
            {shape === "arrow" && (
              <>
                <Line x1="-15" y1="0" x2="15" y2="0" stroke={shapeFill} strokeWidth="2.5" />
                <Polygon points="15,-5 23,0 15,5" fill={stroke} />
              </>
            )}
            {shape === "triangle" && (
              <Polygon points="0,-16 -12,12 12,12" fill="none" stroke={stroke} strokeWidth="2.5" />
            )}
          </G>
        </Svg>
      );
    }

    if (cellData.count !== undefined && cellData.shape !== undefined) {
      const { count, shape } = cellData;
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {[...Array(count)].map((_, i) => {
            const r = 5 + i * 4;
            if (shape === "circle") {
              return (
                <Circle
                  key={i}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={i % 2 === 0 ? stroke : shapeFill}
                  strokeWidth="1.5"
                />
              );
            } else {
              return (
                <Rect
                  key={i}
                  x={center - r}
                  y={center - r}
                  width={r * 2}
                  height={r * 2}
                  fill="none"
                  stroke={i % 2 === 0 ? stroke : shapeFill}
                  strokeWidth="1.5"
                />
              );
            }
          })}
        </Svg>
      );
    }

    if (cellData.baseShape !== undefined) {
      const { baseShape, innerShape } = cellData;
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {baseShape === "square" && <Rect x={center - 15} y={center - 15} width="30" height="30" fill="none" stroke={stroke} strokeWidth="2" />}
          {baseShape === "triangle" && <Polygon points={`${center},${center - 16} ${center - 16},${center + 14} ${center + 16},${center + 14}`} fill="none" stroke={stroke} strokeWidth="2" />}
          {baseShape === "circle" && <Circle cx={center} cy={center} r="15" fill="none" stroke={stroke} strokeWidth="2" />}
          {baseShape === "diamond" && <Polygon points={`${center},${center - 16} ${center + 16},${center} ${center},${center + 16} ${center - 16},${center}`} fill="none" stroke={stroke} strokeWidth="2" />}
          
          {innerShape === "circle" && <Circle cx={center} cy={center} r="7" fill={shapeFill} />}
          {innerShape === "triangle" && <Polygon points={`${center},${center - 7} ${center - 7},${center + 6} ${center + 7},${center + 6}`} fill={shapeFill} />}
          {innerShape === "square" && <Rect x={center - 5} y={center - 5} width="10" height="10" fill={shapeFill} />}
          {innerShape === "diamond" && <Polygon points={`${center},${center - 7} ${center + 7},${center} ${center},${center + 7} ${center - 7},${center}`} fill={shapeFill} />}
        </Svg>
      );
    }

    if (cellData.shading !== undefined) {
      const { shape, shading } = cellData;
      return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {shape === "square" && (
            <Rect
              x={center - 14}
              y={center - 14}
              width="28"
              height="28"
              fill={shading === "full" ? shapeFill : "none"}
              stroke={stroke}
              strokeWidth="2"
            />
          )}
          {shape === "triangle" && (
            <Polygon
              points={`${center},${center - 15} ${center - 15},${center + 13} ${center + 15},${center + 13}`}
              fill={shading === "full" ? shapeFill : "none"}
              stroke={stroke}
              strokeWidth="2"
            />
          )}
          {shape === "circle" && (
            <Circle
              cx={center}
              cy={center}
              r="14"
              fill={shading === "full" ? shapeFill : "none"}
              stroke={stroke}
              strokeWidth="2"
            />
          )}
          {shading === "half" && <Rect x={center - 14} y={center} width="28" height="14" fill={stroke} opacity="0.5" />}
        </Svg>
      );
    }

    return null;
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

  const currentTrial = trials[trial];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>MATRIX REASONING</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Pattern {trial + 1} of {TOTAL_STIMULI}
      </Text>

      {/* 3x3 Grid */}
      <View style={[styles.grid, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {currentTrial?.contextCells.map((cellData, cellIdx) => (
          <View key={cellIdx} style={[styles.cell, { borderColor: colors.border }]}>
            {renderCellGraphic(cellData)}
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
        {currentTrial?.options.map((optCellData, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSelectOption(idx)}
          >
            {renderCellGraphic(optCellData, 70)}
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