// app/step-intelligence.tsx

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";

import { useProfile } from "../context/ProfileContext";
import { useSteps } from "../context/StepContext";
import { useTheme } from "../context/ThemeContext";


// ── Circular ring ──────────────────────────────────────────────────────────────
const Ring = ({ progress, size, strokeWidth, color, children }: any) => {
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(progress, 1);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <SvgGrad id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.5" />
          </SvgGrad>
        </Defs>
        <Circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size/2} cy={size/2} r={r}
          stroke="url(#g)" strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          rotation="-90" origin={`${size/2},${size/2}`}
        />
      </Svg>
      {children}
    </View>
  );
};

// ── Stat tile ──────────────────────────────────────────────────────────────────
const Tile = ({ icon, label, value, unit, color, colors }: any) => (
  <View style={[tile.wrap, { backgroundColor: colors.card }]}>
    <View style={tile.iconContainer}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.accent || "#4f46e5"} />
    </View>
    <Text style={[tile.value, { color }]}>{value}</Text>
    <Text style={[tile.unit,  { color: colors.subText }]}>{unit}</Text>
    <Text style={[tile.label, { color: colors.subText }]}>{label}</Text>
  </View>
);
const tile = StyleSheet.create({
  wrap:  { flex: 1, borderRadius: 18, padding: 14, alignItems: "center", marginHorizontal: 4 },
  iconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(99, 102, 241, 0.08)", justifyContent: "center", alignItems: "center", marginBottom: 6 },
  value: { fontSize: 18, fontWeight: "900" },
  unit:  { fontSize: 9,  marginTop: 1 },
  label: { fontSize: 9,  marginTop: 3, letterSpacing: 0.8 },
});

