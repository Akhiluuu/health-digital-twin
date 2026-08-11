// app/brain/TrailMakingTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Line Orientation Test (LOT)
// Cognitive Domain: Spatial Judgement / Visuospatial Processing
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
import Svg, { Line, Circle, G, Text as SvgText } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

const { width: W } = Dimensions.get("window");
const TOTAL_STIMULI = 12;

type Phase = "instructions" | "playing" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function LineOrientationTest({ onDone }: Props) {
  useStackBackHandler();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    background: isDark ? "#020617" : "#f8fafc",
    card: isDark ? "#0f172a" : "#ffffff",
    text: isDark ? "#ffffff" : "#020617",
    subText: isDark ? "#94a3b8" : "#475569",
    accent: "#f43f5e",
    gaugeTarget: "#3b82f6",
    gaugeAdjust: "#ec4899",
    border: isDark ? "#1e293b" : "#e2e8f0",
  };

  const [phase, setPhase] = useState<Phase>("instructions");
  const [trial, setTrial] = useState(0);
  const [targetAngle, setTargetAngle] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(90);
  const [accumulatedError, setAccumulatedError] = useState(0);

  // Generate target angle (avoiding straight horizontal/vertical for better testing)
  const setupTrial = (trialIndex: number) => {
    let angle = Math.floor(15 + Math.random() * 150);
    // Avoid exact 90 degrees
    while (Math.abs(angle - 90) < 10) {
      angle = Math.floor(15 + Math.random() * 150);
    }
    setTargetAngle(angle);
    // Start the adjust line at a randomized offset
    setCurrentAngle(Math.random() < 0.5 ? 0 : 180);
  };

  const handleSubmit = () => {
    const error = Math.abs(targetAngle - currentAngle);
    setAccumulatedError((e) => e + error);

    try {
      Vibration.vibrate(15);
    } catch (_) {}

    const nextTrial = trial + 1;
    if (nextTrial >= TOTAL_STIMULI) {
      setPhase("done");
      const meanError = (accumulatedError + error) / TOTAL_STIMULI;
      // Clinical scoring: 100 for 0 degree mean error, scaling down
      const score = Math.max(10, Math.round(100 - meanError * 3));

      setTimeout(() => {
        onDone({
          game: "trail",
          score,
          rawScore: Math.round(meanError),
          accuracy: Math.max(0, 1 - meanError / 90),
          avgTimeMs: 0,
          label: "Line Orientation Test",
        });
      }, 500);
    } else {
      setTrial(nextTrial);
      setupTrial(nextTrial);
    }
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>LINE ORIENTATION TEST (LOT)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Spatial Judgement</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            You will be shown two gauges side by side.{"\n"}{"\n"}
            The left gauge displays a blue stationary <Text style={{ color: colors.gaugeTarget, fontWeight: "900" }}>target line</Text>.{"\n"}{"\n"}
            Use the slider and fine-tuning arrow buttons to rotate the pink <Text style={{ color: colors.gaugeAdjust, fontWeight: "900" }}>adjustable line</Text> on the right until it is perfectly parallel to the target.{"\n"}{"\n"}
            Tap "Submit Alignment" for each of the 12 trials.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setPhase("playing");
              setupTrial(0);
            }}
          >
            <Text style={styles.btnText}>Start Assessment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={styles.gameTitle}>LINE ORIENTATION</Text>
      <Text style={[styles.progressText, { color: colors.subText }]}>
        Trial {trial + 1} of {TOTAL_STIMULI}
      </Text>

      {/* Gauges Side-by-Side */}
      <View style={styles.gaugesRow}>
        {/* Left Target Gauge */}
        <View style={[styles.gaugeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.gaugeLabel, { color: colors.subText }]}>TARGET</Text>
          <Svg width="110" height="110" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" fill="none" stroke={colors.border} strokeWidth="1.5" />
            <Circle cx="50" cy="50" r="4" fill={colors.subText} />
            {/* Target Line */}
            <G transform={`translate(50,50) rotate(${-targetAngle})`}>
              <Line x1="-40" y1="0" x2="40" y2="0" stroke={colors.gaugeTarget} strokeWidth="3" />
            </G>
          </Svg>
        </View>

        {/* Right Adjust Gauge */}
        <View style={[styles.gaugeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.gaugeLabel, { color: colors.subText }]}>ADJUST</Text>
          <Svg width="110" height="110" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" fill="none" stroke={colors.border} strokeWidth="1.5" />
            <Circle cx="50" cy="50" r="4" fill={colors.subText} />
            {/* Adjustable Line */}
            <G transform={`translate(50,50) rotate(${-currentAngle})`}>
              <Line x1="-40" y1="0" x2="40" y2="0" stroke={colors.gaugeAdjust} strokeWidth="3" />
            </G>
          </Svg>
        </View>
      </View>

      <Text style={[styles.angleText, { color: colors.text }]}>
        Current Angle: <Text style={{ fontWeight: "900", color: colors.gaugeAdjust }}>{currentAngle}°</Text>
      </Text>

      {/* Adjuster controls */}
      <View style={styles.controlsContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={180}
          step={1}
          value={currentAngle}
          onValueChange={(val) => setCurrentAngle(Math.round(val))}
          minimumTrackTintColor={colors.gaugeAdjust}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
        />

        {/* Fine Tuning Buttons */}
        <View style={styles.fineTuneRow}>
          <TouchableOpacity
            style={[styles.tuneBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setCurrentAngle((a) => Math.max(0, a - 1))}
          >
            <Text style={[styles.tuneBtnText, { color: colors.text }]}>- 1°</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tuneBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setCurrentAngle((a) => Math.min(180, a + 1))}
          >
            <Text style={[styles.tuneBtnText, { color: colors.text }]}>+ 1°</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.accent }]}
        onPress={handleSubmit}
      >
        <Text style={styles.btnText}>Submit Alignment</Text>
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
    color: "#f43f5e",
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
  gaugesRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  gaugeCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 18,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gaugeLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  angleText: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 20,
  },
  controlsContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 32,
  },
  slider: {
    width: "100%",
    height: 40,
    marginBottom: 16,
  },
  fineTuneRow: {
    flexDirection: "row",
    gap: 20,
  },
  tuneBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 20,
    elevation: 1,
  },
  tuneBtnText: {
    fontSize: 12,
    fontWeight: "900",
  },
  submitBtn: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});
