// app/calorie-intelligence.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Calorie Intelligence Screen — synced with NutritionContext
// • Macro Targets section now shows ACTUAL consumed vs target from nutrition page
// • Live progress bars, over/under indicators, colour-coded status
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useEffect } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Defs, Stop, LinearGradient as SvgGrad } from "react-native-svg";

import { useNutrition } from "../context/NutritionContext";
import { useProfile } from "../context/ProfileContext";
import { useSteps } from "../context/StepContext";
import { useTheme } from "../context/ThemeContext";

// 🔹 Firebase Imports
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";

const { width } = Dimensions.get("window");

// ─── Calorie science ─────────────────────────────────────────────────────────
function calcBMR(weightKg: number, heightCm: number, ageYears: number, gender: string): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(gender.toLowerCase().startsWith("f") ? base - 161 : base + 5);
}

const ACTIVITY_LEVELS = [
  { label: "Sedentary",    description: "Little or no exercise",        multiplier: 1.2   },
  { label: "Light",        description: "1–3 days / week",              multiplier: 1.375 },
  { label: "Moderate",     description: "3–5 days / week",              multiplier: 1.55  },
  { label: "Very Active",  description: "6–7 days / week",              multiplier: 1.725 },
  { label: "Extra Active", description: "Hard training + physical job", multiplier: 1.9   },
];

// REMOVED: const AVG_STRIDE_M = 0.762;

// UPDATED: walkCalories now uses height-based stride length
function walkCalories(
  steps: number, 
  secs: number, 
  weightKg: number, 
  heightCm: number
): number {
  if (steps === 0 || secs === 0 || weightKg <= 0 || heightCm <= 0) {
    return 0;
  }

  // Stride length based on user's height (ACSM standard: 0.413 × height)
  const strideM = 0.413 * (heightCm / 100);

  // Distance covered in meters
  const distM = steps * strideM;

  // Walking speed (meters per minute)
  const speedMPM = distM / Math.max(1, secs / 60);

  // MET estimation using ACSM walking equation
  const MET = Math.max(2.0, (0.1 * speedMPM + 3.5) / 3.5);

  // Calories burned
  return Math.round(MET * weightKg * (secs / 3600));
}

function stdMacros(tdee: number) {
  return {
    carbs:   Math.round((tdee * 0.50) / 4),
    protein: Math.round((tdee * 0.20) / 4),
    fat:     Math.round((tdee * 0.30) / 9),
  };
}

// ─── Donut chart ─────────────────────────────────────────────────────────────
const DonutChart = ({
  segments,
  size = 160,
  strokeWidth = 18,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) => {
  const r     = (size - strokeWidth) / 2;
  const circ  = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset  = 0;
  return (
    <Svg width={size} height={size}>
      <Defs>
        {/* @ts-ignore */}
        <SvgGrad id="bg"><Stop offset="0" stopColor="rgba(255,255,255,0.05)" /></SvgGrad>
      </Defs>
      <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} fill="none" />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const rot  = (offset / total) * 360 - 90;
        offset += seg.value;
        return (
          <Circle
            key={i}
            cx={size/2} cy={size/2} r={r}
            stroke={seg.color} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation={rot} origin={`${size/2},${size/2}`}
          />
        );
      })}
    </Svg>
  );
};

// ─── Stat Row ─────────────────────────────────────────────────────────────────
const StatRow = ({ icon, label, value, unit, color, colors }: any) => (
  <View style={[sr.row, { borderBottomColor: colors.border }]}>
    <View style={[sr.iconWrap, { backgroundColor: color + "22" }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
    <Text style={[sr.label, { color: colors.sub }]}>{label}</Text>
    <Text style={[sr.value, { color }]}>{value}</Text>
    <Text style={[sr.unit, { color: colors.sub + "80" }]}>{unit}</Text>
  </View>
);
const sr = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10, borderBottomWidth: 1 },
  iconWrap:{ width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  label:   { flex: 1, fontSize: 13 },
  value:   { fontSize: 15, fontWeight: "800" },
  unit:    { fontSize: 11, marginLeft: 2, width: 46 },
});

// ─── Macro Progress Row (synced) ──────────────────────────────────────────────
type MacroRowProps = {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  kcalPer: number;
  colors: any;
};