// ── Zone helper ────────────────────────────────────────────────────────────────
const getZone = (steps: number, goal: number) => {
  const p = steps / goal;
  if (steps === 0) return { label: "IDLE",       color: "#475569", icon: "sleep" };
  if (p < 0.3)     return { label: "SEDENTARY",  color: "#ef4444", icon: "shoe-print" };
  if (p < 0.6)     return { label: "LOW",        color: "#f97316", icon: "walk" };
  if (p < 0.8)     return { label: "MODERATE",   color: "#f59e0b", icon: "run" };
  if (p < 1.0)     return { label: "ACTIVE",     color: "#22c55e", icon: "lightning-bolt" };
  return                  { label: "GOAL MET ✓", color: "#10b981", icon: "trophy" };
};

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function StepIntelligenceScreen() {
  const router    = useRouter();
  const { theme } = useTheme();

  const colors = theme === "light"
    ? { background: "#f8fafc", card: "#ffffff", text: "#020617", subText: "#64748b", border: "#e2e8f0", headerGradient: ["#6366f1","#4f46e5"] as const }
    : { background: "#0D0D0F", card: "rgba(255,255,255,0.04)", text: "#ffffff", subText: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.08)", headerGradient: ["#0f0c29","#302b63"] as const };

  const { weightKg, heightCm, profile } = useProfile();
  const {
    steps, calories, distanceKm, goal, sessionSecs,
    isTracking, dataSource, lastSyncAt, weeklySteps, refreshHistory,
    setGoal, startTracking, stopTracking, resetToday,
  } = useSteps();

  const todayStr = () => new Date().toISOString().slice(0, 10);

  useEffect(() => {
    refreshHistory().catch(() => {});
  }, [refreshHistory, steps]);

  // Derived from new API
  const usingFallback = dataSource === 'SENSOR_FUSION';
  const sourceLabel = dataSource === 'STEP_SENSOR'
    ? '🦾 Hardware step counter'
    : dataSource === 'HEALTH_CONNECT'
    ? '❤️ Health Connect'
    : dataSource === 'PEDOMETER'
    ? '🍎 HealthKit pedometer'
    : '📱 Accelerometer (software)';
  const lastSyncLabel = lastSyncAt > 0
    ? `Synced ${Math.round((Date.now() - lastSyncAt) / 1000)}s ago`
    : 'Not yet synced';

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalInput,     setGoalInput]     = useState(goal.toString());
  const [sedMins,       setSedMins]       = useState(0);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const lastMoveTs = useRef(Date.now());
  const prevSteps  = useRef(steps);

  // Track last movement for sedentary UI
  useEffect(() => {
    if (steps > prevSteps.current) {
      lastMoveTs.current = Date.now();
      prevSteps.current  = steps;
    }
  }, [steps]);

  useEffect(() => { setGoalInput(goal.toString()); }, [goal]);

  // Sedentary UI counter
  useEffect(() => {
    if (!isTracking) { setSedMins(0); return; }
    const t = setInterval(() => {
      setSedMins(Math.floor((Date.now() - lastMoveTs.current) / 60000));
    }, 30000);
    return () => clearInterval(t);
  }, [isTracking]);

  // Pulse animation
  useEffect(() => {
    if (isTracking) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isTracking, pulseAnim]);

  const saveGoal = useCallback(() => {
    const n = parseInt(goalInput, 10);
    if (!isNaN(n) && n >= 500 && n <= 100000) { setGoal(n); setGoalModalOpen(false); }
    else Alert.alert("Invalid Goal", "Enter a number between 500 and 100,000");
  }, [goalInput, setGoal]);

  const zone       = getZone(steps, goal);
  const progress   = steps / goal;
  const mins       = Math.floor(sessionSecs / 60);
  const secs       = sessionSecs % 60;
  const sessionFmt = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  const pace       = distanceKm > 0.05 ? Math.round((sessionSecs / 60) / distanceKm) : 0;
  const sedColor   = sedMins >= 60 ? "#ef4444" : sedMins >= 30 ? "#f59e0b" : "#22c55e";
  const strideM    = heightCm > 0 ? (0.413 * (heightCm / 100)).toFixed(2) : "0.76";

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <LinearGradient colors={colors.headerGradient} style={s.header}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: "rgba(255, 255, 255, 0.12)" }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={[s.headerTitle, { color: "#ffffff" }]}>STEP INTELLIGENCE</Text>
          <Text style={[s.headerSub, { color: "rgba(255, 255, 255, 0.7)" }]}>
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: "rgba(255, 255, 255, 0.12)" }]}
          onPress={() => Alert.alert("Reset Today", "Clear today's steps?", [
            { text: "Cancel", style: "cancel" },
            { text: "Reset",  style: "destructive", onPress: resetToday },
          ])}
        >
          <Ionicons name="refresh" size={20} color="#ffffff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Tracking banner */}
        {isTracking && (
          <View style={[s.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="radio" size={13} color="#22c55e" />
            <Text style={[s.bannerText, { color: colors.text }]}>
              {sourceLabel}
            </Text>
          </View>
        )}

        {/* Sync status */}
        <View style={[s.syncRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="cloud-done-outline" size={11} color={colors.subText} />
          <Text style={[s.syncText, { color: colors.subText }]}>{lastSyncLabel}</Text>
        </View>

        {/* ── STEP COUNT DEBUG ROW — always visible so you can confirm data flow ── */}
        <View style={[s.debugRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.debugLabel, { color: colors.subText }]}>STEPS TODAY</Text>
          <Text style={[s.debugCount, { color: zone.color }]}>
            {steps.toLocaleString("en-IN")}
          </Text>
          <Text style={[s.debugLabel, { color: colors.subText }]}>
            {isTracking ? "● LIVE" : "● PAUSED"}
          </Text>
        </View>

        {/* Main ring */}
        <View style={s.centre}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ring progress={progress} size={240} strokeWidth={16} color={zone.color}>
              <View style={[s.ringInner, { backgroundColor: colors.card }]}>
                <View style={s.zoneIconContainer}>
                  <MaterialCommunityIcons name={zone.icon as any} size={28} color={zone.color} />
                </View>
                <Text style={[s.stepCount, { color: zone.color }]}>
                  {steps.toLocaleString("en-IN")}
                </Text>
                <Text style={[s.stepWord, { color: colors.subText }]}>STEPS</Text>
                <View style={[s.zonePill, { backgroundColor: zone.color + "22", borderColor: zone.color }]}>
                  <Text style={[s.zoneText, { color: zone.color }]}>{zone.label}</Text>
                </View>
              </View>
            </Ring>
          </Animated.View>

          <Text style={[s.goalRemain, { color: colors.subText }]}>
            {steps >= goal
              ? "🎉 Daily goal achieved!"
              : `${(goal - steps).toLocaleString("en-IN")} steps to goal`}
          </Text>

          <View style={s.goalRow}>
            <TouchableOpacity
              style={[s.pillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setGoalInput(goal.toString()); setGoalModalOpen(true); }}
            >
              <Ionicons name="flag-outline" size={13} color={colors.subText} />
              <Text style={[s.pillBtnText, { color: colors.text }]}>Goal: {goal.toLocaleString("en-IN")}</Text>
              <Ionicons name="pencil-outline" size={11} color={colors.subText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.pillBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("./calorie-intelligence")}
            >
              <Ionicons name="flame-outline" size={13} color={colors.subText} />
              <Text style={[s.pillBtnText, { color: colors.text }]}>KCAL Details</Text>
              <Ionicons name="chevron-forward" size={11} color={colors.subText} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Session clock */}
        <View style={s.clockRow}>
          <Ionicons name={isTracking ? "timer" : "timer-outline"} size={14} color={colors.subText} />
          <Text style={[s.clockText, { color: colors.subText }]}>Session  {sessionFmt}</Text>
          {isTracking && sedMins > 0 && (
            <View style={[s.sedPill, { backgroundColor: sedColor + "22" }]}>
              <Text style={[s.sedPillText, { color: sedColor }]}>Idle {sedMins}m</Text>
            </View>
          )}
        </View>

        {/* Stat tiles */}
        <View style={s.tilesRow}>
          <Tile icon="map-marker" label="DISTANCE" value={distanceKm.toFixed(2)}        unit="KM"     color={colors.text} colors={colors} />
          <Tile icon="fire" label="CALORIES" value={calories}                      unit="KCAL"   color={colors.text} colors={colors} />
          <Tile icon="speedometer" label="PACE"      value={pace > 0 ? `${pace}` : "--"}  unit="MIN/KM" color={colors.text} colors={colors} />
        </View>

        {/* Profile row */}
        <TouchableOpacity
          style={[s.profileRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/profile")}
          activeOpacity={0.7}
        >
          <Ionicons name="person-circle-outline" size={16} color={colors.subText} />
          <Text style={[s.profileText, { color: colors.subText }]}>
            Stride {strideM}m · {weightKg}kg · {profile?.gender || ""}
          </Text>
          <Text style={[s.profileEdit, { color: colors.subText }]}>Edit profile ›</Text>
        </TouchableOpacity>

        {/* Progress bar */}
        <View style={[s.progressCard, { backgroundColor: colors.card }]}>
          <View style={s.progressHead}>
            <Text style={[s.progressLbl, { color: colors.subText }]}>DAILY PROGRESS</Text>
            <Text style={[s.progressPct, { color: zone.color }]}>
              {Math.min(100, Math.round(progress * 100))}%
            </Text>
          </View>
          <View style={[s.progressBg, { backgroundColor: colors.border }]}>
            <View style={[s.progressFill, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: zone.color }]} />
          </View>
          <View style={s.milestones}>
            {[0.25, 0.5, 0.75, 1].map((p) => {
              const n = Math.round(goal * p);
              return (
                <View key={p} style={s.ms}>
                  <View style={[s.msDot, { backgroundColor: steps >= n ? zone.color : colors.border }]} />
                  <Text style={[s.msLabel, { color: colors.subText }]}>
                    {n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Sedentary card */}
        <View style={[s.sedCard, { backgroundColor: colors.card, borderColor: sedColor + "55" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[s.sedIcon, { backgroundColor: sedColor + "22" }]}>
              <Ionicons
                name={sedMins >= 60 ? "alert-circle" : sedMins >= 30 ? "warning" : "checkmark-circle"}
                size={22} color={sedColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sedTitle, { color: colors.text }]}>
                {sedMins >= 60 ? "⚠️ Sedentary Alert"
                  : sedMins >= 30 ? "🟡 Getting Inactive"
                  : isTracking   ? "🟢 Movement Detected"
                  :                "⏸ Recording Inactive"}
              </Text>
              <Text style={[s.sedSub, { color: colors.subText }]}>
                {sedMins >= 60 ? `${sedMins} mins idle — you were notified`
                  : sedMins >= 30 ? `Alert in ${60 - sedMins} mins`
                  : isTracking   ? "Alert after 1 hr of no movement"
                  :                "Tap START RECORDING to allow permissions and begin tracking"}
              </Text>
            </View>
          </View>
          {isTracking && (
            <View style={[s.progressBg, { backgroundColor: colors.border, marginTop: 10 }]}>
              <View style={[s.progressFill, { width: `${Math.min(100, (sedMins / 60) * 100)}%`, backgroundColor: sedColor }]} />
            </View>
          )}
        </View>

        {/* Weekly steps history */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.subText }]}>WEEKLY HISTORY</Text>
          {weeklySteps && weeklySteps.length > 0 ? (
            <View>
              {/* Stats Summary */}
              <View style={s.historySummaryRow}>
                <View>
                  <Text style={[s.historySummaryVal, { color: colors.text }]}>
                    {Math.round(weeklySteps.reduce((acc, curr) => acc + curr.steps, 0)).toLocaleString("en-IN")}
                  </Text>
                  <Text style={[s.historySummaryLbl, { color: colors.subText }]}>Total Steps (7d)</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.historySummaryVal, { color: colors.text }]}>
                    {Math.round(weeklySteps.reduce((acc, curr) => acc + curr.steps, 0) / weeklySteps.length).toLocaleString("en-IN")}
                  </Text>
                  <Text style={[s.historySummaryLbl, { color: colors.subText }]}>Daily Average</Text>
                </View>
              </View>

              {/* Bar Chart */}
              <View style={s.chartContainer}>
                {weeklySteps.map((day, idx) => {
                  const maxSteps = Math.max(...weeklySteps.map(d => d.steps), 1000);
                  const barHeight = Math.max(10, (day.steps / maxSteps) * 80);
                  const isToday = day.date === todayStr();
                  const dayName = new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();

                  return (
                    <View key={day.date} style={s.chartColumn}>
                      <Text style={[s.chartBarValue, { color: isToday ? zone.color : colors.subText }]}>
                        {day.steps >= 1000 ? `${(day.steps / 1000).toFixed(1)}k` : day.steps}
                      </Text>
                      <View style={[s.chartBarBg, { backgroundColor: colors.border }]}>
                        <LinearGradient
                          colors={isToday ? [zone.color, zone.color + "88"] : ["#6366f1", "#4f46e5"]}
                          style={[s.chartBarFill, { height: barHeight }]}
                        />
                      </View>
                      <Text style={[s.chartDayLabel, { color: isToday ? zone.color : colors.subText, fontWeight: isToday ? "bold" : "normal" }]}>
                        {dayName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={s.noHistoryContainer}>
              <Ionicons name="stats-chart-outline" size={24} color={colors.subText} style={{ marginBottom: 8 }} />
              <Text style={[s.noHistoryText, { color: colors.subText }]}>No step history recorded yet.</Text>
            </View>
          )}
        </View>

        {/* Activity zones */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.subText }]}>ACTIVITY ZONES</Text>
          {[
            { l: "Sedentary", r: `< ${Math.round(goal * 0.3).toLocaleString()}`,   c: "#ef4444" },
            { l: "Low",       r: `${Math.round(goal * 0.3).toLocaleString()} – ${Math.round(goal * 0.6).toLocaleString()}`, c: "#f97316" },
            { l: "Moderate",  r: `${Math.round(goal * 0.6).toLocaleString()} – ${Math.round(goal * 0.8).toLocaleString()}`, c: "#f59e0b" },
            { l: "Active",    r: `${Math.round(goal * 0.8).toLocaleString()} – ${goal.toLocaleString()}`, c: "#22c55e" },
            { l: "Goal Met",  r: `${goal.toLocaleString()}+`, c: "#10b981" },
          ].map((z) => (
            <View key={z.l} style={s.zoneRow}>
              <View style={[s.zoneDot, { backgroundColor: z.c }]} />
              <Text style={[s.zoneName, { color: colors.text }]}>{z.l}</Text>
              <Text style={[s.zoneRange, { color: colors.subText }]}>{z.r}</Text>
              {zone.label.startsWith(z.l) && steps > 0 && (
                <View style={[s.youTag, { backgroundColor: z.c + "22" }]}>
                  <Text style={[s.youText, { color: z.c }]}>YOU</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Source indicator */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.subText }]}>💡 INSIGHTS</Text>
          <Text style={[s.tip, { color: colors.subText }]}>
            • Source: {sourceLabel}
          </Text>
          <Text style={[s.tip, { color: colors.subText }]}>• Steps update in real-time from native sensor</Text>
          <Text style={[s.tip, { color: colors.subText }]}>• Stride estimated from your height ({heightCm}cm → {strideM}m)</Text>
          <Text style={[s.tip, { color: colors.subText }]}>• Calories personalised to your weight ({weightKg}kg)</Text>
          <Text style={[s.tip, { color: colors.subText }]}>• Stand up every 30–60 mins to reduce sedentary risk</Text>
          <Text style={[s.tip, { color: colors.subText }]}>• Tracking survives screen-off, lock, swipe-away</Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <View style={s.fabWrap}>
        {isTracking ? (
          <TouchableOpacity
            style={s.fab}
            activeOpacity={0.85}
            onPress={() => Alert.alert("Step Recording Active", "Step recording runs continuously in the background to automatically track your daily steps.")}
          >
            <LinearGradient
              colors={["#10b981", "#059669"]}
              style={s.fabInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={s.fabText}>RECORDING ACTIVE</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.fab} activeOpacity={0.85} onPress={startTracking}>
            <LinearGradient
              colors={["#6366f1", "#4f46e5"]}
              style={s.fabInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name="walk" size={24} color="#fff" />
              <Text style={s.fabText}>START RECORDING</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Goal modal */}
      <Modal visible={goalModalOpen} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setGoalModalOpen(false)} />
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>🎯 Daily Step Goal</Text>
            <Text style={[s.modalSub, { color: colors.subText }]}>Current: {goal.toLocaleString("en-IN")} steps</Text>
            <View style={s.presetsRow}>
              {[5000, 7500, 10000, 15000].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.preset, { backgroundColor: colors.border }, goalInput === p.toString() && s.presetActive]}
                  onPress={() => setGoalInput(p.toString())}
                >
                  <Text style={[s.presetText, { color: colors.subText }, goalInput === p.toString() && s.presetTextActive]}>
                    {(p / 1000).toFixed(1)}k
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.goalInput, { backgroundColor: colors.border, color: colors.text, borderColor: colors.border }]}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="numeric"
              placeholder="Custom goal"
              placeholderTextColor={colors.subText}
              returnKeyType="done"
              onSubmitEditing={saveGoal}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.border }]} onPress={() => setGoalModalOpen(false)}>
                <Text style={[s.cancelText, { color: colors.subText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.text }]} onPress={saveGoal}>
                <Text style={[s.saveText, { color: colors.background }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1 },
  header:      { paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: "900", fontSize: 15, letterSpacing: 2 },
  headerSub:   { fontSize: 11, marginTop: 2 },
  iconBtn:     { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  scroll:      { paddingHorizontal: 16, paddingTop: 8 },

  syncRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  syncText:   { fontSize: 10 },

  banner:     { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  bannerText: { fontSize: 11, flex: 1 },

  // ── Debug row — big and visible, remove once satisfied ──
  debugRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, marginBottom: 12 },
  debugLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  debugCount: { fontSize: 36, fontWeight: "900" },

  centre:    { alignItems: "center", marginVertical: 6 },
  ringInner: { width: 190, height: 190, borderRadius: 95, justifyContent: "center", alignItems: "center", gap: 2 },
  zoneIconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(99, 102, 241, 0.08)", justifyContent: "center", alignItems: "center", marginBottom: 4 },
  stepCount: { fontSize: 44, fontWeight: "900", lineHeight: 50 },
  stepWord:  { fontSize: 10, letterSpacing: 5 },
  zonePill:  { marginTop: 7, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 18, borderWidth: 1 },
  zoneText:  { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  goalRemain:{ fontSize: 12, marginTop: 12 },
  goalRow:   { flexDirection: "row", gap: 10, marginTop: 10 },
  pillBtn:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  pillBtnText:{ fontSize: 11, fontWeight: "700" },

  clockRow:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  clockText:  { fontSize: 13 },
  sedPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sedPillText:{ fontSize: 10, fontWeight: "700" },

  tilesRow:   { flexDirection: "row", marginBottom: 10 },

  profileRow:  { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 12, borderWidth: 1 },
  profileText: { flex: 1, fontSize: 11 },
  profileEdit: { fontSize: 11, fontWeight: "700" },

  progressCard: { borderRadius: 18, padding: 16, marginBottom: 10 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  progressLbl:  { fontSize: 9, letterSpacing: 2 },
  progressPct:  { fontSize: 13, fontWeight: "800" },
  progressBg:   { height: 7, borderRadius: 7, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 7 },
  milestones:   { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  ms:           { alignItems: "center", gap: 3 },
  msDot:        { width: 6, height: 6, borderRadius: 3 },
  msLabel:      { fontSize: 8 },

  sedCard:  { borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1 },
  sedIcon:  { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  sedTitle: { fontWeight: "700", fontSize: 13 },
  sedSub:   { fontSize: 11, marginTop: 2 },

  card:      { borderRadius: 18, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 9, letterSpacing: 2, marginBottom: 12 },
  zoneRow:   { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  zoneDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  zoneName:  { fontSize: 12, fontWeight: "600", width: 74 },
  zoneRange: { fontSize: 11, flex: 1 },
  youTag:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  youText:   { fontSize: 9, fontWeight: "800" },
  tip:       { fontSize: 12, marginBottom: 6, lineHeight: 18 },

  fabWrap:  { position: "absolute", bottom: 28, left: 16, right: 16 },
  fab:      { borderRadius: 30, overflow: "hidden" },
  fabInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 18 },
  fabText:  { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 1 },

  modalOverlay:    { flex: 1, justifyContent: "flex-end" },
  modalCard:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 26, paddingBottom: 40 },
  modalTitle:      { fontSize: 20, fontWeight: "900", textAlign: "center" },
  modalSub:        { fontSize: 13, textAlign: "center", marginTop: 5, marginBottom: 18 },
  presetsRow:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  preset:          { flex: 1, marginHorizontal: 4, paddingVertical: 11, borderRadius: 14, alignItems: "center" },
  presetActive:    { borderWidth: 1, borderColor: "#a78bfa" },
  presetText:      { fontSize: 14, fontWeight: "700" },
  presetTextActive:{ color: "#a78bfa" },
  goalInput:       { borderRadius: 14, padding: 14, fontSize: 18, textAlign: "center", marginBottom: 18, borderWidth: 1 },
  modalBtns:       { flexDirection: "row", gap: 10 },
  cancelBtn:       { flex: 1, padding: 15, borderRadius: 18, alignItems: "center" },
  cancelText:      { fontWeight: "700" },
  saveBtn:         { flex: 1, padding: 15, borderRadius: 18, alignItems: "center" },
  saveText:        { fontWeight: "900" },

  // Weekly history styles
  historySummaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, paddingHorizontal: 4 },
  historySummaryVal: { fontSize: 18, fontWeight: "900" },
  historySummaryLbl: { fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  chartContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 110, paddingTop: 10, paddingBottom: 5 },
  chartColumn: { alignItems: "center", flex: 1 },
  chartBarValue: { fontSize: 8, fontWeight: "700", marginBottom: 4 },
  chartBarBg: { width: 14, height: 80, borderRadius: 7, overflow: "hidden", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 7 },
  chartDayLabel: { fontSize: 8, marginTop: 6, letterSpacing: 0.5 },
  noHistoryContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  noHistoryText: { fontSize: 12 },
});