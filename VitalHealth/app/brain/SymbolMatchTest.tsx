// app/brain/SymbolMatchTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Digit-Symbol Substitution Task (DSST)
// Cognitive Domain: Processing Speed / Complex Visual Scanning
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Vibration,
} from "react-native";
import Svg, { Path, Circle, Rect, G } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

const { width: W } = Dimensions.get("window");
const GAME_DURATION_SEC = 90;

type Phase = "instructions" | "playing" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function DigitSymbolSubstitutionTest({ onDone }: Props) {
  useStackBackHandler();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#3b82f6",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [legend, setLegend] = useState<Record<number, number>>({}); // digit maps to symbol index (1-9)
  const [targetSymbolIdx, setTargetSymbolIdx] = useState(1);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SEC);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate randomized legend mapping numbers 1-9 to unique symbol indices (1-9)
  const generateLegend = () => {
    const indices = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
    const newLegend: Record<number, number> = {};
    for (let i = 1; i <= 9; i++) {
      newLegend[i] = indices[i - 1];
    }
    setLegend(newLegend);
    return newLegend;
  };

  const startTest = () => {
    const activeLegend = generateLegend();
    setPhase("playing");
    setCorrectCount(0);
    setTotalCount(0);
    setTimeLeft(GAME_DURATION_SEC);
    pickNextTarget(activeLegend);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("done");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pickNextTarget = (activeLegend: Record<number, number>) => {
    const randomDigit = Math.floor(1 + Math.random() * 9);
    setTargetSymbolIdx(activeLegend[randomDigit]);
  };

  const handleKeyPress = (num: number) => {
    if (phase !== "playing") return;

    // Check if the typed number maps to the current target symbol index
    const correctSymbolIdx = legend[num];
    const isCorrect = correctSymbolIdx === targetSymbolIdx;

    try {
      Vibration.vibrate(10);
    } catch (_) {}

    if (isCorrect) setCorrectCount((c) => c + 1);
    setTotalCount((t) => t + 1);

    pickNextTarget(legend);
  };

  useEffect(() => {
    if (phase !== "done") return;

    // Clinical scoring: 55+ correct in 90 seconds is 100%
    const score = Math.max(10, Math.round(Math.min(100, (correctCount / 55) * 90 + 10)));
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

    setTimeout(() => {
      onDone({
        game: "symbol",
        score,
        rawScore: correctCount,
        accuracy,
        avgTimeMs: 0,
        label: "Digit-Symbol Substitution",
      });
    }, 500);
  }, [phase, correctCount, totalCount, onDone]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Detailed custom SVG Symbol Drawings
  const renderSymbol = (id: number, size = 30) => {
    const strokeColor = isDark ? "#ffffff" : "#020617";
    const center = size / 2;
    const padding = size * 0.2;

    switch (id) {
      case 1: // Delta / Triangle Loop
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${center},${padding} L ${size - padding},${size - padding} L ${padding},${size - padding} Z`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
            <Circle cx={center} cy={center + padding / 2} r="2" fill={strokeColor} />
          </Svg>
        );
      case 2: // Diamond Cross
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${center},${padding} L ${size - padding},${center} L ${center},${size - padding} L ${padding},${center} Z`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
            <Path d={`M ${center},${padding} L ${center},${size - padding}`} stroke={strokeColor} strokeWidth="1.5" />
            <Path d={`M ${padding},${center} L ${size - padding},${center}`} stroke={strokeColor} strokeWidth="1.5" />
          </Svg>
        );
      case 3: // Crescent Moon
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${center - 2},${padding} Q ${center + 12},${center} ${center - 2},${size - padding} Q ${center + 4},${center} ${center - 2},${padding}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
          </Svg>
        );
      case 4: // Multi-arm Asterisk
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path d={`M ${padding},${padding} L ${size - padding},${size - padding}`} stroke={strokeColor} strokeWidth="2.5" />
            <Path d={`M ${size - padding},${padding} L ${padding},${size - padding}`} stroke={strokeColor} strokeWidth="2.5" />
            <Path d={`M ${center},${padding} L ${center},${size - padding}`} stroke={strokeColor} strokeWidth="2.5" />
          </Svg>
        );
      case 5: // Nested Concentric Squares
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Rect x={padding} y={padding} width={size - 2 * padding} height={size - 2 * padding} fill="none" stroke={strokeColor} strokeWidth="2.5" />
            <Rect x={center - 3} y={center - 3} width="6" height="6" fill={strokeColor} />
          </Svg>
        );
      case 6: // Infinity Loop
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${padding + 2},${center} Q ${padding + 2},${padding} ${center},${center} T ${size - padding - 2},${center} Q ${size - padding - 2},${size - padding} ${center},${center} Z`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
          </Svg>
        );
      case 7: // Shield
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${padding},${padding} L ${size - padding},${padding} L ${size - padding},${center} Q ${size - padding},${size - padding} ${center},${size - padding} Q ${padding},${size - padding} ${padding},${center} Z`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
          </Svg>
        );
      case 8: // Hourglass Contour
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <Path
              d={`M ${padding},${padding} L ${size - padding},${padding} L ${center},${center} L ${padding},${size - padding} L ${size - padding},${size - padding} Z`}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2.5"
            />
          </Svg>
        );
      case 9: // Clover shape
        return (
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G transform={`translate(${center}, ${center}) scale(0.65)`}>
              <Circle cx="0" cy="-10" r="8" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Circle cx="-10" cy="0" r="8" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Circle cx="10" cy="0" r="8" fill="none" stroke={strokeColor} strokeWidth="3" />
              <Path d="M 0 0 L 0 16" stroke={strokeColor} strokeWidth="3" />
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
        <Text style={styles.gameTitle}>DIGIT-SYMBOL SUBSTITUTION (DSST)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Visual Scanning Speed</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            A legend key is shown at the top mapping numbers <Text style={{ fontWeight: "800" }}>1 to 9</Text> to unique geometric symbols.{"\n"}{"\n"}
            Use the numpad below to type the digit corresponding to the active <Text style={{ color: colors.accent, fontWeight: "900" }}>target symbol</Text> in the center.{"\n"}{"\n"}
            Match as many as you can before the <Text style={{ color: colors.accent, fontWeight: "900" }}>90-second</Text> countdown timer expires!
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.accent }]} onPress={startTest}>
            <Text style={styles.btnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Calculate remaining timer ratio for progress bar
  const timerRatio = timeLeft / GAME_DURATION_SEC;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>DIGIT-SYMBOL MATCHING</Text>

      {/* Timer progress bar & Count HUD */}
      <View style={styles.hudRow}>
        <Text style={[styles.hudText, { color: colors.text }]}>Time: {timeLeft}s</Text>
        <Text style={[styles.hudText, { color: colors.accent }]}>Matches: {correctCount}</Text>
      </View>

      <View style={styles.timerBarBg}>
        <View style={[styles.timerBarFill, { width: `${timerRatio * 100}%` }]} />
      </View>

      {/* Legend key container */}
      <View style={[styles.legendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.legendLabel, { color: colors.subText }]}>LEGEND KEY</Text>
        <View style={styles.legendGrid}>
          {Object.entries(legend).map(([num, symId]) => (
            <View key={num} style={styles.legendCell}>
              <View style={styles.symbolIconWrapper}>{renderSymbol(symId, 28)}</View>
              <Text style={[styles.legendNumber, { color: colors.text }]}>{num}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Target symbol display */}
      <View style={[styles.targetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.legendLabel, { color: colors.subText }]}>TARGET SYMBOL</Text>
        <View style={styles.targetSymbolContent}>
          {renderSymbol(targetSymbolIdx, 54)}
        </View>
      </View>

      {/* On-screen Keypad */}
      <View style={styles.numpad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <TouchableOpacity
            key={num}
            style={[styles.numBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleKeyPress(num)}
          >
            <Text style={[styles.numBtnText, { color: colors.text }]}>{num}</Text>
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
    color: "#3b82f6",
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
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  hudText: {
    fontSize: 13,
    fontWeight: "800",
  },
  timerBarBg: {
    height: 4,
    width: "100%",
    backgroundColor: "rgba(100,116,139,0.08)",
    borderRadius: 2,
    marginBottom: 16,
  },
  timerBarFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  legendCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    marginBottom: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  legendGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  legendCell: {
    alignItems: "center",
    gap: 4,
  },
  symbolIconWrapper: {
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  legendNumber: {
    fontSize: 12,
    fontWeight: "900",
  },
  targetCard: {
    width: 150,
    height: 120,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  targetSymbolContent: {
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: W - 48,
    gap: 12,
    justifyContent: "center",
    marginBottom: 30,
  },
  numBtn: {
    width: (W - 72) / 3,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  numBtnText: {
    fontSize: 20,
    fontWeight: "900",
  },
});
