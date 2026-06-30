// app/brain/FlankerTest.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Balloon Analog Risk Test (BART)
// Cognitive Domain: Decision Making / Risk Assessment / Impulse Control
// Penn Computerized Neurocognitive Battery Protocol
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Animated,
  Vibration,
  ViewStyle,
} from "react-native";
import Svg, { Ellipse, Path, Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { GameResult } from "./brainEngine";

const { width: W } = Dimensions.get("window");
const TOTAL_BALLOONS = 30;

type Phase = "instructions" | "playing" | "done";

type Props = {
  onDone: (result: GameResult) => void;
};

export default function BalloonAnalogRiskTest({ onDone }: Props) {
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
  const [balloonIndex, setBalloonIndex] = useState(0);
  const [currentPumps, setCurrentPumps] = useState(0);
  const [popThreshold, setPopThreshold] = useState(8);
  const [collectedBank, setCollectedBank] = useState(0);
  const [balloonState, setBalloonState] = useState<"normal" | "popped" | "collected">("normal");

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const startNewBalloon = (index: number) => {
    setBalloonIndex(index);
    setCurrentPumps(0);
    // Random pop threshold between 4 and 14 pumps
    setPopThreshold(Math.floor(4 + Math.random() * 11));
    setBalloonState("normal");
    scaleAnim.setValue(1.0);
  };

  const handlePump = () => {
    if (balloonState !== "normal") return;

    const nextPumps = currentPumps + 1;
    if (nextPumps >= popThreshold) {
      // Pop!
      setBalloonState("popped");
      try {
        Vibration.vibrate([0, 80, 40, 120]);
      } catch (_) {}

      // Burst scale up and disappear animation
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.3, duration: 80, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        const nextIndex = balloonIndex + 1;
        if (nextIndex >= TOTAL_BALLOONS) {
          finishTest();
        } else {
          startNewBalloon(nextIndex);
        }
      }, 1000);
    } else {
      setCurrentPumps(nextPumps);
      try {
        Vibration.vibrate(8);
      } catch (_) {}

      Animated.spring(scaleAnim, {
        toValue: 1.0 + nextPumps * 0.12,
        useNativeDriver: true,
        tension: 120,
        friction: 6,
      }).start();
    }
  };

  const handleCollect = () => {
    if (balloonState !== "normal" || currentPumps === 0) return;

    const earned = currentPumps * 5;
    setCollectedBank((prev) => prev + earned);
    setBalloonState("collected");

    try {
      Vibration.vibrate(15);
    } catch (_) {}

    // Bounce and hide animation
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      const nextIndex = balloonIndex + 1;
      if (nextIndex >= TOTAL_BALLOONS) {
        finishTest();
      } else {
        startNewBalloon(nextIndex);
      }
    }, 1000);
  };

  const finishTest = () => {
    setPhase("done");

    // Standard BART normalized scoring
    const score = Math.max(10, Math.round(Math.min(100, (collectedBank / 700) * 90 + 10)));

    onDone({
      game: "flanker",
      score,
      rawScore: collectedBank,
      accuracy: collectedBank > 0 ? 1.0 : 0.0,
      avgTimeMs: 0,
      label: "Balloon Analog Risk Test",
    });
  };

  const renderGlossyBalloon = () => {
    return (
      <Svg width={180} height={200} viewBox="0 0 100 110">
        <Defs>
          <RadialGradient id="balloonGloss" cx="35%" cy="35%" rx="55%" ry="55%" fx="35%" fy="35%">
            <Stop offset="0%" stopColor="#f472b6" />
            <Stop offset="75%" stopColor="#db2777" />
            <Stop offset="100%" stopColor="#9d174d" />
          </RadialGradient>
        </Defs>

        {/* Hanging String */}
        <Path d="M 50 82 Q 46 95 52 108" fill="none" stroke="#94a3b8" strokeWidth={1.5} />

        {/* Main Balloon Body */}
        <Ellipse cx={50} cy={46} rx={34} ry={38} fill="url(#balloonGloss)" />

        {/* Small tie knot at bottom */}
        <Path d="M 46 82 L 54 82 L 50 77 Z" fill="#db2777" />

        {/* Gloss highlight reflection */}
        <Circle cx={36} cy={30} r={6} fill="#ffffff" opacity={0.45} />
        <Circle cx={33} cy={27} r={2.5} fill="#ffffff" opacity={0.6} />
      </Svg>
    );
  };

  const renderBurstGraphic = () => {
    return (
      <Svg width={180} height={200} viewBox="0 0 100 110">
        {/* Jagged Explosion/Burst Path */}
        <Path
          d="M 50,10 L 58,35 L 85,25 L 70,48 L 95,60 L 66,66 L 70,95 L 48,74 L 30,95 L 36,66 L 5,60 L 32,48 L 15,25 L 42,35 Z"
          fill="none"
          stroke="#ef4444"
          strokeWidth={3.5}
        />
        <Circle cx={50} cy={50} r={10} fill="#f59e0b" />
      </Svg>
    );
  };

  if (phase === "instructions") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={styles.gameTitle}>BALLOON ANALOG RISK TEST (BART)</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardHeading, { color: colors.text }]}>Decision Making under Risk</Text>
          <Text style={[styles.cardBody, { color: colors.subText }]}>
            In this task, press <Text style={{ color: colors.accent, fontWeight: "900" }}>Pump Balloon</Text> to inflate the balloon. Each pump adds <Text style={{ fontWeight: "800" }}>$5</Text> to your temporary bank.{"\n"}{"\n"}
            The balloon has a random popping threshold. If it pops, you lose the accumulated money for that balloon.{"\n"}{"\n"}
            Press <Text style={{ color: "#22c55e", fontWeight: "900" }}>Collect Reward</Text> to transfer your cash safely to the permanent bank before it pops. You have 30 balloons.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setPhase("playing");
              startNewBalloon(0);
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
      <Text style={styles.gameTitle}>BALLOON RISK TEST</Text>

      {/* HUD status */}
      <View style={styles.hudRow}>
        <Text style={[styles.hudText, { color: colors.text }]}>Balloon: {balloonIndex + 1} / {TOTAL_BALLOONS}</Text>
        <Text style={[styles.hudText, { color: colors.text }]}>Bank: <Text style={{ color: "#22c55e", fontWeight: "900" }}>${collectedBank}</Text></Text>
      </View>

      {/* Balloon Display Area */}
      <View style={styles.balloonArea}>
        {balloonState === "normal" && (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            {renderGlossyBalloon()}
            <View style={styles.balloonValueOverlay}>
              <Text style={styles.balloonValueText}>${currentPumps * 5}</Text>
            </View>
          </Animated.View>
        )}
        {balloonState === "popped" && (
          <View style={styles.center}>
            {renderBurstGraphic()}
            <Text style={styles.popLabel}>💥 POP!</Text>
          </View>
        )}
        {balloonState === "collected" && (
          <View style={styles.center}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              {renderGlossyBalloon()}
            </Animated.View>
            <Text style={styles.collectLabel}>💰 COLLECTED</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn as ViewStyle, { backgroundColor: colors.accent }]}
          onPress={handlePump}
          disabled={balloonState !== "normal"}
        >
          <Text style={styles.actionBtnText}>Pump Balloon</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionBtn as ViewStyle,
            { backgroundColor: "#22c55e", opacity: (balloonState !== "normal" || currentPumps === 0) ? 0.5 : 1 },
          ]}
          onPress={handleCollect}
          disabled={balloonState !== "normal" || currentPumps === 0}
        >
          <Text style={styles.actionBtnText}>Collect Reward</Text>
        </TouchableOpacity>
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
  hudRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 20,
  },
  hudText: {
    fontSize: 14,
    fontWeight: "800",
  },
  balloonArea: {
    width: 240,
    height: 240,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  balloonValueOverlay: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  balloonValueText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  popLabel: {
    position: "absolute",
    fontSize: 28,
    fontWeight: "900",
    color: "#ef4444",
  },
  collectLabel: {
    position: "absolute",
    fontSize: 20,
    fontWeight: "900",
    color: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginBottom: 30,
  },
  actionBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