const MacroProgressRow = ({ label, consumed, target, unit, color, kcalPer, colors }: MacroRowProps) => {
  const pct     = target > 0 ? Math.min(consumed / target, 1) : 0;
  const over    = consumed > target;
  const status  = over ? "Over" : consumed >= target * 0.9 ? "✓ Met" : `${Math.round(target - consumed)}${unit} left`;
  const statusColor = over ? "#ef4444" : consumed >= target * 0.9 ? "#22c55e" : colors.sub;

  return (
    <View style={mpr.wrap}>
      <View style={mpr.top}>
        <Text style={[mpr.label, { color }]}>{label}</Text>
        <Text style={[mpr.values, { color: colors.text }]}>
          <Text style={{ color, fontWeight: "800" }}>{Math.round(consumed)}</Text>
          <Text style={{ color: colors.sub }}> / {target}{unit}</Text>
        </Text>
        <Text style={[mpr.status, { color: statusColor }]}>{status}</Text>
      </View>
      <View style={[mpr.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            mpr.barFill,
            {
              width: `${Math.min(100, pct * 100)}%`,
              backgroundColor: over ? "#ef4444" : color,
            },
          ]}
        />
      </View>
      <Text style={[mpr.kcal, { color: colors.sub }]}>{Math.round(consumed * kcalPer)} kcal consumed · {Math.round(target * kcalPer)} kcal target</Text>
    </View>
  );
};
const mpr = StyleSheet.create({
  wrap:     { marginBottom: 16 },
  top:      { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  label:    { flex: 1, fontSize: 13, fontWeight: "700" },
  values:   { fontSize: 13 },
  status:   { fontSize: 11, fontWeight: "700", marginLeft: 10 },
  barTrack: { height: 6, borderRadius: 6, overflow: "hidden" },
  barFill:  { height: 6, borderRadius: 6 },
  kcal:     { fontSize: 10, marginTop: 3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function CalorieIntelligenceScreen() {
  const router  = useRouter();
  const { theme } = useTheme();
  
  const colors = theme === "light"
    ? {
        bg: "#f8fafc",
        card: "#ffffff",
        text: "#020617",
        sub: "#64748b",
        border: "#e2e8f0",
      }
    : {
        bg: "#020617",
        card: "#1e293b",
        text: "#f1f5f9",
        sub: "#94a3b8",
        border: "#334155",
      };

  const { weightKg, heightCm, ageYears, profile } = useProfile();
  const { steps, calories: stepCalFromContext, sessionSecs, isTracking } = useSteps();

  // ── Nutrition sync ────────────────────────────────────────────────────────
  const { totals, selectedProfile } = useNutrition();
  const rec = selectedProfile.recommendations;

  // ── Derived science ───────────────────────────────────────────────────────
  const bmr   = useMemo(() => calcBMR(weightKg, heightCm, ageYears, profile.gender), [weightKg, heightCm, ageYears, profile.gender]);
  
  // UPDATED: TDEE now uses activity multiplier from selected profile
  const activityMultiplier = selectedProfile?.activityMultiplier ?? 1.375;
  const tdee = useMemo(() => Math.round(bmr * activityMultiplier), [bmr, activityMultiplier]);
  
  const mac   = useMemo(() => stdMacros(tdee), [tdee]);
  const bmi   = useMemo(() => parseFloat((weightKg / ((heightCm / 100) ** 2)).toFixed(1)), [weightKg, heightCm]);

  const bmiStatus =
    bmi < 18.5 ? { label: "Underweight", color: "#4fc3f7" }
    : bmi < 25 ? { label: "Normal",      color: "#22c55e" }
    : bmi < 30 ? { label: "Overweight",  color: "#f59e0b" }
    :            { label: "Obese",        color: "#ef4444" };

  // UPDATED: walkCalories now includes heightCm parameter
  const stepCal = useMemo(
    () => walkCalories(steps, sessionSecs, weightKg, heightCm), 
    [steps, sessionSecs, weightKg, heightCm]
  );
  const netCal  = Math.max(0, tdee - stepCal);
  const burnPct = Math.min(1, stepCal / (tdee * 0.3));

  /* 🔹 Sync Calorie Data with Firebase */
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const syncCaloriesWithFirebase = async () => {
      try {
        const uid = await getUserId();
        if (!uid) return;

        const userRef = doc(db, "users", uid);

        // 🔹 Save calorie data to Firebase
        await setDoc(
          userRef,
          {
            caloriesBurned: stepCal,
            caloriesConsumed: totals.calories,
            tdee: tdee,
            bmr: bmr,
            steps: steps,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // 🔹 Real-time listener
        unsubscribe = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            console.log("🔥 Calorie data synced:", snapshot.data());
          }
        });
      } catch (error) {
        console.error("❌ Error syncing calorie data:", error);
      }
    };

    syncCaloriesWithFirebase();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [stepCal, totals.calories, tdee, bmr, steps]);

  // Calorie balance: TDEE vs what user has actually eaten
  const caloriesConsumed = totals.calories;
  const calorieDiff      = caloriesConsumed - rec.calories;
  const calorieStatus    = calorieDiff > 150
    ? { label: "Over target", color: "#ef4444" }
    : calorieDiff < -150
    ? { label: "Under target", color: "#4fc3f7" }
    : { label: "On track ✓", color: "#22c55e" };

  // ── Burn Goal calculations ────────────────────────────────────────────────
  // surplus = calories eaten - (profile target - already burned from steps)
  // i.e. how many MORE kcal the user needs to burn through exercise
  const alreadyBurned    = stepCal;
  const netSurplus       = Math.max(0, caloriesConsumed - rec.calories + alreadyBurned);
  // if consumed < target, show how many kcal remain to eat (deficit mode)
  const deficit          = Math.max(0, rec.calories - caloriesConsumed - alreadyBurned);
  const hasSurplus       = caloriesConsumed > 0 && netSurplus > 0;
  const hasDeficit       = caloriesConsumed > 0 && deficit > 0;

  // MET values for common activities
  const burnActivities = useMemo(() => {
    // kcal/min = MET × weightKg / 60
    const kcalPerMin = (met: number) => (met * weightKg) / 60;
    const minsNeeded = (met: number, kcal: number) =>
      kcal > 0 ? Math.ceil(kcal / kcalPerMin(met)) : 0;
    const stepsNeeded = (kcal: number) =>
      kcal > 0 ? Math.round((kcal / (0.57 * weightKg)) * 1000) : 0; // 0.57 kcal/kg/km × stride

    const target = hasSurplus ? netSurplus : 0;
    return [
      {
        label: "Walking",
        icon:  "walk",
        color: "#22c55e",
        met:   3.5,
        mins:  minsNeeded(3.5, target),
        steps: stepsNeeded(target),
        emoji: "🚶",
      },
      {
        label: "Jogging",
        icon:  "fitness",
        color: "#f97316",
        met:   7.0,
        mins:  minsNeeded(7.0, target),
        steps: stepsNeeded(target) / 2,
        emoji: "🏃",
      },
      {
        label: "Cycling",
        icon:  "bicycle",
        color: "#4fc3f7",
        met:   6.0,
        mins:  minsNeeded(6.0, target),
        steps: null,
        emoji: "🚴",
      },
      {
        label: "Swimming",
        icon:  "water",
        color: "#a78bfa",
        met:   8.0,
        mins:  minsNeeded(8.0, target),
        steps: null,
        emoji: "🏊",
      },
      {
        label: "Jump Rope",
        icon:  "flash",
        color: "#f59e0b",
        met:   11.0,
        mins:  minsNeeded(11.0, target),
        steps: null,
        emoji: "⚡",
      },
      {
        label: "Yoga",
        icon:  "leaf",
        color: "#10b981",
        met:   2.5,
        mins:  minsNeeded(2.5, target),
        steps: null,
        emoji: "🧘",
      },
    ];
  }, [weightKg, netSurplus, hasSurplus]);

  // Donut for ACTUAL consumed macros (from nutrition page)
  const consumedDonutSegments =
    totals.protein + totals.carbs + totals.fat > 0
      ? [
          { value: totals.carbs   * 4, color: "#f97316" },
          { value: totals.protein * 4, color: "#a78bfa" },
          { value: totals.fat     * 9, color: "#f59e0b" },
        ]
      : [{ value: 1, color: colors.border }];

  // Donut for recommended macro targets
  const targetDonutSegments = [
    { value: rec.carbs   * 4, color: "#f97316" },
    { value: rec.protein * 4, color: "#a78bfa" },
    { value: rec.fat     * 9, color: "#f59e0b" },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <LinearGradient colors={theme === "light" ? ["#e2e8f0", "#f8fafc", "#e2e8f0"] : ["#0a0a0f", "#1a0533", "#0a0a0f"]} style={s.header}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.border }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={[s.headerTitle, { color: colors.text }]}>CALORIE INTELLIGENCE</Text>
          <Text style={[s.headerSub, { color: colors.sub }]}>Synced with your nutrition log</Text>
        </View>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.border }]} onPress={() => router.push("/profile")}>
          <Ionicons name="person-outline" size={20} color={colors.sub} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile source banner */}
        <TouchableOpacity style={[s.profileBanner, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push("/profile")} activeOpacity={0.8}>
          <Ionicons name="person-circle" size={20} color={colors.sub} />
          <Text style={[s.profileBannerText, { color: colors.sub }]}>
            {weightKg} kg · {heightCm} cm · {profile.gender} · Age {ageYears}
          </Text>
          <Text style={[s.profileBannerEdit, { color: colors.sub }]}>Edit ›</Text>
        </TouchableOpacity>

        {/* Sync banner */}
        <View style={[s.syncBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.syncDot, { backgroundColor: "#22c55e" }]} />
          <Text style={[s.syncText, { color: colors.sub }]}>
            Synced with Nutrition · {selectedProfile.icon} {selectedProfile.label} profile
          </Text>
          <TouchableOpacity onPress={() => router.push({ pathname: "/twin", params: { mode: "routine", tab: "meal" } } as any)}>
            <Text style={[s.syncLink, { color: colors.sub }]}>Log food ›</Text>
          </TouchableOpacity>
        </View>

        {/* Live Burn Card */}
        <View style={[s.burnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.burnLeft}>
            <Text style={[s.burnLabel, { color: colors.sub }]}>CALORIES BURNED TODAY</Text>
            <Text style={[s.burnValue, { color: colors.text }]}>{stepCal}</Text>
            <Text style={[s.burnUnit, { color: colors.sub }]}>kcal from {steps.toLocaleString("en-IN")} steps</Text>
            {isTracking && (
              <View style={[s.livePill, { backgroundColor: colors.card }]}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            )}
            <View style={[s.burnBar, { backgroundColor: colors.border }]}>
              <View style={[s.burnFill, { width: `${Math.min(100, burnPct * 100)}%` }]} />
            </View>
            <Text style={[s.burnHint, { color: colors.sub }]}>Target: {Math.round(tdee * 0.3)} kcal from activity</Text>
          </View>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <DonutChart
              segments={[
                { value: stepCal || 1, color: colors.text },
                { value: Math.max(0, tdee * 0.3 - stepCal), color: colors.border },
              ]}
              size={120} strokeWidth={14}
            />
            <View style={{ position: "absolute" }}>
              <Text style={[s.donutPct, { color: colors.text }]}>{Math.round(burnPct * 100)}%</Text>
              <Text style={[s.donutLabel, { color: colors.sub }]}>target</Text>
            </View>
          </View>
        </View>

        {/* ── BURN GOAL CARD ─────────────────────────────────────────────────── */}
        {caloriesConsumed > 0 && (
          <View style={[s.burnGoalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {hasSurplus ? (
              <>
                {/* Surplus mode */}
                <View style={s.burnGoalHeader}>
                  <View style={[s.burnGoalIconWrap, { backgroundColor: colors.border }]}>
                    <Ionicons name="flame" size={22} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.burnGoalTitle, { color: colors.sub }]}>YOU NEED TO BURN</Text>
                    <View style={s.burnGoalAmountRow}>
                      <Text style={[s.burnGoalAmount, { color: colors.text }]}>{netSurplus}</Text>
                      <Text style={[s.burnGoalUnit, { color: colors.sub }]}> kcal more</Text>
                    </View>
                  </View>
                  <View style={s.burnGoalSummary}>
                    <Text style={[s.burnGoalSummaryLine, { color: colors.sub }]}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>{caloriesConsumed}</Text>
                      <Text> eaten</Text>
                    </Text>
                    <Text style={[s.burnGoalSummaryLine, { color: colors.sub }]}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>{alreadyBurned}</Text>
                      <Text> burned</Text>
                    </Text>
                    <Text style={[s.burnGoalSummaryLine, { color: colors.sub }]}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>{rec.calories}</Text>
                      <Text> target</Text>
                    </Text>
                  </View>
                </View>

                {/* Progress arc */}
                <View style={s.burnGoalBarWrap}>
                  <View style={[s.burnGoalBar, { backgroundColor: colors.border }]}>
                    <View style={[s.burnGoalBarFill, {
                      width: `${Math.min(100, (alreadyBurned / (alreadyBurned + netSurplus)) * 100)}%`,
                      backgroundColor: colors.text,
                    }]} />
                  </View>
                  <Text style={[s.burnGoalBarLabel, { color: colors.sub }]}>
                    {alreadyBurned} burned · {netSurplus} remaining
                  </Text>
                </View>

                {/* Activity breakdown */}
                <Text style={[s.burnGoalSubtitle, { color: colors.text }]}>
                  How to burn {netSurplus} kcal:
                </Text>
                <View style={s.burnActivityGrid}>
                  {burnActivities.map((act) => (
                    <View key={act.label} style={[s.burnActivityCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <Text style={s.burnActivityEmoji}>{act.emoji}</Text>
                      <Text style={[s.burnActivityLabel, { color: colors.text }]}>{act.label}</Text>
                      <Text style={[s.burnActivityMins, { color: colors.text }]}>{act.mins} min</Text>
                      {act.steps != null && (
                        <Text style={[s.burnActivitySteps, { color: colors.sub }]}>
                          ~{Math.round(act.steps).toLocaleString("en-IN")} steps
                        </Text>
                      )}
                    </View>
                  ))}
                </View>

                <Text style={[s.burnGoalNote, { color: colors.sub }]}>
                  * Based on your weight ({weightKg} kg) using MET values
                </Text>
              </>
            ) : hasDeficit ? (
              /* Deficit mode — user hasn't eaten enough */
              <>
                <View style={s.burnGoalHeader}>
                  <View style={[s.burnGoalIconWrap, { backgroundColor: colors.border }]}>
                    <Ionicons name="restaurant-outline" size={22} color={colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.burnGoalTitle, { color: colors.sub }]}>CALORIE DEFICIT</Text>
                    <View style={s.burnGoalAmountRow}>
                      <Text style={[s.burnGoalAmount, { color: colors.text }]}>{deficit}</Text>
                      <Text style={[s.burnGoalUnit, { color: colors.sub }]}> kcal under goal</Text>
                    </View>
                    <Text style={[s.burnGoalDeficitNote, { color: colors.sub }]}>
                      You've eaten {caloriesConsumed} kcal. Your target is {rec.calories} kcal.
                      Consider eating {deficit} more kcal today.
                    </Text>
                  </View>
                </View>
                <View style={s.burnGoalBarWrap}>
                  <View style={[s.burnGoalBar, { backgroundColor: colors.border }]}>
                    <View style={[s.burnGoalBarFill, {
                      width: `${Math.min(100, (caloriesConsumed / rec.calories) * 100)}%`,
                      backgroundColor: colors.text,
                    }]} />
                  </View>
                  <Text style={[s.burnGoalBarLabel, { color: colors.sub }]}>
                    {caloriesConsumed} / {rec.calories} kcal ({Math.round((caloriesConsumed / rec.calories) * 100)}%)
                  </Text>
                </View>
              </>
            ) : (
              /* On track */
              <View style={s.burnGoalOnTrack}>
                <Ionicons name="checkmark-circle" size={36} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.burnGoalOnTrackTitle, { color: colors.text }]}>You're on track! 🎯</Text>
                  <Text style={[s.burnGoalOnTrackSub, { color: colors.sub }]}>
                    {caloriesConsumed} kcal eaten · {alreadyBurned} kcal burned · {rec.calories} kcal target
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* BMR / TDEE */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.sub }]}>📊 DAILY ENERGY NEEDS</Text>
          <StatRow icon="body" label="Basal Metabolic Rate (BMR)" value={bmr} unit="kcal" color={colors.text} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <StatRow icon="flash" label="Total Daily Energy (TDEE)" value={tdee} unit="kcal" color={colors.text} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <StatRow icon="restaurant" label="Calories Consumed (today)" value={caloriesConsumed} unit="kcal" color={colors.text} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <StatRow icon="walk" label="Burned from Steps" value={stepCal} unit="kcal" color={colors.text} colors={colors} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <StatRow icon="analytics" label="Net Balance" value={Math.abs(calorieDiff)} unit="kcal" color={calorieStatus.color} colors={colors} />
          <View style={[s.statusPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[s.statusText, { color: calorieStatus.color }]}>{calorieStatus.label}</Text>
            <Text style={[s.statusSub, { color: colors.sub }]}>
              {caloriesConsumed} consumed · {rec.calories} target
            </Text>
          </View>
        </View>

        {/* ── MACRO TARGETS — SYNCED WITH NUTRITION PAGE ─────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.sub }]}>🍽️ MACRO TARGETS — SYNCED WITH NUTRITION</Text>
          <Text style={[s.syncNote, { color: colors.sub }]}>
            Profile: {selectedProfile.icon} {selectedProfile.label} · Update in Nutrition page
          </Text>

          {/* Side-by-side donuts: Consumed vs Target */}
          <View style={s.donutRow}>
            <View style={s.donutBox}>
              <DonutChart segments={consumedDonutSegments} size={110} strokeWidth={13} />
              <Text style={[s.donutBoxLabel, { color: colors.sub }]}>Consumed</Text>
              <Text style={[s.donutBoxKcal, { color: colors.text }]}>{caloriesConsumed} kcal</Text>
            </View>
            <View style={[s.donutDivider, { backgroundColor: colors.border }]} />
            <View style={s.donutBox}>
              <DonutChart segments={targetDonutSegments} size={110} strokeWidth={13} />
              <Text style={[s.donutBoxLabel, { color: colors.sub }]}>Target</Text>
              <Text style={[s.donutBoxKcal, { color: colors.text }]}>{rec.calories} kcal</Text>
            </View>
          </View>

          {/* Legend */}
          <View style={s.legend}>
            {[
              { label: "Carbs",   color: "#f97316" },
              { label: "Protein", color: "#a78bfa" },
              { label: "Fat",     color: "#f59e0b" },
            ].map((l) => (
              <View key={l.label} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: l.color }]} />
                <Text style={[s.legendLabel, { color: colors.sub }]}>{l.label}</Text>
              </View>
            ))}
          </View>

          {/* Per-macro progress rows */}
          <View style={{ marginTop: 20 }}>
            <MacroProgressRow
              label="Carbohydrates"
              consumed={totals.carbs}
              target={rec.carbs}
              unit="g"
              color="#f97316"
              kcalPer={4}
              colors={colors}
            />
            <MacroProgressRow
              label="Protein"
              consumed={totals.protein}
              target={rec.protein}
              unit="g"
              color="#a78bfa"
              kcalPer={4}
              colors={colors}
            />
            <MacroProgressRow
              label="Fat"
              consumed={totals.fat}
              target={rec.fat}
              unit="g"
              color="#f59e0b"
              kcalPer={9}
              colors={colors}
            />
            <MacroProgressRow
              label="Fiber"
              consumed={totals.fiber}
              target={rec.fiber}
              unit="g"
              color="#22c55e"
              kcalPer={0}
              colors={colors}
            />
            <MacroProgressRow
              label="Sugar"
              consumed={totals.sugar}
              target={rec.sugar}
              unit="g"
              color="#4fc3f7"
              kcalPer={4}
              colors={colors}
            />
            <MacroProgressRow
              label="Sodium"
              consumed={totals.sodium}
              target={rec.sodium}
              unit="mg"
              color="#ef4444"
              kcalPer={0}
              colors={colors}
            />
          </View>

          {totals.calories === 0 && (
            <TouchableOpacity style={s.emptyPrompt} onPress={() => router.push("/nutrition")}>
              <Ionicons name="add-circle-outline" size={28} color={colors.sub} />
              <Text style={[s.emptyPromptText, { color: colors.sub }]}>No food logged yet — tap to add meals</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* BMI */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.sub }]}>⚖️ BODY METRICS</Text>
          <View style={s.bmiRow}>
            <View style={s.bmiLeft}>
              <Text style={[s.bmiValue, { color: colors.text }]}>{bmi}</Text>
              <Text style={[s.bmiLabel, { color: colors.sub }]}>BMI</Text>
            </View>
            <View style={[s.bmiStatus, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Text style={[s.bmiStatusText, { color: colors.text }]}>{bmiStatus.label}</Text>
            </View>
            <View style={s.bmiRight}>
              <Text style={[s.bmiStat, { color: colors.text }]}>{weightKg} kg</Text>
              <Text style={[s.bmiStatLabel, { color: colors.sub }]}>Weight</Text>
            </View>
            <View style={s.bmiRight}>
              <Text style={[s.bmiStat, { color: colors.text }]}>{heightCm} cm</Text>
              <Text style={[s.bmiStatLabel, { color: colors.sub }]}>Height</Text>
            </View>
          </View>
          <View style={s.bmiScale}>
            {[
              { label: "Under", range: "<18.5", color: "#4fc3f7", active: bmi < 18.5 },
              { label: "Normal", range: "18.5–25", color: "#22c55e", active: bmi >= 18.5 && bmi < 25 },
              { label: "Over",  range: "25–30",  color: "#f59e0b", active: bmi >= 25  && bmi < 30 },
              { label: "Obese", range: "30+",    color: "#ef4444", active: bmi >= 30 },
            ].map((b) => (
              <View key={b.label} style={s.bmiScaleItem}>
                <View style={[s.bmiScaleDot, { backgroundColor: b.active ? b.color : colors.border, transform: [{ scale: b.active ? 1.3 : 1 }] }]} />
                <Text style={[s.bmiScaleLabel, b.active && { color: colors.text, fontWeight: "800" }, { color: colors.sub }]}>{b.label}</Text>
                <Text style={[s.bmiScaleRange, { color: colors.sub }]}>{b.range}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Activity levels */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.sub }]}>🏃 CALORIE BURN BY ACTIVITY</Text>
          {ACTIVITY_LEVELS.map((a) => (
            <View key={a.label} style={[s.actRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.actLabel, { color: colors.text }]}>{a.label}</Text>
                <Text style={[s.actDesc, { color: colors.sub }]}>{a.description}</Text>
              </View>
              <Text style={[s.actKcal, { color: colors.text }]}>{Math.round(bmr * a.multiplier)} kcal</Text>
            </View>
          ))}
          <Text style={[s.actNote, { color: colors.sub }]}>* Calculated using your BMR ({bmr} kcal)</Text>
        </View>

        {/* Personalised insights - UPDATED with height-based calorie calculation */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.sub }]}>💡 PERSONALISED INSIGHTS</Text>
          <Text style={[s.tip, { color: colors.sub }]}>• Your BMR is {bmr} kcal — calories you burn just existing</Text>
          <Text style={[s.tip, { color: colors.sub }]}>• Each kg of body weight ≈ {Math.round(bmr / weightKg)} kcal/day in BMR</Text>
          <Text style={[s.tip, { color: colors.sub }]}>
            • Walking 10,000 steps burns ≈{" "}
            {walkCalories(10000, 5400, weightKg, heightCm)} kcal for your body metrics
          </Text>
          <Text style={[s.tip, { color: colors.sub }]}>• To lose 0.5 kg/week, eat ~{tdee - 500} kcal/day</Text>
          <Text style={[s.tip, { color: colors.sub }]}>• You've consumed {caloriesConsumed} / {rec.calories} kcal target today ({Math.round((caloriesConsumed / rec.calories) * 100)}%)</Text>
        </View>

        {/* Profile link */}
        <TouchableOpacity style={[s.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push("/profile")}>
          <Ionicons name="create-outline" size={22} color={colors.sub} />
          <View style={{ flex: 1 }}>
            <Text style={[s.profileCardTitle, { color: colors.text }]}>Update Body Metrics</Text>
            <Text style={[s.profileCardSub, { color: colors.sub }]}>Change height/weight in Profile → Medical Information</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.sub} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: "900", fontSize: 15, letterSpacing: 2 },
  headerSub:   { fontSize: 11, marginTop: 2 },
  iconBtn:     { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  scroll:      { padding: 16, paddingTop: 8 },

  profileBanner:     { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, borderWidth: 1 },
  profileBannerText: { flex: 1, fontSize: 12 },
  profileBannerEdit: { fontWeight: "700", fontSize: 13 },

  syncBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14, borderWidth: 1 },
  syncDot:    { width: 7, height: 7, borderRadius: 4 },
  syncText:   { flex: 1, fontSize: 11 },
  syncLink:   { fontWeight: "700", fontSize: 12 },

  burnCard:  { borderRadius: 24, padding: 20, marginBottom: 14, flexDirection: "row", gap: 16, borderWidth: 1 },
  burnLeft:  { flex: 1 },
  burnLabel: { fontSize: 9, letterSpacing: 2, marginBottom: 4 },
  burnValue: { fontSize: 44, fontWeight: "900", lineHeight: 50 },
  burnUnit:  { fontSize: 11, marginBottom: 8 },
  livePill:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start", marginBottom: 8 },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText:  { color: "#22c55e", fontSize: 9, fontWeight: "800" },
  burnBar:   { height: 6, borderRadius: 6, overflow: "hidden", marginTop: 8 },
  burnFill:  { height: 6, backgroundColor: "#f97316", borderRadius: 6 },
  burnHint:  { fontSize: 10, marginTop: 5 },
  donutPct:  { fontSize: 18, fontWeight: "900", textAlign: "center" },
  donutLabel:{ fontSize: 9, textAlign: "center" },

  card:      { borderRadius: 20, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 10, letterSpacing: 2, marginBottom: 14 },
  divider:   { height: 1, marginVertical: 2 },

  statusPill: { borderRadius: 14, padding: 12, borderWidth: 1, marginTop: 12, alignItems: "center" },
  statusText: { fontSize: 14, fontWeight: "800" },
  statusSub:  { fontSize: 11, marginTop: 2 },

  syncNote:   { fontSize: 10, marginBottom: 14, fontStyle: "italic" },

  donutRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginBottom: 12 },
  donutBox:     { alignItems: "center", gap: 6 },
  donutBoxLabel:{ fontSize: 11 },
  donutBoxKcal: { fontSize: 13, fontWeight: "800" },
  donutDivider: { width: 1, height: 80 },

  legend:      { flexDirection: "row", justifyContent: "center", gap: 20 },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },

  emptyPrompt:     { alignItems: "center", paddingVertical: 20, gap: 8 },
  emptyPromptText: { fontSize: 13, textAlign: "center" },

  bmiRow:       { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  bmiLeft:      { alignItems: "center" },
  bmiValue:     { fontSize: 32, fontWeight: "900" },
  bmiLabel:     { fontSize: 10, letterSpacing: 1 },
  bmiStatus:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  bmiStatusText:{ fontSize: 12, fontWeight: "700" },
  bmiRight:     { alignItems: "center", flex: 1 },
  bmiStat:      { fontSize: 16, fontWeight: "800" },
  bmiStatLabel: { fontSize: 10 },
  bmiScale:     { flexDirection: "row", justifyContent: "space-between" },
  bmiScaleItem: { alignItems: "center", gap: 4 },
  bmiScaleDot:  { width: 10, height: 10, borderRadius: 5 },
  bmiScaleLabel:{ fontSize: 10 },
  bmiScaleRange:{ fontSize: 9 },

  actRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  actLabel: { fontSize: 13, fontWeight: "600" },
  actDesc:  { fontSize: 11, marginTop: 1 },
  actKcal:  { fontSize: 14, fontWeight: "800" },
  actNote:  { fontSize: 10, marginTop: 10 },

  tip:          { fontSize: 12, marginBottom: 7, lineHeight: 18 },

  // ── Burn Goal Card ───────────────────────────────────────────────────────
  burnGoalCard:         { borderRadius: 24, padding: 20, marginBottom: 14, borderWidth: 1 },
  burnGoalHeader:       { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  burnGoalIconWrap:     { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  burnGoalTitle:        { fontSize: 9, letterSpacing: 2, marginBottom: 2 },
  burnGoalAmountRow:    { flexDirection: "row", alignItems: "baseline" },
  burnGoalAmount:       { fontSize: 36, fontWeight: "900", lineHeight: 40 },
  burnGoalUnit:         { fontSize: 13 },
  burnGoalSummary:      { alignItems: "flex-end", gap: 3 },
  burnGoalSummaryLine:  { fontSize: 12 },
  burnGoalBarWrap:      { marginBottom: 16 },
  burnGoalBar:          { height: 8, borderRadius: 8, overflow: "hidden", marginBottom: 5 },
  burnGoalBarFill:      { height: 8, borderRadius: 8 },
  burnGoalBarLabel:     { fontSize: 10 },
  burnGoalSubtitle:     { fontSize: 12, marginBottom: 12, fontWeight: "600" },
  burnActivityGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  burnActivityCard:     { width: "30%", borderRadius: 16, padding: 12, alignItems: "center", borderWidth: 1, gap: 3 },
  burnActivityEmoji:    { fontSize: 22 },
  burnActivityLabel:    { fontSize: 11, fontWeight: "700" },
  burnActivityMins:     { fontSize: 15, fontWeight: "900" },
  burnActivitySteps:    { fontSize: 9, textAlign: "center" },
  burnGoalNote:         { fontSize: 10, fontStyle: "italic" },
  burnGoalDeficitNote:  { fontSize: 11, marginTop: 4, lineHeight: 16 },
  burnGoalOnTrack:      { flexDirection: "row", alignItems: "center", gap: 14 },
  burnGoalOnTrackTitle: { fontSize: 16, fontWeight: "800" },
  burnGoalOnTrackSub:   { fontSize: 11, marginTop: 3 },

  profileCard:     { borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1 },
  profileCardTitle:{ fontWeight: "700", fontSize: 14 },
  profileCardSub:  { fontSize: 11, marginTop: 2 },
});